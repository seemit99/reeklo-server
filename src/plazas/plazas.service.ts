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
  }
}

@Injectable()
export class PlazasService {
  constructor(private readonly prisma: PrismaService) {}

  async getPlazas() {
    return (await this.prisma.plazas.findMany({ orderBy: { id: 'asc' } })).map(toPlazaDto)
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
