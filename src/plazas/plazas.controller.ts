import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, UseGuards } from '@nestjs/common'
import { IsNotEmpty, IsOptional, MaxLength } from 'class-validator'
import { ok } from '../common/api-response'
import { CurrentUser } from '../auth/current-user.decorator'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { JwtUser } from '../auth/jwt.strategy'
import { PlazasService } from './plazas.service'

class CreatePlazaRequest {
  @MaxLength(100, { message: '광장 이름은 100자 이하여야 합니다.' })
  @IsNotEmpty({ message: '광장 이름을 입력해주세요.' })
  name!: string

  @IsOptional()
  gameType?: string

  @IsOptional()
  maxUsers?: number
}

@Controller('api/plazas')
export class PlazasController {
  constructor(private readonly plazasService: PlazasService) {}

  @Get()
  async getPlazas() {
    return ok(await this.plazasService.getPlazas())
  }

  // ':id'보다 먼저 선언해야 'me'가 숫자 파싱에 걸리지 않음
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async myPlaza(@CurrentUser() user: JwtUser) {
    return ok(await this.plazasService.getOrCreatePersonalPlaza(user.userId))
  }

  @Get('user/:userId')
  @UseGuards(JwtAuthGuard)
  async userPlaza(@Param('userId', ParseIntPipe) userId: number) {
    return ok(await this.plazasService.getOrCreatePersonalPlaza(userId))
  }

  @Get(':id')
  async getPlaza(@Param('id', ParseIntPipe) id: number) {
    return ok(await this.plazasService.getPlaza(id))
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async createPlaza(@Body() req: CreatePlazaRequest) {
    return ok(await this.plazasService.createPlaza(req), '광장 생성 완료')
  }

  @Post(':id/join')
  @UseGuards(JwtAuthGuard)
  async join(@Param('id', ParseIntPipe) id: number) {
    await this.plazasService.join(id)
    return ok(null, '광장 입장')
  }

  @Post(':id/leave')
  @UseGuards(JwtAuthGuard)
  async leave(@Param('id', ParseIntPipe) id: number) {
    await this.plazasService.leave(id)
    return ok(null, '광장 퇴장')
  }

  @Put(':id/decorations')
  @UseGuards(JwtAuthGuard)
  async updateDecorations(
    @CurrentUser() user: JwtUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { decorations: any },
  ) {
    const saved = await this.plazasService.updateDecorations(user.userId, id, body?.decorations)
    return ok(saved, '광장을 저장했습니다.')
  }
}
