import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import {
  ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit,
  SubscribeMessage, WebSocketGateway, WebSocketServer,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { PrismaService } from '../prisma/prisma.service'
import { Member, PlazaRosterService } from './plaza-roster.service'
import { PresenceService } from './presence.service'

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
export class GameGateway implements OnModuleInit, OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server
  private readonly logger = new Logger('GameGateway')

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly roster: PlazaRosterService,
    private readonly presence: PresenceService,
  ) {}

  async onModuleInit() {
    await this.prisma.plazas.updateMany({
      where: { current_users: { not: 0 } },
      data: { current_users: 0 },
    })
    this.logger.log('광장 접속 인원 카운터를 초기화했습니다.')
  }

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

  async handleConnection(socket: Socket) {
    const userId = socket.data.userId as string
    // 오프라인→온라인 전환 시 친구들에게 알림
    if (this.presence.add(userId, socket)) {
      await this.notifyFriends(userId, 'friend:online')
    }
  }

  async handleDisconnect(socket: Socket) {
    const userId = socket.data.userId as string
    if (this.presence.remove(userId, socket)) {
      await this.notifyFriends(userId, 'friend:offline')
    }
    // 광장에 입장한 채 끊겼으면 자동 퇴장 (Spring SessionDisconnectEvent와 동일)
    const plazaId = socket.data.plazaId as string | undefined
    if (plazaId) {
      socket.data.plazaId = undefined
      await this.leavePlaza(plazaId, userId, socket.id, null)
    }
  }

  /** 내 친구(ACCEPTED) 중 온라인인 유저들에게 이벤트 전송 */
  private async notifyFriends(userId: string, event: 'friend:online' | 'friend:offline') {
    const id = BigInt(userId)
    const rows = await this.prisma.friendships
      .findMany({
        where: { status: 'ACCEPTED', OR: [{ requester_id: id }, { addressee_id: id }] },
        select: { requester_id: true, addressee_id: true },
      })
      .catch(() => [])
    for (const r of rows) {
      const friendId = String(r.requester_id) === userId ? r.addressee_id : r.requester_id
      if (friendId != null) this.presence.sendToUser(friendId, event, { userId })
    }
  }

  // ── 광장 ──────────────────────────────────────────────

  @SubscribeMessage('plaza:join')
  async onPlazaJoin(@ConnectedSocket() socket: Socket, @MessageBody() body: any) {
    const userId = socket.data.userId as string
    const plazaId = String(body.plazaId)

    const previousPlazaId = socket.data.plazaId as string | undefined
    if (previousPlazaId && previousPlazaId !== plazaId) {
      socket.leave(`plaza:${previousPlazaId}`)
      await this.leavePlaza(previousPlazaId, userId, socket.id, null)
    }

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
    this.roster.add(plazaId, member, socket.id)
    await this.syncPlazaCount(plazaId)

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
    await this.leavePlaza(plazaId, userId, socket.id, body.nickname ?? null)
  }

  private async leavePlaza(plazaId: string, userId: string, socketId: string, nickname: string | null) {
    const userLeft = this.roster.remove(plazaId, userId, socketId)
    await this.syncPlazaCount(plazaId)
    if (!userLeft) return
    this.server.to(`plaza:${plazaId}`).emit('plaza:users', {
      type: 'left', userId, nickname, parts: null, layerOrder: null, rigPivots: null,
    })
  }

  private async syncPlazaCount(plazaId: string) {
    await this.prisma.plazas
      .update({
        where: { id: Number(plazaId) },
        data: { current_users: this.roster.count(plazaId) },
      })
      .catch((error) => this.logger.warn(`광장 ${plazaId} 인원 동기화 실패: ${error?.message ?? error}`))
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

  @SubscribeMessage('plaza:emote')
  onPlazaEmote(@ConnectedSocket() socket: Socket, @MessageBody() body: any) {
    const userId = socket.data.userId as string
    const plazaId = String(body.plazaId)
    // 발신자 포함 전체 브로드캐스트 (이모트 종류만 중계)
    this.server.to(`plaza:${plazaId}`).emit('plaza:emote', { userId, emote: String(body.emote) })
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
    this.presence.sendToUser(targetUserId, 'webrtc:signal', payload)
  }

  // ── 길드 채팅 (현재 소속 길드원 전체에게 직송) ──────────

  @SubscribeMessage('guild:chat')
  async onGuildChat(@ConnectedSocket() socket: Socket, @MessageBody() body: any) {
    const userId = socket.data.userId as string
    const message = String(body.message ?? '').slice(0, 500)
    if (!message.trim()) return
    const me = await this.prisma.guild_members.findFirst({ where: { user_id: BigInt(userId) } })
    if (!me?.guild_id) return
    const members = await this.prisma.guild_members.findMany({
      where: { guild_id: me.guild_id },
      select: { user_id: true },
    })
    const from = await this.prisma.users.findUnique({ where: { id: BigInt(userId) } })
    const payload = {
      userId,
      nickname: from?.nickname ?? userId,
      message,
      timestamp: new Date().toISOString(),
    }
    for (const m of members) {
      if (m.user_id != null) this.presence.sendToUser(m.user_id, 'guild:chat', payload)
    }
  }

  // ── 초대 (내가 있는 광장/방으로 친구 부르기) ───────────

  @SubscribeMessage('invite:send')
  async onInvite(@ConnectedSocket() socket: Socket, @MessageBody() body: any) {
    const fromId = socket.data.userId as string
    const targetId = String(body.targetUserId)
    if (targetId === fromId) return

    const fail = (reason: string) =>
      socket.emit('invite:error', { targetUserId: targetId, reason })

    // 수신자가 발신자를 차단했으면 차단 사실 노출 없이 무시
    const blocked = await this.prisma.user_blocks.findFirst({
      where: { user_id: BigInt(targetId), blocked_user_id: BigInt(fromId) },
    })
    if (blocked) {
      socket.emit('invite:sent', { targetUserId: targetId })
      return
    }

    // 수신자 설정: 초대 무시
    const settingsRow = await this.prisma.user_settings.findUnique({
      where: { user_id: BigInt(targetId) },
    })
    if ((settingsRow?.settings as any)?.ignoreInvites) {
      return fail('초대를 받지 않는 유저입니다.')
    }
    if (!this.presence.isOnline(targetId)) return fail('오프라인 유저입니다.')

    const from = await this.prisma.users.findUnique({ where: { id: BigInt(fromId) } })
    this.presence.sendToUser(targetId, 'invite:receive', {
      fromUserId: fromId,
      fromNickname: from?.nickname ?? fromId,
      kind: body.kind === 'room' ? 'room' : 'plaza', // 'plaza' | 'room'
      targetId: String(body.targetId),
      targetName: body.targetName ?? null,
    })
    socket.emit('invite:sent', { targetUserId: targetId })
  }

  // ── 귓속말 (친구/설정/차단 검증 후 1:1 직송) ────────────

  @SubscribeMessage('whisper:send')
  async onWhisper(@ConnectedSocket() socket: Socket, @MessageBody() body: any) {
    const fromId = socket.data.userId as string
    const targetId = String(body.targetUserId)
    const message = String(body.message ?? '').slice(0, 500)
    if (!message.trim() || targetId === fromId) return

    const fail = (reason: string) =>
      socket.emit('whisper:error', { targetUserId: targetId, reason })

    // 수신자가 발신자를 차단했으면 조용히 무시 (차단 사실 노출 안 함)
    const blocked = await this.prisma.user_blocks.findFirst({
      where: { user_id: BigInt(targetId), blocked_user_id: BigInt(fromId) },
    })
    const timestamp = new Date().toISOString()
    if (blocked) {
      socket.emit('whisper:sent', { targetUserId: targetId, message, timestamp })
      return
    }

    // 수신자 설정: whisper = all | friends | none
    const settingsRow = await this.prisma.user_settings.findUnique({
      where: { user_id: BigInt(targetId) },
    })
    const mode = (settingsRow?.settings as any)?.whisper ?? 'all'
    if (mode === 'none') return fail('귓속말을 받지 않는 유저입니다.')
    if (mode === 'friends') {
      const friend = await this.prisma.friendships.findFirst({
        where: {
          status: 'ACCEPTED',
          OR: [
            { requester_id: BigInt(fromId), addressee_id: BigInt(targetId) },
            { requester_id: BigInt(targetId), addressee_id: BigInt(fromId) },
          ],
        },
      })
      if (!friend) return fail('친구의 귓속말만 받는 유저입니다.')
    }

    if (!this.presence.isOnline(targetId)) return fail('오프라인 유저입니다.')

    const from = await this.prisma.users.findUnique({ where: { id: BigInt(fromId) } })
    this.presence.sendToUser(targetId, 'whisper:receive', {
      fromUserId: fromId,
      fromNickname: from?.nickname ?? fromId,
      message,
      timestamp,
    })
    socket.emit('whisper:sent', { targetUserId: targetId, message, timestamp })
  }
}
