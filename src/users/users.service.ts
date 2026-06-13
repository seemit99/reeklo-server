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

  // ── 출석 체크 / 일일 코인 보상 ──────────────────────────
  // 보상: 기본 50 + 연속일수 보너스(일당 10, 7일차 캡) → 50~110, 하루 거르면 streak 리셋

  private static todayStr(): string {
    return new Date().toISOString().slice(0, 10) // YYYY-MM-DD (UTC 기준 1일 1회)
  }
  private static rewardFor(streak: number): number {
    return 50 + Math.min(streak, 7) * 10
  }

  async getCheckInStatus(id: number) {
    const u = await this.getUser(id)
    const last = u.last_check_in ? u.last_check_in.toISOString().slice(0, 10) : null
    const today = UsersService.todayStr()
    return {
      canClaim: last !== today,
      streak: u.attendance_streak ?? 0,
      lastCheckIn: last,
      nextReward: UsersService.rewardFor(last === today ? (u.attendance_streak ?? 1) : (u.attendance_streak ?? 0) + 1),
      coin: u.coin,
    }
  }

  async checkIn(id: number) {
    const u = await this.getUser(id)
    const today = UsersService.todayStr()
    const last = u.last_check_in ? u.last_check_in.toISOString().slice(0, 10) : null
    if (last === today) {
      return { claimed: false, reward: 0, streak: u.attendance_streak, coin: u.coin, message: '오늘은 이미 출석했어요.' }
    }
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const streak = last === yesterday ? (u.attendance_streak ?? 0) + 1 : 1
    const reward = UsersService.rewardFor(streak)
    const updated = await this.prisma.users.update({
      where: { id: BigInt(id) },
      data: { coin: { increment: reward }, attendance_streak: streak, last_check_in: new Date(today) },
    })
    return { claimed: true, reward, streak, coin: updated.coin, message: `출석 완료! +${reward}🪙 (연속 ${streak}일)` }
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
