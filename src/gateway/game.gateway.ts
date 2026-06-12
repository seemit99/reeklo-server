import { Injectable, Logger } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import {
  ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit,
  SubscribeMessage, WebSocketGateway, WebSocketServer,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { PrismaService } from '../prisma/prisma.service'
import { Member, PlazaRosterService } from './plaza-roster.service'

/**
 * Spring STOMP 핸들러 4종(PlazaUserHandler/PositionHandler/ChatController/RoomHandler/WebRTC)을
 * Socket.IO 이벤트로 포팅. 토픽 → room, /user/queue → userId별 소켓 직송.
 *
 * 이벤트 프로토콜 (STOMP destination → Socket.IO event):
 *  C→S: plaza:join / plaza:leave / plaza:position / plaza:chat
 *       room:join / room:leave / room:chat
 *       webrtc:offer / webrtc:answer / webrtc:ice
 *  S→C: plaza:roster(입장자 본인) / plaza:users / plaza:positions / plaza:chat
 *       room:event / room:chat / webrtc:signal
 */
@Injectable()
@WebSocketGateway({ path: '/ws', cors: { origin: true, credentials: true } })
export class GameGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server
  private readonly logger = new Logger('GameGateway')

  // userId → 소켓들 (WebRTC 1:1 직송용; 중복 탭 대비 Set)
  private readonly userSockets = new Map<string, Set<Socket>>()

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly roster: PlazaRosterService,
  ) {}

  afterInit(server: Server) {
    // 핸드셰이크에서 JWT 검증 — 무토큰/무효 토큰은 연결 거부 (Spring StompAuthChannelInterceptor와 동일)
    server.use((socket, next) => {
      try {
        const raw =
          socket.handshake.auth?.token ??
          (socket.handshake.headers.authorization ?? '').replace(/^Bearer /, '')
        const payload = this.jwt.verify(raw, { algorithms: ['HS256', 'HS384', 'HS512'] } as any)
        socket.data.userId = String(payload.sub)
        next()
      } catch {
        next(new Error('유효한 인증 토큰이 필요합니다.'))
      }
    })
  }

  handleConnection(socket: Socket) {
    const userId = socket.data.userId as string
    let set = this.userSockets.get(userId)
    if (!set) {
      set = new Set()
      this.userSockets.set(userId, set)
    }
    set.add(socket)
  }

  async handleDisconnect(socket: Socket) {
    const userId = socket.data.userId as string
    const set = this.userSockets.get(userId)
    if (set) {
      set.delete(socket)
      if (set.size === 0) this.userSockets.delete(userId)
    }
    // 광장에 입장한 채 끊겼으면 자동 퇴장 (Spring SessionDisconnectEvent와 동일)
    const plazaId = socket.data.plazaId as string | undefined
    if (plazaId) {
      socket.data.plazaId = undefined
      await this.leavePlaza(plazaId, userId, null)
    }
  }

  // ── 광장 ──────────────────────────────────────────────

  @SubscribeMessage('plaza:join')
  async onPlazaJoin(@ConnectedSocket() socket: Socket, @MessageBody() body: any) {
    const userId = socket.data.userId as string
    const plazaId = String(body.plazaId)

    // 기존 접속자 명단을 새 유저에게 먼저 전송 (닉네임/파츠/마지막 위치 포함)
    socket.emit('plaza:roster', this.roster.getMembers(plazaId, userId))

    const member: Member = {
      userId,
      nickname: body.nickname ?? null,
      parts: body.parts ?? null,
      layerOrder: body.layerOrder ?? null,
      rigPivots: body.rigPivots ?? null,
      position: null,
    }
    // 이미 입장한 유저면 DB 업데이트 스킵
    if (this.roster.add(plazaId, member)) {
      await this.prisma.plazas
        .update({ where: { id: Number(plazaId) }, data: { current_users: { increment: 1 } } })
        .catch(() => {})
    }

    socket.join(`plaza:${plazaId}`)
    socket.data.plazaId = plazaId

    this.server.to(`plaza:${plazaId}`).emit('plaza:users', {
      type: 'joined',
      userId,
      nickname: member.nickname,
      parts: member.parts,
      layerOrder: member.layerOrder,
      rigPivots: member.rigPivots,
    })
  }

  @SubscribeMessage('plaza:leave')
  async onPlazaLeave(@ConnectedSocket() socket: Socket, @MessageBody() body: any) {
    const userId = socket.data.userId as string
    const plazaId = String(body.plazaId)
    socket.leave(`plaza:${plazaId}`)
    if (socket.data.plazaId === plazaId) socket.data.plazaId = undefined
    await this.leavePlaza(plazaId, userId, body.nickname ?? null)
  }

  private async leavePlaza(plazaId: string, userId: string, nickname: string | null) {
    if (this.roster.remove(plazaId, userId)) {
      await this.prisma
        .$executeRaw`UPDATE plazas SET current_users = GREATEST(current_users - 1, 0) WHERE id = ${Number(plazaId)}`
        .catch(() => {})
    }
    this.server.to(`plaza:${plazaId}`).emit('plaza:users', {
      type: 'left', userId, nickname, parts: null, layerOrder: null, rigPivots: null,
    })
  }

  @SubscribeMessage('plaza:position')
  onPlazaPosition(@ConnectedSocket() socket: Socket, @MessageBody() body: any) {
    const userId = socket.data.userId as string
    const plazaId = String(body.plazaId)
    const position = { x: body.x, y: body.y, direction: body.direction }
    this.roster.updatePosition(plazaId, userId, position)
    // 발신자 제외 브로드캐스트 (프론트는 어차피 자기 위치를 무시함)
    socket.to(`plaza:${plazaId}`).emit('plaza:positions', { userId, position })
  }

  @SubscribeMessage('plaza:chat')
  onPlazaChat(@ConnectedSocket() socket: Socket, @MessageBody() body: any) {
    const userId = socket.data.userId as string
    const plazaId = String(body.plazaId)
    // Spring ChatBroadcast {userId, message, type, timestamp}와 동일 — 발신자 포함 전체 브로드캐스트
    this.server.to(`plaza:${plazaId}`).emit('plaza:chat', {
      userId,
      message: body.message,
      type: body.type ?? 'global',
      timestamp: new Date().toISOString(),
    })
  }

  // ── 방 ────────────────────────────────────────────────

  @SubscribeMessage('room:join')
  onRoomJoin(@ConnectedSocket() socket: Socket, @MessageBody() body: any) {
    const roomId = String(body.roomId)
    socket.join(`room:${roomId}`)
    this.server.to(`room:${roomId}`).emit('room:event', {
      type: 'user:joined',
      userId: socket.data.userId,
    })
  }

  @SubscribeMessage('room:leave')
  onRoomLeave(@ConnectedSocket() socket: Socket, @MessageBody() body: any) {
    const roomId = String(body.roomId)
    socket.leave(`room:${roomId}`)
    this.server.to(`room:${roomId}`).emit('room:event', {
      type: 'user:left',
      userId: socket.data.userId,
    })
  }

  @SubscribeMessage('room:chat')
  onRoomChat(@ConnectedSocket() socket: Socket, @MessageBody() body: any) {
    const roomId = String(body.roomId)
    this.server.to(`room:${roomId}`).emit('room:chat', {
      userId: socket.data.userId,
      message: body.message,
      nickname: body.nickname ?? null,
    })
  }

  // ── WebRTC 시그널링 (1:1 직송) ─────────────────────────

  @SubscribeMessage('webrtc:offer')
  onOffer(@ConnectedSocket() socket: Socket, @MessageBody() body: any) {
    this.sendToUser(body.targetUserId, {
      type: 'offer', fromUserId: socket.data.userId, sdp: body.sdp, candidate: null,
    })
  }

  @SubscribeMessage('webrtc:answer')
  onAnswer(@ConnectedSocket() socket: Socket, @MessageBody() body: any) {
    this.sendToUser(body.targetUserId, {
      type: 'answer', fromUserId: socket.data.userId, sdp: body.sdp, candidate: null,
    })
  }

  @SubscribeMessage('webrtc:ice')
  onIce(@ConnectedSocket() socket: Socket, @MessageBody() body: any) {
    this.sendToUser(body.targetUserId, {
      type: 'ice', fromUserId: socket.data.userId, sdp: null, candidate: body.candidate,
    })
  }

  private sendToUser(targetUserId: string | number, payload: unknown) {
    const sockets = this.userSockets.get(String(targetUserId))
    if (!sockets) return
    for (const s of sockets) s.emit('webrtc:signal', payload)
  }
}
