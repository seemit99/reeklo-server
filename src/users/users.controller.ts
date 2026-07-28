import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, UseGuards } from '@nestjs/common'
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

  // 앱 시작·새로고침 후 JWT 사용자 정보를 복원하고 화면에 내 프로필을 표시할 때 호출한다.
  @Get('me')
  async getMe(@CurrentUser() user: JwtUser) {
    return ok(toUserDto(await this.usersService.getUser(user.userId)))
  }

  // App.vue와 SettingsView가 음성·화면·알림 등 내 환경 설정을 불러올 때 호출한다.
  @Get('me/settings')
  async getSettings(@CurrentUser() user: JwtUser) {
    return ok(await this.usersService.getSettings(user.userId))
  }

  // LobbyView가 오늘 출석 여부와 연속 출석 정보를 표시할 때 호출한다.
  @Get('me/checkin')
  async checkInStatus(@CurrentUser() user: JwtUser) {
    return ok(await this.usersService.getCheckInStatus(user.userId))
  }

  // LobbyView에서 출석 보상 받기 버튼을 눌러 오늘 출석과 코인 보상을 확정할 때 호출한다.
  @Post('me/checkin')
  async checkIn(@CurrentUser() user: JwtUser) {
    const r = await this.usersService.checkIn(user.userId)
    return ok(r, r.message)
  }

  // SettingsView에서 변경한 음성·화면·알림 설정 일부를 저장할 때 호출한다.
  @Put('me/settings')
  async updateSettings(@CurrentUser() user: JwtUser, @Body() patch: Record<string, unknown>) {
    return ok(await this.usersService.updateSettings(user.userId, patch ?? {}), '설정 저장 완료')
  }

  // 공개 프로필 (우클릭 → 프로필 보기). 온라인 여부 포함
  // PlazaView의 사용자 우클릭 메뉴에서 상대방의 공개 프로필과 온라인 여부를 볼 때 호출한다.
  @Get(':id/profile')
  async getProfile(@Param('id', ParseIntPipe) id: number) {
    const u = await this.usersService.getUser(id)
    return ok(toProfileDto(u, this.presence.isOnline(id)))
  }

  // 사용자 ID로 기본 사용자 정보를 조회해야 하는 내부 화면이나 소셜 기능에서 호출한다.
  @Get(':id')
  async getUser(@Param('id', ParseIntPipe) id: number) {
    return ok(toUserDto(await this.usersService.getUser(id)))
  }

  // 기존 호환 화면에서 내 닉네임 한 가지만 수정할 때 호출한다.
  @Put('me')
  async updateMe(@CurrentUser() user: JwtUser, @Body() req: UpdateRequest) {
    await this.usersService.updateNickname(user.userId, req.nickname)
    return ok(null, '수정 완료')
  }

  // 신규 온보딩과 SettingsView에서 닉네임·소개·주력 게임 프로필을 저장할 때 호출한다.
  @Put('me/profile')
  async updateProfile(@CurrentUser() user: JwtUser, @Body() req: UpdateProfileRequest) {
    await this.usersService.updateProfile(user.userId, req)
    return ok(null, '프로필이 저장되었습니다.')
  }
}
