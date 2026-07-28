import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
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
    categoryCode: p.category_code ?? 'GENERAL',
    description: p.description ?? null,
    isPrivate: p.is_private ?? false,
    tags: (p.plaza_tags ?? []).filter((link: any) => link.use_yn === 'Y' && link.tag?.use_yn === 'Y')
      .map((link: any) => link.tag.name),
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async getCategories() {
    return this.prisma.room_categories.findMany({
      where: { use_yn: 'Y' },
      orderBy: { display_order: 'asc' },
      select: { code: true, name: true },
    })
  }

  async getPlazas(filters: { category?: string; keyword?: string; tag?: string; onlyJoinable?: boolean } = {}) {
    const keyword = filters.keyword?.trim()
    const tag = this.normalizeTag(filters.tag ?? '')
    const plazas = await this.prisma.plazas.findMany({
      where: {
        plaza_type: 'PUBLIC',
        use_yn: 'Y',
        ...(filters.category ? { category_code: filters.category } : {}),
        ...(keyword ? {
          OR: [
            { name: { contains: keyword, mode: 'insensitive' } },
            { description: { contains: keyword, mode: 'insensitive' } },
          ],
        } : {}),
        ...(tag ? {
          plaza_tags: { some: { use_yn: 'Y', tag: { name: tag, use_yn: 'Y' } } },
        } : {}),
      },
      orderBy: [{ current_users: 'desc' }, { created_at: 'desc' }],
      include: { plaza_tags: { include: { tag: true } } },
    })
    return plazas
      .filter((plaza) => !filters.onlyJoinable || plaza.current_users < plaza.max_users)
      .map(toPlazaDto)
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
    const plaza = await this.prisma.plazas.findFirst({
      where: { id, use_yn: 'Y' },
      include: { plaza_tags: { include: { tag: true } } },
    })
    if (!plaza) throw new BadRequestException('이용 가능한 광장을 찾을 수 없습니다.')
    return toPlazaDto(plaza)
  }

  async assignPublicPlaza(userId: number) {
    const user = await this.prisma.users.findUnique({
      where: { id: BigInt(userId) },
      select: { last_plaza_id: true },
    })
    if (!user) throw new BadRequestException('유저를 찾을 수 없습니다.')

    let plaza = user.last_plaza_id
      ? await this.prisma.plazas.findFirst({
          where: {
            id: user.last_plaza_id,
            plaza_type: 'PUBLIC',
            is_private: false,
            use_yn: 'Y',
          },
        })
      : null
    if (plaza && plaza.current_users >= plaza.max_users) plaza = null

    // Prisma는 컬럼 간 비교를 지원하지 않으므로 후보를 정렬한 뒤 정원 여부를 검사한다.
    if (!plaza) {
      const candidates = await this.prisma.plazas.findMany({
        where: { plaza_type: 'PUBLIC', is_private: false, use_yn: 'Y' },
        orderBy: [{ current_users: 'desc' }, { id: 'asc' }],
      })
      plaza = candidates.find((candidate) => candidate.current_users < candidate.max_users) ?? null
    }
    if (!plaza) throw new BadRequestException('현재 입장 가능한 광장이 없습니다.')

    await this.rememberPlaza(userId, Number(plaza.id))
    return toPlazaDto(plaza)
  }

  async rememberPlaza(userId: number, plazaId: number) {
    const plaza = await this.prisma.plazas.findFirst({
      where: { id: BigInt(plazaId), plaza_type: 'PUBLIC', use_yn: 'Y' },
    })
    if (plaza) {
      await this.prisma.users.update({
        where: { id: BigInt(userId) },
        data: { last_plaza_id: plaza.id },
      })
    }
  }

  async createPlaza(userId: number, req: any) {
    const category = await this.prisma.room_categories.findFirst({
      where: { code: req.categoryCode, use_yn: 'Y' },
    })
    if (!category) throw new BadRequestException('올바른 광장 카테고리를 선택해주세요.')
    const tagNames: string[] = [
      ...new Set<string>((req.tags ?? []).map((tag: string) => this.normalizeTag(tag)).filter(Boolean)),
    ]
    if (tagNames.length > 5) throw new BadRequestException('태그는 최대 5개까지 등록할 수 있습니다.')
    const isPrivate = req.isPrivate === true
    if (isPrivate && !req.password) {
      throw new BadRequestException('비밀 광장 비밀번호를 입력해 주세요.')
    }
    const plaza = await this.prisma.plazas.create({
      data: {
        name: req.name,
        game_type: req.gameType ?? 'ALL',
        max_users: Math.min(100, Math.max(2, Number(req.maxUsers) || 20)),
        owner_id: BigInt(userId),
        plaza_type: 'PUBLIC',
        category_code: category.code,
        description: req.description?.trim() || null,
        is_private: isPrivate,
        password_hash: isPrivate ? await bcrypt.hash(req.password, 10) : null,
        plaza_tags: {
          create: tagNames.map((name) => ({
            tag: {
              connectOrCreate: {
                where: { name },
                create: { name, use_yn: 'Y' },
              },
            },
          })),
        },
      },
      include: { plaza_tags: { include: { tag: true } } },
    })
    return toPlazaDto(plaza)
  }

  async issueAccessToken(userId: number, plazaId: number, password?: string) {
    const plaza = await this.prisma.plazas.findFirst({
      where: { id: BigInt(plazaId), use_yn: 'Y' },
      select: { id: true, owner_id: true, is_private: true, password_hash: true },
    })
    if (!plaza) throw new BadRequestException('이용 가능한 광장을 찾을 수 없습니다.')
    const isOwner = String(plaza.owner_id) === String(userId)
    if (plaza.is_private && !isOwner) {
      const valid = !!password && !!plaza.password_hash && await bcrypt.compare(password, plaza.password_hash)
      if (!valid) throw new ForbiddenException('광장 비밀번호가 올바르지 않습니다.')
    }
    return {
      accessToken: this.jwt.sign(
        { sub: String(userId), plazaId: String(plaza.id), purpose: 'plaza-access' },
        { expiresIn: '6h' },
      ),
    }
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
    // 음수 방지 후 사용자 생성 공개 광장만 마지막 퇴장 시 소프트 비활성화한다.
    await this.prisma.$executeRaw`UPDATE plazas SET current_users = GREATEST(current_users - 1, 0) WHERE id = ${id}`
    await this.prisma.plazas.updateMany({
      where: {
        id,
        current_users: 0,
        plaza_type: 'PUBLIC',
        owner_id: { not: null },
        use_yn: 'Y',
      },
      data: { use_yn: 'N' },
    })
  }

  private normalizeTag(value: string) {
    return String(value)
      .trim()
      .replace(/^#+/, '')
      .replace(/\s+/g, '')
      .replace(/[^\p{L}\p{N}_-]/gu, '')
      .slice(0, 20)
      .toLowerCase()
  }
}
