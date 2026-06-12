import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common'
import { IsNotEmpty, IsOptional, MaxLength } from 'class-validator'
import { ok } from '../common/api-response'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
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
}
