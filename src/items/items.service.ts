import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { toPartDto } from '../character/character.service'

@Injectable()
export class ItemsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyItems(userId: number) {
    const items = await this.prisma.user_items.findMany({
      where: { user_id: userId },
      include: { character_parts: true },
      orderBy: { purchased_at: 'desc' },
    })
    // Spring ItemDto.ItemResponse: {id, part, purchasedAt}
    return items.map((it) => ({
      id: it.id,
      part: it.character_parts ? toPartDto(it.character_parts) : null,
      purchasedAt: it.purchased_at,
    }))
  }

  async purchase(userId: number, partId: number) {
    return this.prisma.$transaction(async (tx) => {
      const part = await tx.character_parts.findUnique({ where: { id: partId } })
      if (!part) throw new NotFoundException('파츠를 찾을 수 없습니다.')
      if (!part.is_approved) throw new BadRequestException('구매할 수 없는 파츠입니다.')

      const exists = await tx.user_items.findFirst({ where: { user_id: userId, part_id: partId } })
      if (exists) throw new ConflictException('이미 보유한 파츠입니다.')

      const user = await tx.users.findUnique({ where: { id: userId } })
      if (!user) throw new NotFoundException('사용자를 찾을 수 없습니다.')
      const price = part.price ?? 0
      if (user.coin < price) throw new BadRequestException('코인이 부족합니다.')

      await tx.users.update({ where: { id: userId }, data: { coin: { decrement: price } } })
      await tx.user_items.create({ data: { user_id: userId, part_id: partId } })
      await tx.character_parts.update({ where: { id: partId }, data: { download_count: { increment: 1 } } })

      return { remainingCoin: Math.max(0, user.coin - price) }
    })
  }
}
