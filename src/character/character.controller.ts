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

  @Get('api/parts')
  async getParts(@Query('type') type?: string) {
    return this.characterService.getParts(type)
  }

  @Post('api/parts')
  @UseGuards(JwtAuthGuard)
  async createPart(@CurrentUser() user: JwtUser, @Body() req: any) {
    return this.characterService.createPart(user.userId, req)
  }

  @Delete('api/parts/:id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  async deletePart(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    await this.characterService.deletePart(id, user.userId)
  }

  @Get('api/character/preset')
  @UseGuards(JwtAuthGuard)
  async getPreset(@CurrentUser() user: JwtUser) {
    return this.characterService.getPreset(user.userId)
  }

  @Put('api/character/preset')
  @UseGuards(JwtAuthGuard)
  async savePreset(@CurrentUser() user: JwtUser, @Body() req: any) {
    return this.characterService.savePreset(user.userId, req)
  }
}
