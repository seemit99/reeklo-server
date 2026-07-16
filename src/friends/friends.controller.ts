import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Post, UseGuards,
} from '@nestjs/common'
import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator'
import { ok } from '../common/api-response'
import { CurrentUser } from '../auth/current-user.decorator'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { JwtUser } from '../auth/jwt.strategy'
import { FriendsService } from './friends.service'

class SendRequestDto {
  @IsOptional() @IsString()
  username?: string

  @IsOptional() @IsInt()
  targetUserId?: number
}

class BlockDto {
  @IsInt()
  targetUserId!: number
}

class ReportDto {
  @IsInt()
  targetUserId!: number

  @IsIn(['ABUSE', 'SPAM', 'INAPPROPRIATE', 'HARASSMENT', 'ETC'])
  reason!: string

  @IsOptional() @IsString() @MaxLength(500)
  detail?: string

  @IsOptional() @IsString()
  context?: string
}

@Controller('api/friends')
@UseGuards(JwtAuthGuard)
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  // FriendsPanel이 수락된 친구 목록과 현재 온라인 상태를 표시할 때 호출한다.
  @Get()
  async list(@CurrentUser() user: JwtUser) {
    return ok(await this.friends.listFriends(user.userId))
  }

  // FriendsPanel이 받은 요청과 보낸 요청 목록을 나누어 표시할 때 호출한다.
  @Get('requests')
  async requests(@CurrentUser() user: JwtUser) {
    return ok(await this.friends.listRequests(user.userId))
  }

  // FriendsPanel 또는 PlazaView 사용자 메뉴에서 username/userId로 친구 요청을 보낼 때 호출한다.
  @Post('requests')
  async sendRequest(@CurrentUser() user: JwtUser, @Body() body: SendRequestDto) {
    const result = await this.friends.sendRequest(user.userId, body)
    return ok(result, result.accepted ? '친구가 되었습니다!' : '친구 요청을 보냈습니다.')
  }

  // FriendsPanel에서 받은 친구 요청을 수락해 양쪽을 친구 관계로 만들 때 호출한다.
  @Post('requests/:id/accept')
  async accept(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return ok(await this.friends.accept(user.userId, id), '친구가 되었습니다!')
  }

  // FriendsPanel에서 받은 친구 요청을 거절할 때 호출한다.
  @Post('requests/:id/reject')
  async reject(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    await this.friends.reject(user.userId, id)
    return ok(null, '요청을 거절했습니다.')
  }

  // FriendsPanel에서 내가 보낸 대기 중 친구 요청을 취소할 때 호출한다.
  @Delete('requests/:id')
  async cancel(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    await this.friends.cancelRequest(user.userId, id)
    return ok(null, '요청을 취소했습니다.')
  }

  // FriendsPanel에서 기존 친구를 친구 목록에서 삭제할 때 호출한다.
  @Delete(':userId')
  async remove(@CurrentUser() user: JwtUser, @Param('userId', ParseIntPipe) userId: number) {
    await this.friends.removeFriend(user.userId, userId)
    return ok(null, '친구를 삭제했습니다.')
  }

  // ── 차단 ──────────────────────────────────────────────

  // FriendsPanel과 PlazaView가 내가 차단한 사용자 목록을 불러올 때 호출한다.
  @Get('blocks')
  async blocks(@CurrentUser() user: JwtUser) {
    return ok(await this.friends.listBlocks(user.userId))
  }

  // PlazaView 사용자 메뉴에서 상대를 차단하고 친구·채팅 상호작용을 막을 때 호출한다.
  @Post('blocks')
  async block(@CurrentUser() user: JwtUser, @Body() body: BlockDto) {
    await this.friends.block(user.userId, body.targetUserId)
    return ok(null, '차단했습니다.')
  }

  // FriendsPanel 또는 PlazaView 사용자 메뉴에서 상대 차단을 해제할 때 호출한다.
  @Delete('blocks/:userId')
  async unblock(@CurrentUser() user: JwtUser, @Param('userId', ParseIntPipe) userId: number) {
    await this.friends.unblock(user.userId, userId)
    return ok(null, '차단을 해제했습니다.')
  }

  // ── 신고 ──────────────────────────────────────────────

  // PlazaView 사용자 메뉴에서 신고 사유와 상세 내용을 운영 검토용으로 접수할 때 호출한다.
  @Post('reports')
  async report(@CurrentUser() user: JwtUser, @Body() body: ReportDto) {
    await this.friends.report(user.userId, body)
    return ok(null, '신고가 접수되었습니다. 검토 후 조치하겠습니다.')
  }
}
