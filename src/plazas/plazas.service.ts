import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
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
    decorations: Array.isArray((p.map_data as any)?.decorations) ? (p.map_data as any).decorations : [],
  }
}

const WORLD_W = 1920
const WORLD_H = 1440
const MAX_DECORATIONS = 120

// 클라이언트가 보낸 배치 데이터 검증/정규화 (악성/깨진 값 차단)
function sanitizeDecorations(input: any): any[] {
  if (!Array.isArray(input)) throw new BadRequestException('decorations는 배열이어야 합니다.')
  if (input.length > MAX_DECORATIONS) throw new BadRequestException(`가구는 최대 ${MAX_DECORATIONS}개까지 배치할 수 있습니다.`)
  return input.slice(0, MAX_DECORATIONS).map((d: any, i: number) => {
    const type = String(d?.type ?? '').slice(0, 24)
    const x = Number(d?.x)
    const y = Number(d?.y)
    if (!type || !isFinite(x) || !isFinite(y)) throw new BadRequestException('가구 데이터가 올바르지 않습니다.')
    return {
      id: String(d?.id ?? `d${i}`).slice(0, 40),
      type,
      x: Math.min(WORLD_W, Math.max(0, x)),
      y: Math.min(WORLD_H, Math.max(0, y)),
      scale: Math.min(3, Math.max(0.4, Number(d?.scale) || 1)),
      flip: !!d?.flip,
    }
  })
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

  /** 개인 광장 꾸미기 저장 — 소유자만 */
  async updateDecorations(userId: number, plazaId: number, decorations: any) {
    const plaza = await this.prisma.plazas.findUnique({ where: { id: BigInt(plazaId) } })
    if (!plaza) throw new BadRequestException('광장을 찾을 수 없습니다.')
    if (String(plaza.owner_id) !== String(userId)) {
      throw new ForbiddenException('본인 광장만 꾸밀 수 있습니다.')
    }
    const clean = sanitizeDecorations(decorations)
    await this.prisma.plazas.update({
      where: { id: BigInt(plazaId) },
      data: { map_data: { decorations: clean } as any },
    })
    return clean
  }

  async join(id: number) {
    await this.prisma.plazas.update({ where: { id }, data: { current_users: { increment: 1 } } })
  }

  async leave(id: number) {
    // 음수 방지
    await this.prisma.$executeRaw`UPDATE plazas SET current_users = GREATEST(current_users - 1, 0) WHERE id = ${id}`
  }
}
