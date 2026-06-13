import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common'
import { PresenceService } from '../gateway/presence.service'
import { PrismaService } from '../prisma/prisma.service'

export interface FriendDto {
  userId: number
  username: string
  nickname: string
  online: boolean
}

@Injectable()
export class FriendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
  ) {}

  // ── 친구 목록/요청 ────────────────────────────────────

  async listFriends(userId: number): Promise<FriendDto[]> {
    const id = BigInt(userId)
    const rows = await this.prisma.friendships.findMany({
      where: { status: 'ACCEPTED', OR: [{ requester_id: id }, { addressee_id: id }] },
      include: { requester: true, addressee: true },
    })
    return rows
      .map((r) => (String(r.requester_id) === String(id) ? r.addressee : r.requester))
      .filter((u): u is NonNullable<typeof u> => u != null)
      .map((u) => ({
        userId: Number(u.id),
        username: u.username,
        nickname: u.nickname,
        online: this.presence.isOnline(u.id),
      }))
      .sort((a, b) => Number(b.online) - Number(a.online) || a.nickname.localeCompare(b.nickname))
  }

  async listRequests(userId: number) {
    const id = BigInt(userId)
    const [incoming, outgoing] = await Promise.all([
      this.prisma.friendships.findMany({
        where: { addressee_id: id, status: 'PENDING' },
        include: { requester: true },
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.friendships.findMany({
        where: { requester_id: id, status: 'PENDING' },
        include: { addressee: true },
        orderBy: { created_at: 'desc' },
      }),
    ])
    return {
      incoming: incoming
        .filter((r) => r.requester)
        .map((r) => ({
          requestId: Number(r.id),
          userId: Number(r.requester!.id),
          username: r.requester!.username,
          nickname: r.requester!.nickname,
          createdAt: r.created_at,
        })),
      outgoing: outgoing
        .filter((r) => r.addressee)
        .map((r) => ({
          requestId: Number(r.id),
          userId: Number(r.addressee!.id),
          username: r.addressee!.username,
          nickname: r.addressee!.nickname,
          createdAt: r.created_at,
        })),
    }
  }

  /** username 또는 userId로 친구 요청. 상대가 이미 나에게 요청해뒀으면 자동 수락 */
  async sendRequest(userId: number, target: { username?: string; targetUserId?: number }) {
    const me = BigInt(userId)
    const targetUser = target.targetUserId != null
      ? await this.prisma.users.findUnique({ where: { id: BigInt(target.targetUserId) } })
      : await this.prisma.users.findUnique({ where: { username: target.username ?? '' } })
    if (!targetUser) throw new NotFoundException('해당 유저를 찾을 수 없습니다.')
    const other = targetUser.id
    if (other === me) throw new BadRequestException('자기 자신에게는 요청할 수 없습니다.')

    // 차단 관계면 거부 (어느 방향이든)
    const block = await this.prisma.user_blocks.findFirst({
      where: {
        OR: [
          { user_id: me, blocked_user_id: other },
          { user_id: other, blocked_user_id: me },
        ],
      },
    })
    if (block) throw new BadRequestException('요청할 수 없는 유저입니다.')

    // 수신자 설정: friendRequests = all | none
    const settingsRow = await this.prisma.user_settings.findUnique({ where: { user_id: other } })
    if (((settingsRow?.settings as any)?.friendRequests ?? 'all') === 'none') {
      throw new BadRequestException('친구 요청을 받지 않는 유저입니다.')
    }

    const existing = await this.prisma.friendships.findFirst({
      where: {
        OR: [
          { requester_id: me, addressee_id: other },
          { requester_id: other, addressee_id: me },
        ],
      },
    })
    if (existing) {
      if (existing.status === 'ACCEPTED') throw new ConflictException('이미 친구입니다.')
      if (String(existing.requester_id) === String(me)) {
        throw new ConflictException('이미 요청을 보냈습니다.')
      }
      // 상대가 보낸 PENDING이 있음 → 자동 수락
      return this.accept(userId, Number(existing.id))
    }

    const row = await this.prisma.friendships.create({
      data: { requester_id: me, addressee_id: other, status: 'PENDING' },
    })
    const meUser = await this.prisma.users.findUnique({ where: { id: me } })
    this.presence.sendToUser(other, 'friend:request', {
      requestId: Number(row.id),
      userId: String(me),
      username: meUser?.username,
      nickname: meUser?.nickname,
    })
    return { accepted: false }
  }

  async accept(userId: number, requestId: number) {
    const row = await this.prisma.friendships.findUnique({ where: { id: BigInt(requestId) } })
    if (!row || String(row.addressee_id) !== String(userId) || row.status !== 'PENDING') {
      throw new NotFoundException('해당 요청을 찾을 수 없습니다.')
    }
    await this.prisma.friendships.update({
      where: { id: row.id },
      data: { status: 'ACCEPTED', updated_at: new Date() },
    })
    const meUser = await this.prisma.users.findUnique({ where: { id: BigInt(userId) } })
    this.presence.sendToUser(row.requester_id!, 'friend:accepted', {
      userId: String(userId),
      nickname: meUser?.nickname,
      online: true,
    })
    return { accepted: true }
  }

  async reject(userId: number, requestId: number) {
    const row = await this.prisma.friendships.findUnique({ where: { id: BigInt(requestId) } })
    if (!row || String(row.addressee_id) !== String(userId) || row.status !== 'PENDING') {
      throw new NotFoundException('해당 요청을 찾을 수 없습니다.')
    }
    await this.prisma.friendships.delete({ where: { id: row.id } })   // 삭제 → 재요청 가능
  }

  async cancelRequest(userId: number, requestId: number) {
    const row = await this.prisma.friendships.findUnique({ where: { id: BigInt(requestId) } })
    if (!row || String(row.requester_id) !== String(userId) || row.status !== 'PENDING') {
      throw new NotFoundException('해당 요청을 찾을 수 없습니다.')
    }
    await this.prisma.friendships.delete({ where: { id: row.id } })
  }

  async removeFriend(userId: number, friendUserId: number) {
    const me = BigInt(userId)
    const other = BigInt(friendUserId)
    const { count } = await this.prisma.friendships.deleteMany({
      where: {
        status: 'ACCEPTED',
        OR: [
          { requester_id: me, addressee_id: other },
          { requester_id: other, addressee_id: me },
        ],
      },
    })
    if (count === 0) throw new NotFoundException('친구 관계가 아닙니다.')
    this.presence.sendToUser(other, 'friend:removed', { userId: String(userId) })
  }

  // ── 차단 ─────────────────────────────────────────────

  async listBlocks(userId: number) {
    const rows = await this.prisma.user_blocks.findMany({
      where: { user_id: BigInt(userId) },
      include: { blocked: true },
      orderBy: { created_at: 'desc' },
    })
    return rows.map((r) => ({
      userId: Number(r.blocked.id),
      username: r.blocked.username,
      nickname: r.blocked.nickname,
      blockedAt: r.created_at,
    }))
  }

  /** 차단 — 기존 친구 관계/대기 요청도 함께 정리 */
  async block(userId: number, targetUserId: number) {
    const me = BigInt(userId)
    const other = BigInt(targetUserId)
    if (me === other) throw new BadRequestException('자기 자신은 차단할 수 없습니다.')
    if (!(await this.prisma.users.findUnique({ where: { id: other } }))) {
      throw new NotFoundException('해당 유저를 찾을 수 없습니다.')
    }
    await this.prisma.$transaction([
      this.prisma.user_blocks.createMany({
        data: [{ user_id: me, blocked_user_id: other }],
        skipDuplicates: true,
      }),
      this.prisma.friendships.deleteMany({
        where: {
          OR: [
            { requester_id: me, addressee_id: other },
            { requester_id: other, addressee_id: me },
          ],
        },
      }),
    ])
  }

  async unblock(userId: number, targetUserId: number) {
    await this.prisma.user_blocks.deleteMany({
      where: { user_id: BigInt(userId), blocked_user_id: BigInt(targetUserId) },
    })
  }

  // ── 신고 ─────────────────────────────────────────────

  async report(
    userId: number,
    body: { targetUserId: number; reason: string; detail?: string; context?: string },
  ) {
    if (userId === body.targetUserId) throw new BadRequestException('자기 자신은 신고할 수 없습니다.')
    if (!(await this.prisma.users.findUnique({ where: { id: BigInt(body.targetUserId) } }))) {
      throw new NotFoundException('해당 유저를 찾을 수 없습니다.')
    }
    await this.prisma.reports.create({
      data: {
        reporter_id: BigInt(userId),
        reported_user_id: BigInt(body.targetUserId),
        reason: body.reason,
        detail: body.detail ?? null,
        context: body.context ?? null,
      },
    })
  }
}
