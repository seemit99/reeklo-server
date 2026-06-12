import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common'
import { ok } from '../common/api-response'
import { CurrentUser } from './current-user.decorator'
import { JwtAuthGuard } from './jwt-auth.guard'
import { JwtUser } from './jwt.strategy'
import { AuthService } from './auth.service'
import {
  ChangePasswordRequest, LoginRequest, RegisterRequest, ResetPasswordRequest,
  SendCodeRequest, VerifyCodeRequest,
} from './dto'

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() req: RegisterRequest) {
    return ok(await this.authService.register(req), '회원가입 완료')
  }

  @Post('login')
  async login(@Body() req: LoginRequest) {
    return ok(await this.authService.login(req))
  }

  // 프론트가 이메일 인증 UI 표시 여부를 결정하는 데 사용
  @Get('email/status')
  emailStatus() {
    return ok({ emailVerification: this.authService.emailVerificationEnabled })
  }

  @Post('email/send-code')
  async sendCode(@Body() req: SendCodeRequest) {
    await this.authService.sendCode(req.email, req.purpose)
    return ok(null, '인증 코드를 발송했습니다. 메일함을 확인해주세요.')
  }

  @Post('email/verify')
  async verifyCode(@Body() req: VerifyCodeRequest) {
    await this.authService.verifyCode(req.email, req.code, req.purpose)
    return ok(null, '인증되었습니다.')
  }

  @Post('password/reset')
  async resetPassword(@Body() req: ResetPasswordRequest) {
    await this.authService.resetPassword(req.email, req.code, req.newPassword)
    return ok(null, '비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.')
  }

  @Post('password/change')
  @UseGuards(JwtAuthGuard)
  async changePassword(@CurrentUser() user: JwtUser, @Body() req: ChangePasswordRequest) {
    await this.authService.changePassword(user.userId, req.currentPassword, req.newPassword)
    return ok(null, '비밀번호가 변경되었습니다.')
  }
}
