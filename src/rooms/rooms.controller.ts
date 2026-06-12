import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, UseGuards,
} from '@nestjs/common'
import { IsNotEmpty, IsOptional, MaxLength } from 'class-validator'
import { ok } from '../common/api-response'
import { CurrentUser } from '../auth/current-user.decorator'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { JwtUser } from '../auth/jwt.strategy'
import { RoomsService } from './rooms.service'

class CreateRoomRequest {
  @MaxLength(100, { message: '방 제목은 100자 이하여야 합니다.' })
  @IsNotEmpty({ message: '방 제목을 입력해주세요.' })
  title!: string

  @IsOptional() maxUsers?: number
  @IsOptional() isPrivate?: boolean
  @IsOptional() password?: string
  @IsOptional() roomType?: string
}

@Controller('api/rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get()
  async getRooms(@Query('plazaId', ParseIntPipe) plazaId: number) {
    return ok(await this.roomsService.getRooms(plazaId))
  }

  @Get(':id')
  async getRoom(@Param('id', ParseIntPipe) id: number) {
    return ok(await this.roomsService.getRoom(id))
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  async createRoom(
    @CurrentUser() user: JwtUser,
    @Query('plazaId', ParseIntPipe) plazaId: number,
    @Body() req: CreateRoomRequest,
  ) {
    return ok(await this.roomsService.createRoom(user.userId, plazaId, req), '방 생성 완료')
  }

  @Post(':id/join')
  @UseGuards(JwtAuthGuard)
  async join(@Param('id', ParseIntPipe) id: number, @Body() body: { password?: string } | undefined) {
    await this.roomsService.join(id, body?.password ?? null)
    return ok(null, '방 입장')
  }

  @Post(':id/leave')
  @UseGuards(JwtAuthGuard)
  async leave(@Param('id', ParseIntPipe) id: number) {
    await this.roomsService.leave(id)
    return ok(null, '방 퇴장')
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async deleteRoom(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    await this.roomsService.deleteRoom(id, user.userId)
    return ok(null, '방 삭제 완료')
  }
}
