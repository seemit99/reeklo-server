import { Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common'
import { CurrentUser } from '../auth/current-user.decorator'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { JwtUser } from '../auth/jwt.strategy'
import { ItemsService } from './items.service'

// 주의: Spring과 동일하게 ApiResponse 래핑 없이 raw 응답
@Controller()
@UseGuards(JwtAuthGuard)
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Get('api/users/me/items')
  async getMyItems(@CurrentUser() user: JwtUser) {
    return this.itemsService.getMyItems(user.userId)
  }

  @Post('api/items/:id/purchase')
  async purchase(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.itemsService.purchase(user.userId, id)
  }
}
