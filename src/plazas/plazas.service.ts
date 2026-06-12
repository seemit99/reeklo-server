import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

// Spring PlazaDto.Response와 동일 (map_data 미노출)
function toPlazaDto(p: any) {
  return {
    id: p.id,
    name: p.name,
    gameType: p.game_type,
    maxUsers: p.max_users,
    currentUsers: p.current_users,
    createdAt: p.created_at,
    ownerId: p.owner_id ?? null,
    plazaType: p.plaza_type ?? 'PUBLIC',
  }
}

@Injectable()
export class PlazasService {
  constructor(private readonly prisma: PrismaService) {}

  async getPlazas() {
    // 로비 목록에는 공용 광장만 — 개인 광장은 프로필/친구 경유로 입장
    return (
      await this.prisma.plazas.findMany({ where: { plaza_type: 'PUBLIC' }, orderBy: { id: 'asc' } })
    ).map(toPlazaDto)
  }

  /** 개인 광장 (마이페이지) — 없으면 즉시 생성 */
  async getOrCreatePersonalPlaza(ownerUserId: number) {
    const ownerId = BigInt(ownerUserId)
    const existing = await this.prisma.plazas.findFirst({ where: { owner_id: ownerId } })
    if (existing) return toPlazaDto(existing)
    const owner = await this.prisma.users.findUnique({ where: { id: ownerId } })
    if (!owner) throw new BadRequestException('유저를 찾을 수 없습니다.')
    const plaza = await this.prisma.plazas.create({
      data: {
        name: `${owner.nickname}의 광장`,
        game_type: 'PERSONAL',
        max_users: 20,
        owner_id: ownerId,
        plaza_type: 'PERSONAL',
      },
    })
    return toPlazaDto(plaza)
  }

  async getPlaza(id: number) {
    const plaza = await this.prisma.plazas.findUnique({ where: { id } })
    if (!plaza) throw new BadRequestException('광장을 찾을 수 없습니다.')
    return toPlazaDto(plaza)
  }

  async createPlaza(req: { name: string; gameType?: string; maxUsers?: number }) {
    const plaza = await this.prisma.plazas.create({
      data: {
        name: req.name,
        game_type: req.gameType ?? 'ALL',
        max_users: req.maxUsers ?? 100,
      },
    })
    return toPlazaDto(plaza)
  }

  async join(id: number) {
    await this.prisma.plazas.update({ where: { id }, data: { current_users: { increment: 1 } } })
  }

  async leave(id: number) {
    // 음수 방지
    await this.prisma.$executeRaw`UPDATE plazas SET current_users = GREATEST(current_users - 1, 0) WHERE id = ${id}`
  }
}
