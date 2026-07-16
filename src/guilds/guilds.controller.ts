import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards,
} from '@nestjs/common'
import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator'
import { ok } from '../common/api-response'
import { CurrentUser } from '../auth/current-user.decorator'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { JwtUser } from '../auth/jwt.strategy'
import { GuildsService } from './guilds.service'

class CreateGuildDto {
  @Length(2, 30, { message: '길드 이름은 2~30자여야 합니다.' })
  name!: string

  @Length(2, 6, { message: '태그는 2~6자여야 합니다.' })
  tag!: string

  @IsOptional() @IsString() @MaxLength(200)
  description?: string

  @IsOptional() @IsString()
  gameType?: string
}

class RoleDto {
  @IsIn(['OFFICER', 'MEMBER', 'MASTER'])
  role!: 'OFFICER' | 'MEMBER' | 'MASTER'
}

@Controller('api/guilds')
@UseGuards(JwtAuthGuard)
export class GuildsController {
  constructor(private readonly guilds: GuildsService) {}

  // GuildView가 게임 종류 필터에 맞는 공개 길드 목록을 표시할 때 호출한다.
  @Get()
  async list(@Query('gameType') gameType?: string) {
    return ok(await this.guilds.list(gameType))
  }

  // GuildView 진입 시 현재 사용자의 소속 길드와 역할·구성원 정보를 확인할 때 호출한다.
  @Get('me')
  async myGuild(@CurrentUser() user: JwtUser) {
    return ok(await this.guilds.myGuild(user.userId))
  }

  // GuildView에서 선택한 길드의 소개와 구성원 상세 정보를 조회할 때 호출한다.
  @Get(':id')
  async detail(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return ok(await this.guilds.guildDetail(id, user.userId))
  }

  // GuildView의 길드 창설 폼에서 사용자를 MASTER로 하는 새 길드를 만들 때 호출한다.
  @Post()
  async create(@CurrentUser() user: JwtUser, @Body() body: CreateGuildDto) {
    return ok(await this.guilds.create(user.userId, body), '길드를 창설했습니다!')
  }

  // GuildView에서 공개 길드 가입 버튼을 눌러 해당 길드의 MEMBER가 될 때 호출한다.
  @Post(':id/join')
  async join(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return ok(await this.guilds.join(user.userId, id), '길드에 가입했습니다!')
  }

  // GuildView에서 길드를 탈퇴하며, 마지막 MASTER 상황이면 정책에 따라 길드를 해체할 때 호출한다.
  @Post('leave')
  async leave(@CurrentUser() user: JwtUser) {
    const r = await this.guilds.leave(user.userId)
    return ok(r, r.disbanded ? '길드를 해체했습니다.' : '길드에서 탈퇴했습니다.')
  }

  // GuildView에서 길드 MASTER가 자신이 이끄는 길드를 명시적으로 해체할 때 호출한다.
  @Delete('me')
  async disband(@CurrentUser() user: JwtUser) {
    await this.guilds.disband(user.userId)
    return ok(null, '길드를 해체했습니다.')
  }

  // GuildView에서 권한 있는 운영진이 특정 구성원을 길드에서 추방할 때 호출한다.
  @Delete('members/:userId')
  async kick(@CurrentUser() user: JwtUser, @Param('userId', ParseIntPipe) userId: number) {
    await this.guilds.kick(user.userId, userId)
    return ok(null, '멤버를 추방했습니다.')
  }

  // GuildView에서 MASTER가 구성원의 역할을 MASTER·OFFICER·MEMBER 중 하나로 변경할 때 호출한다.
  @Put('members/:userId/role')
  async setRole(
    @CurrentUser() user: JwtUser,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: RoleDto,
  ) {
    await this.guilds.setRole(user.userId, userId, body.role)
    return ok(null, '직책을 변경했습니다.')
  }
}
