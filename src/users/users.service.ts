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
    createdAt: u.created_at,
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
}
