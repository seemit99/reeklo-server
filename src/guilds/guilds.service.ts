import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common'
import { PresenceService } from '../gateway/presence.service'
import { PrismaService } from '../prisma/prisma.service'

function toGuildDto(g: any) {
  return {
    id: g.id,
    name: g.name,
    tag: g.tag,
    description: g.description,
    leaderId: g.leader_id,
    gameType: g.game_type,
    maxMembers: g.max_members,
    currentMembers: g.current_members,
    emblemUrl: g.emblem_url,
    isPublic: g.is_public,
    createdAt: g.created_at,
  }
}

@Injectable()
export class GuildsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
  ) {}

  async list(gameType?: string) {
    const guilds = await this.prisma.guilds.findMany({
      where: { is_public: true, ...(gameType && gameType !== 'ALL' ? { game_type: gameType } : {}) },
      orderBy: [{ current_members: 'desc' }, { created_at: 'desc' }],
      take: 100,
    })
    return guilds.map(toGuildDto)
  }

  /** 내가 속한 길드 + 멤버 목록 (없으면 null) */
  async myGuild(userId: number) {
    const membership = await this.prisma.guild_members.findFirst({
      where: { user_id: BigInt(userId) },
      include: { guild: true },
    })
    if (!membership?.guild) return null
    return this.guildDetail(Number(membership.guild.id), userId)
  }

  async guildDetail(guildId: number, userId: number) {
    const guild = await this.prisma.guilds.findUnique({ where: { id: BigInt(guildId) } })
    if (!guild) throw new NotFoundException('길드를 찾을 수 없습니다.')
    const members = await this.prisma.guild_members.findMany({
      where: { guild_id: BigInt(guildId) },
      include: { user: true },
      orderBy: { joined_at: 'asc' },
    })
    const ROLE_ORDER: Record<string, number> = { MASTER: 0, OFFICER: 1, MEMBER: 2 }
    return {
      ...toGuildDto(guild),
      myRole: members.find((m) => String(m.user_id) === String(userId))?.role ?? null,
      members: members
        .filter((m) => m.user)
        .map((m) => ({
          userId: Number(m.user!.id),
          nickname: m.user!.nickname,
          role: m.role,
          online: this.presence.isOnline(m.user!.id),
          joinedAt: m.joined_at,
        }))
        .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)
          || Number(b.online) - Number(a.online)),
    }
  }

  async create(
    userId: number,
    req: { name: string; tag: string; description?: string; gameType?: string },
  ) {
    if (await this.prisma.guild_members.findFirst({ where: { user_id: BigInt(userId) } })) {
      throw new ConflictException('이미 길드에 소속되어 있습니다. (한 번에 하나만)')
    }
    const name = req.name.trim()
    const tag = req.tag.trim().toUpperCase()
    if (name.length < 2) throw new BadRequestException('길드 이름은 2자 이상이어야 합니다.')
    if (!/^[A-Z0-9]{2,6}$/.test(tag)) throw new BadRequestException('태그는 영문/숫자 2~6자여야 합니다.')
    if (await this.prisma.guilds.findUnique({ where: { name } })) {
      throw new ConflictException('이미 사용 중인 길드 이름입니다.')
    }
    if (await this.prisma.guilds.findUnique({ where: { tag } })) {
      throw new ConflictException('이미 사용 중인 태그입니다.')
    }

    const guild = await this.prisma.guilds.create({
      data: {
        name,
        tag,
        description: req.description ?? null,
        leader_id: BigInt(userId),
        game_type: req.gameType ?? 'ALL',
        current_members: 1,
      },
    })
    await this.prisma.guild_members.create({
      data: { guild_id: guild.id, user_id: BigInt(userId), role: 'MASTER' },
    })
    return this.guildDetail(Number(guild.id), userId)
  }

  async join(userId: number, guildId: number) {
    if (await this.prisma.guild_members.findFirst({ where: { user_id: BigInt(userId) } })) {
      throw new ConflictException('이미 길드에 소속되어 있습니다.')
    }
    const guild = await this.prisma.guilds.findUnique({ where: { id: BigInt(guildId) } })
    if (!guild) throw new NotFoundException('길드를 찾을 수 없습니다.')
    if (!guild.is_public) throw new ForbiddenException('초대가 필요한 길드입니다.')
    if (guild.current_members >= guild.max_members) throw new BadRequestException('정원이 가득 찼습니다.')

    await this.prisma.$transaction([
      this.prisma.guild_members.create({
        data: { guild_id: guild.id, user_id: BigInt(userId), role: 'MEMBER' },
      }),
      this.prisma.guilds.update({
        where: { id: guild.id },
        data: { current_members: { increment: 1 } },
      }),
    ])
    return this.guildDetail(Number(guild.id), userId)
  }

  async leave(userId: number) {
    const m = await this.prisma.guild_members.findFirst({ where: { user_id: BigInt(userId) } })
    if (!m?.guild_id) throw new BadRequestException('소속된 길드가 없습니다.')
    if (m.role === 'MASTER') {
      const count = await this.prisma.guild_members.count({ where: { guild_id: m.guild_id } })
      if (count > 1) {
        throw new BadRequestException('마스터는 다른 멤버에게 위임하거나 길드를 해체한 뒤 탈퇴할 수 있습니다.')
      }
      // 혼자면 길드 해체
      await this.prisma.guilds.delete({ where: { id: m.guild_id } })
      return { disbanded: true }
    }
    await this.prisma.$transaction([
      this.prisma.guild_members.delete({ where: { id: m.id } }),
      this.prisma.guilds.update({
        where: { id: m.guild_id },
        data: { current_members: { decrement: 1 } },
      }),
    ])
    return { disbanded: false }
  }

  async disband(userId: number) {
    const m = await this.requireRole(userId, ['MASTER'])
    await this.prisma.guilds.delete({ where: { id: m.guild_id! } })
  }

  async kick(userId: number, targetUserId: number) {
    if (userId === targetUserId) throw new BadRequestException('자기 자신은 추방할 수 없습니다.')
    const me = await this.requireRole(userId, ['MASTER', 'OFFICER'])
    const target = await this.prisma.guild_members.findFirst({
      where: { guild_id: me.guild_id!, user_id: BigInt(targetUserId) },
    })
    if (!target) throw new NotFoundException('해당 멤버를 찾을 수 없습니다.')
    if (target.role === 'MASTER') throw new ForbiddenException('마스터는 추방할 수 없습니다.')
    await this.prisma.$transaction([
      this.prisma.guild_members.delete({ where: { id: target.id } }),
      this.prisma.guilds.update({
        where: { id: me.guild_id! },
        data: { current_members: { decrement: 1 } },
      }),
    ])
  }

  /** 권한 위임 / 직책 변경 (마스터만) */
  async setRole(userId: number, targetUserId: number, role: 'OFFICER' | 'MEMBER' | 'MASTER') {
    const me = await this.requireRole(userId, ['MASTER'])
    const target = await this.prisma.guild_members.findFirst({
      where: { guild_id: me.guild_id!, user_id: BigInt(targetUserId) },
    })
    if (!target) throw new NotFoundException('해당 멤버를 찾을 수 없습니다.')
    if (role === 'MASTER') {
      // 마스터 위임 — 본인은 OFFICER로 강등
      await this.prisma.$transaction([
        this.prisma.guild_members.update({ where: { id: target.id }, data: { role: 'MASTER' } }),
        this.prisma.guild_members.update({ where: { id: me.id }, data: { role: 'OFFICER' } }),
        this.prisma.guilds.update({ where: { id: me.guild_id! }, data: { leader_id: BigInt(targetUserId) } }),
      ])
    } else {
      await this.prisma.guild_members.update({ where: { id: target.id }, data: { role } })
    }
  }

  private async requireRole(userId: number, roles: string[]) {
    const m = await this.prisma.guild_members.findFirst({ where: { user_id: BigInt(userId) } })
    if (!m?.guild_id) throw new BadRequestException('소속된 길드가 없습니다.')
    if (!roles.includes(m.role)) throw new ForbiddenException('권한이 없습니다.')
    return m
  }
}
