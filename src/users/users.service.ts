import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

// Spring UserDto.Response와 동일 (password 제외)
export function toUserDto(u: any) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    nickname: u.nickname,
    coin: u.coin,
    bio: u.bio ?? null,
    mainGame: u.main_game ?? null,
    createdAt: u.created_at,
  }
}

// 공개 프로필 (이메일 등 민감정보 제외)
export function toProfileDto(u: any, online: boolean) {
  return {
    id: u.id,
    username: u.username,
    nickname: u.nickname,
    bio: u.bio ?? null,
    mainGame: u.main_game ?? null,
    createdAt: u.created_at,
    online,
  }
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getUser(id: number) {
    const user = await this.prisma.users.findUnique({ where: { id } })
    if (!user) throw new BadRequestException('유저를 찾을 수 없습니다.')
    return user
  }

  async updateNickname(id: number, nickname: string) {
    await this.prisma.users.update({ where: { id }, data: { nickname } })
  }

  async updateProfile(id: number, data: { nickname?: string; bio?: string; mainGame?: string }) {
    await this.prisma.users.update({
      where: { id },
      data: {
        ...(data.nickname !== undefined ? { nickname: data.nickname } : {}),
        ...(data.bio !== undefined ? { bio: data.bio } : {}),
        ...(data.mainGame !== undefined ? { main_game: data.mainGame } : {}),
      },
    })
  }

  // ── 유저 설정 (JSONB — 보낸 키만 병합 갱신) ─────────────

  async getSettings(id: number): Promise<Record<string, unknown>> {
    const row = await this.prisma.user_settings.findUnique({ where: { user_id: BigInt(id) } })
    return (row?.settings as Record<string, unknown>) ?? {}
  }

  async updateSettings(id: number, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
    const current = await this.getSettings(id)
    const merged = { ...current, ...patch }
    await this.prisma.user_settings.upsert({
      where: { user_id: BigInt(id) },
      create: { user_id: BigInt(id), settings: merged as any },
      update: { settings: merged as any, updated_at: new Date() },
    })
    return merged
  }
}
