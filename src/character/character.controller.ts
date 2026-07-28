import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, Query, UseGuards,
} from '@nestjs/common'
import { CurrentUser } from '../auth/current-user.decorator'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { JwtUser } from '../auth/jwt.strategy'
import { CharacterService } from './character.service'

// 주의: Spring과 동일하게 ApiResponse 래핑 없이 raw 응답
@Controller()
export class CharacterController {
  constructor(private readonly characterService: CharacterService) {}

  // CharacterView·MarketplaceView·PlazaView가 캐릭터 파츠 목록을 불러올 때 호출한다.
  @Get('api/parts')
  async getParts(@Query('type') type?: string) {
    return this.characterService.getParts(type)
  }

  // CharacterView에서 업로드가 끝난 이미지 URL로 새 캐릭터 파츠를 등록할 때 호출한다.
  @Post('api/parts')
  @UseGuards(JwtAuthGuard)
  async createPart(@CurrentUser() user: JwtUser, @Body() req: any) {
    return this.characterService.createPart(user.userId, req)
  }

  // CharacterView에서 자신이 만든 파츠를 더블클릭해 이름·타입·이미지·가격·피벗을 수정할 때 호출한다.
  @Put('api/parts/:id')
  @UseGuards(JwtAuthGuard)
  async updatePart(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
    @Body() req: any,
  ) {
    return this.characterService.updatePart(id, user.userId, req)
  }

  // CharacterView에서 자신이 만든 캐릭터 파츠를 삭제할 때 호출한다.
  @Delete('api/parts/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async deletePart(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    await this.characterService.deletePart(id, user.userId)
  }

  // CharacterView와 PlazaView가 내 장착 파츠·레이어·관절 설정을 불러올 때 호출한다.
  @Get('api/character/preset')
  @UseGuards(JwtAuthGuard)
  async getPreset(@CurrentUser() user: JwtUser) {
    return this.characterService.getPreset(user.userId)
  }

  // CharacterView에서 선택한 파츠·레이어 순서·관절 위치를 내 프리셋으로 저장할 때 호출한다.
  @Put('api/character/preset')
  @UseGuards(JwtAuthGuard)
  async savePreset(@CurrentUser() user: JwtUser, @Body() req: any) {
    return this.characterService.savePreset(user.userId, req)
  }
}
