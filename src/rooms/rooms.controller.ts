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

  // PlazaView의 방 목록 패널에서 특정 광장에 만들어진 방들을 조회할 때 호출한다.
  @Get()
  async getRooms(@Query('plazaId', ParseIntPipe) plazaId: number) {
    return ok(await this.roomsService.getRooms(plazaId))
  }

  // RoomView 진입 시 방 제목·소유자·정원 등 상세 정보를 불러올 때 호출한다.
  @Get(':id')
  async getRoom(@Param('id', ParseIntPipe) id: number) {
    return ok(await this.roomsService.getRoom(id))
  }

  // PlazaView의 방 만들기 모달에서 현재 사용자를 방장으로 새 방을 생성할 때 호출한다.
  @Post()
  @UseGuards(JwtAuthGuard)
  async createRoom(
    @CurrentUser() user: JwtUser,
    @Query('plazaId', ParseIntPipe) plazaId: number,
    @Body() req: CreateRoomRequest,
  ) {
    return ok(await this.roomsService.createRoom(user.userId, plazaId, req), '방 생성 완료')
  }

  // 사용자가 방에 들어가기 전 비밀번호와 정원을 검사하고 방 인원을 증가시킬 때 호출한다.
  @Post(':id/join')
  @UseGuards(JwtAuthGuard)
  async join(@Param('id', ParseIntPipe) id: number, @Body() body: { password?: string } | undefined) {
    await this.roomsService.join(id, body?.password ?? null)
    return ok(null, '방 입장')
  }

  // RoomView에서 나갈 때 방 인원을 감소시키고 빈 방이면 자동 삭제할 때 호출한다.
  @Post(':id/leave')
  @UseGuards(JwtAuthGuard)
  async leave(@Param('id', ParseIntPipe) id: number) {
    await this.roomsService.leave(id)
    return ok(null, '방 퇴장')
  }

  // RoomView에서 방장이 방을 직접 삭제할 때 호출한다.
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async deleteRoom(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    await this.roomsService.deleteRoom(id, user.userId)
    return ok(null, '방 삭제 완료')
  }
}
