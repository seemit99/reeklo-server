import { Body, Controller, Get, Param, ParseIntPipe, Put, UseGuards } from '@nestjs/common'
import { IsNotEmpty, MaxLength } from 'class-validator'
import { ok } from '../common/api-response'
import { CurrentUser } from '../auth/current-user.decorator'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { JwtUser } from '../auth/jwt.strategy'
import { toUserDto, UsersService } from './users.service'

class UpdateRequest {
  @MaxLength(50, { message: '닉네임은 50자 이하여야 합니다.' })
  @IsNotEmpty({ message: '닉네임을 입력해주세요.' })
  nickname!: string
}

@Controller('api/users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getMe(@CurrentUser() user: JwtUser) {
    return ok(toUserDto(await this.usersService.getUser(user.userId)))
  }

  @Get(':id')
  async getUser(@Param('id', ParseIntPipe) id: number) {
    return ok(toUserDto(await this.usersService.getUser(id)))
  }

  @Put('me')
  async updateMe(@CurrentUser() user: JwtUser, @Body() req: UpdateRequest) {
    await this.usersService.updateNickname(user.userId, req.nickname)
    return ok(null, '수정 완료')
  }
}
