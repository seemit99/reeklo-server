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

  @Get()
  async list(@Query('gameType') gameType?: string) {
    return ok(await this.guilds.list(gameType))
  }

  @Get('me')
  async myGuild(@CurrentUser() user: JwtUser) {
    return ok(await this.guilds.myGuild(user.userId))
  }

  @Get(':id')
  async detail(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return ok(await this.guilds.guildDetail(id, user.userId))
  }

  @Post()
  async create(@CurrentUser() user: JwtUser, @Body() body: CreateGuildDto) {
    return ok(await this.guilds.create(user.userId, body), '길드를 창설했습니다!')
  }

  @Post(':id/join')
  async join(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return ok(await this.guilds.join(user.userId, id), '길드에 가입했습니다!')
  }

  @Post('leave')
  async leave(@CurrentUser() user: JwtUser) {
    const r = await this.guilds.leave(user.userId)
    return ok(r, r.disbanded ? '길드를 해체했습니다.' : '길드에서 탈퇴했습니다.')
  }

  @Delete('me')
  async disband(@CurrentUser() user: JwtUser) {
    await this.guilds.disband(user.userId)
    return ok(null, '길드를 해체했습니다.')
  }

  @Delete('members/:userId')
  async kick(@CurrentUser() user: JwtUser, @Param('userId', ParseIntPipe) userId: number) {
    await this.guilds.kick(user.userId, userId)
    return ok(null, '멤버를 추방했습니다.')
  }

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
