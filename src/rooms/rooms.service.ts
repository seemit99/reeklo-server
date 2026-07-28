import { BadRequestException, ConflictException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

// Spring RoomDto.Response와 동일 (password 미노출)
function toRoomDto(r: any) {
  return {
    id: r.id,
    plazaId: r.plaza_id,
    ownerId: r.owner_id,
    title: r.title,
    maxUsers: r.max_users,
    currentUsers: r.current_users,
    isPrivate: r.is_private,
    roomType: r.room_type,
    categoryCode: r.category_code,
    description: r.description,
    tags: (r.room_tags ?? []).filter((link: any) => link.use_yn === 'Y' && link.tag?.use_yn === 'Y')
      .map((link: any) => link.tag.name),
    createdAt: r.created_at,
  }
}

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  async getCategories() {
    return this.prisma.room_categories.findMany({
      where: { use_yn: 'Y' },
      orderBy: { display_order: 'asc' },
      select: { code: true, name: true },
    })
  }

  async getRooms(
    plazaId: number,
    filters: { category?: string; keyword?: string; tag?: string; onlyJoinable?: boolean },
  ) {
    const keyword = filters.keyword?.trim()
    const tag = this.normalizeTag(filters.tag ?? '')
    const rooms = await this.prisma.rooms.findMany({
      where: {
        plaza_id: plazaId,
        use_yn: 'Y',
        ...(filters.category ? { category_code: filters.category } : {}),
        ...(keyword ? {
          OR: [
            { title: { contains: keyword, mode: 'insensitive' } },
            { description: { contains: keyword, mode: 'insensitive' } },
          ],
        } : {}),
        ...(tag ? {
          room_tags: {
            some: { use_yn: 'Y', tag: { name: tag, use_yn: 'Y' } },
          },
        } : {}),
      },
      orderBy: { created_at: 'desc' },
      include: { room_tags: { include: { tag: true } } },
    })
    return rooms
      .filter((room) => !filters.onlyJoinable || room.current_users < room.max_users)
      .map(toRoomDto)
  }

  async getRoom(id: number) {
    const room = await this.prisma.rooms.findFirst({
      where: { id, use_yn: 'Y' },
      include: { room_tags: { include: { tag: true } } },
    })
    if (!room) throw new BadRequestException('방을 찾을 수 없습니다.')
    return toRoomDto(room)
  }

  async createRoom(ownerId: number, plazaId: number, req: any) {
    const category = await this.prisma.room_categories.findFirst({
      where: { code: req.categoryCode, use_yn: 'Y' },
    })
    if (!category) throw new BadRequestException('올바른 방 카테고리를 선택해주세요.')
    const tagNames: string[] = [
      ...new Set<string>((req.tags ?? []).map((tag: string) => this.normalizeTag(tag)).filter(Boolean)),
    ]
    if (tagNames.length > 5) throw new BadRequestException('태그는 최대 5개까지 등록할 수 있습니다.')

    const room = await this.prisma.rooms.create({
      data: {
        plaza_id: plazaId,
        owner_id: ownerId,
        title: req.title,
        max_users: req.maxUsers ?? 20,
        is_private: req.isPrivate ?? false,
        password: req.password ?? null,
        room_type: req.roomType ?? 'GENERAL',
        category_code: category.code,
        description: req.description?.trim() || null,
        use_yn: 'Y',
        room_tags: {
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
      include: { room_tags: { include: { tag: true } } },
    })
    return toRoomDto(room)
  }

  async join(roomId: number, password: string | null) {
    const room = await this.findById(roomId)
    if (room.current_users >= room.max_users) {
      throw new ConflictException('방이 가득 찼습니다.')
    }
    if (room.is_private && room.password !== password) {
      throw new BadRequestException('비밀번호가 올바르지 않습니다.')
    }
    await this.prisma.rooms.update({ where: { id: roomId }, data: { current_users: { increment: 1 } } })
  }

  async leave(roomId: number) {
    await this.findById(roomId)
    await this.prisma.$executeRaw`UPDATE rooms SET current_users = GREATEST(current_users - 1, 0) WHERE id = ${roomId}`
    // 참여 인원이 0이 되면 기록은 유지하고 목록에서만 비활성화한다.
    const after = await this.findById(roomId)
    if (after.current_users <= 0) {
      await this.prisma.rooms.update({ where: { id: roomId }, data: { use_yn: 'N' } })
    }
  }

  async deleteRoom(roomId: number, userId: number) {
    const room = await this.findById(roomId)
    if (Number(room.owner_id) !== userId) {
      throw new ConflictException('방장만 삭제할 수 있습니다.')
    }
    await this.prisma.rooms.update({ where: { id: roomId }, data: { use_yn: 'N' } })
  }

  private async findById(id: number) {
    const room = await this.prisma.rooms.findFirst({ where: { id, use_yn: 'Y' } })
    if (!room) throw new BadRequestException('방을 찾을 수 없습니다.')
    return room
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
