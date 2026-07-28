import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query, UseGuards } from '@nestjs/common'
import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'
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

  @IsString()
  categoryCode!: string

  @IsOptional()
  @MaxLength(300)
  description?: string

  @IsOptional()
  @IsArray()
  tags?: string[]

  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean

  @IsOptional()
  @IsString()
  @MinLength(4, { message: '비밀번호는 4자 이상이어야 합니다.' })
  @MaxLength(30, { message: '비밀번호는 30자 이하여야 합니다.' })
  password?: string
}

@Controller('api/plazas')
export class PlazasController {
  constructor(private readonly plazasService: PlazasService) {}

  // LobbyView가 카드로 표시할 PUBLIC 광장 목록과 현재/최대 인원수를 가져올 때 호출한다.
  @Get()
  async getPlazas(
    @Query('category') category?: string,
    @Query('keyword') keyword?: string,
    @Query('tag') tag?: string,
    @Query('onlyJoinable') onlyJoinable?: string,
  ) {
    return ok(await this.plazasService.getPlazas({
      category,
      keyword,
      tag,
      onlyJoinable: onlyJoinable === 'true',
    }))
  }

  @Get('categories/all')
  async getCategories() {
    return ok(await this.plazasService.getCategories())
  }

  // ':id'보다 먼저 선언해야 'me'가 숫자 파싱에 걸리지 않음
  // LobbyView의 '내 광장' 버튼에서 개인 광장을 조회하고, 아직 없으면 자동 생성할 때 호출한다.
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async myPlaza(@CurrentUser() user: JwtUser) {
    return ok(await this.plazasService.getOrCreatePersonalPlaza(user.userId))
  }

  // 로그인 직후 최근 광장 또는 입장 가능한 활성 광장을 자동 배정한다.
  @Post('assign')
  @UseGuards(JwtAuthGuard)
  async assign(@CurrentUser() user: JwtUser) {
    return ok(await this.plazasService.assignPublicPlaza(user.userId), '입장할 광장을 배정했습니다.')
  }

  // 친구 패널이나 사용자 메뉴에서 다른 사용자의 개인 광장을 방문할 때 호출한다.
  @Get('user/:userId')
  @UseGuards(JwtAuthGuard)
  async userPlaza(@Param('userId', ParseIntPipe) userId: number) {
    return ok(await this.plazasService.getOrCreatePersonalPlaza(userId))
  }

  // PlazaView 진입 시 광장 이름·종류·장식 배치 등 상세 정보를 불러올 때 호출한다.
  @Get(':id')
  async getPlaza(@Param('id', ParseIntPipe) id: number) {
    return ok(await this.plazasService.getPlaza(id))
  }

  // 관리자 또는 광장 생성 기능에서 새로운 공용 광장 레코드를 만들 때 호출한다.
  @Post()
  @UseGuards(JwtAuthGuard)
  async createPlaza(@CurrentUser() user: JwtUser, @Body() req: CreatePlazaRequest) {
    return ok(await this.plazasService.createPlaza(user.userId, req), '광장 생성 완료')
  }

  @Post(':id/access')
  @UseGuards(JwtAuthGuard)
  async access(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
    @Body() body: { password?: string } | undefined,
  ) {
    return ok(await this.plazasService.issueAccessToken(user.userId, id, body?.password))
  }

  // REST 방식 광장 입장 인원 증가용 호환 API다. 현재 WEP은 Socket.IO plaza:join을 사용한다.
  @Post(':id/join')
  @UseGuards(JwtAuthGuard)
  async join(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    await this.plazasService.rememberPlaza(user.userId, id)
    await this.plazasService.join(id)
    return ok(null, '광장 입장')
  }

  // 광장 변경 시 다음 로그인에서 다시 방문할 수 있도록 선택 기록만 갱신한다.
  @Post(':id/remember')
  @UseGuards(JwtAuthGuard)
  async remember(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    await this.plazasService.rememberPlaza(user.userId, id)
    return ok(null, '최근 광장을 저장했습니다.')
  }

  // REST 방식 광장 퇴장 인원 감소용 호환 API다. 현재 WEP은 Socket.IO plaza:leave를 사용한다.
  @Post(':id/leave')
  @UseGuards(JwtAuthGuard)
  async leave(@Param('id', ParseIntPipe) id: number) {
    await this.plazasService.leave(id)
    return ok(null, '광장 퇴장')
  }

  // PlazaView에서 개인 광장 가구 배치를 저장할 때 호출하며 광장 소유자만 수정할 수 있다.
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
