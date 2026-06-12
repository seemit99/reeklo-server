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
    createdAt: r.created_at,
  }
}

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  async getRooms(plazaId: number) {
    const rooms = await this.prisma.rooms.findMany({
      where: { plaza_id: plazaId },
      orderBy: { created_at: 'desc' },
    })
    return rooms.map(toRoomDto)
  }

  async getRoom(id: number) {
    return toRoomDto(await this.findById(id))
  }

  async createRoom(ownerId: number, plazaId: number, req: any) {
    const room = await this.prisma.rooms.create({
      data: {
        plaza_id: plazaId,
        owner_id: ownerId,
        title: req.title,
        max_users: req.maxUsers ?? 20,
        is_private: req.isPrivate ?? false,
        password: req.password ?? null,
        room_type: req.roomType ?? 'GENERAL',
      },
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
    // 참여 인원이 0이 되면 방 자동 삭제 (Spring과 동일)
    const after = await this.findById(roomId)
    if (after.current_users <= 0) {
      await this.prisma.rooms.delete({ where: { id: roomId } })
    }
  }

  async deleteRoom(roomId: number, userId: number) {
    const room = await this.findById(roomId)
    if (Number(room.owner_id) !== userId) {
      throw new ConflictException('방장만 삭제할 수 있습니다.')
    }
    await this.prisma.rooms.delete({ where: { id: roomId } })
  }

  private async findById(id: number) {
    const room = await this.prisma.rooms.findUnique({ where: { id } })
    if (!room) throw new BadRequestException('방을 찾을 수 없습니다.')
    return room
  }
}
