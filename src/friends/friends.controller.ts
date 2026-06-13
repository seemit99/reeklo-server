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

  @Get()
  async list(@CurrentUser() user: JwtUser) {
    return ok(await this.friends.listFriends(user.userId))
  }

  @Get('requests')
  async requests(@CurrentUser() user: JwtUser) {
    return ok(await this.friends.listRequests(user.userId))
  }

  @Post('requests')
  async sendRequest(@CurrentUser() user: JwtUser, @Body() body: SendRequestDto) {
    const result = await this.friends.sendRequest(user.userId, body)
    return ok(result, result.accepted ? '친구가 되었습니다!' : '친구 요청을 보냈습니다.')
  }

  @Post('requests/:id/accept')
  async accept(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    return ok(await this.friends.accept(user.userId, id), '친구가 되었습니다!')
  }

  @Post('requests/:id/reject')
  async reject(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    await this.friends.reject(user.userId, id)
    return ok(null, '요청을 거절했습니다.')
  }

  @Delete('requests/:id')
  async cancel(@CurrentUser() user: JwtUser, @Param('id', ParseIntPipe) id: number) {
    await this.friends.cancelRequest(user.userId, id)
    return ok(null, '요청을 취소했습니다.')
  }

  @Delete(':userId')
  async remove(@CurrentUser() user: JwtUser, @Param('userId', ParseIntPipe) userId: number) {
    await this.friends.removeFriend(user.userId, userId)
    return ok(null, '친구를 삭제했습니다.')
  }

  // ── 차단 ──────────────────────────────────────────────

  @Get('blocks')
  async blocks(@CurrentUser() user: JwtUser) {
    return ok(await this.friends.listBlocks(user.userId))
  }

  @Post('blocks')
  async block(@CurrentUser() user: JwtUser, @Body() body: BlockDto) {
    await this.friends.block(user.userId, body.targetUserId)
    return ok(null, '차단했습니다.')
  }

  @Delete('blocks/:userId')
  async unblock(@CurrentUser() user: JwtUser, @Param('userId', ParseIntPipe) userId: number) {
    await this.friends.unblock(user.userId, userId)
    return ok(null, '차단을 해제했습니다.')
  }

  // ── 신고 ──────────────────────────────────────────────

  @Post('reports')
  async report(@CurrentUser() user: JwtUser, @Body() body: ReportDto) {
    await this.friends.report(user.userId, body)
    return ok(null, '신고가 접수되었습니다. 검토 후 조치하겠습니다.')
  }
}
