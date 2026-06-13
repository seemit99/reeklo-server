import { Body, Controller, Get, Param, ParseIntPipe, Put, UseGuards } from '@nestjs/common'
import { IsNotEmpty, IsOptional, MaxLength } from 'class-validator'
import { ok } from '../common/api-response'
import { CurrentUser } from '../auth/current-user.decorator'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { JwtUser } from '../auth/jwt.strategy'
import { PresenceService } from '../gateway/presence.service'
import { toProfileDto, toUserDto, UsersService } from './users.service'

class UpdateRequest {
  @MaxLength(50, { message: '닉네임은 50자 이하여야 합니다.' })
  @IsNotEmpty({ message: '닉네임을 입력해주세요.' })
  nickname!: string
}

class UpdateProfileRequest {
  @IsOptional() @MaxLength(50, { message: '닉네임은 50자 이하여야 합니다.' })
  nickname?: string

  @IsOptional() @MaxLength(200, { message: '자기소개는 200자 이하여야 합니다.' })
  bio?: string

  @IsOptional() @MaxLength(50)
  mainGame?: string
}

@Controller('api/users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly presence: PresenceService,
  ) {}

  @Get('me')
  async getMe(@CurrentUser() user: JwtUser) {
    return ok(toUserDto(await this.usersService.getUser(user.userId)))
  }

  @Get('me/settings')
  async getSettings(@CurrentUser() user: JwtUser) {
    return ok(await this.usersService.getSettings(user.userId))
  }

  @Put('me/settings')
  async updateSettings(@CurrentUser() user: JwtUser, @Body() patch: Record<string, unknown>) {
    return ok(await this.usersService.updateSettings(user.userId, patch ?? {}), '설정 저장 완료')
  }

  // 공개 프로필 (우클릭 → 프로필 보기). 온라인 여부 포함
  @Get(':id/profile')
  async getProfile(@Param('id', ParseIntPipe) id: number) {
    const u = await this.usersService.getUser(id)
    return ok(toProfileDto(u, this.presence.isOnline(id)))
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

  @Put('me/profile')
  async updateProfile(@CurrentUser() user: JwtUser, @Body() req: UpdateProfileRequest) {
    await this.usersService.updateProfile(user.userId, req)
    return ok(null, '프로필이 저장되었습니다.')
  }
}
