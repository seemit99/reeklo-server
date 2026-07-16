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

  // LoginView 회원가입 폼에서 신규 계정을 만들고, 바로 사용할 JWT를 발급받을 때 호출한다.
  @Post('register')
  async register(@Body() req: RegisterRequest) {
    return ok(await this.authService.register(req), '회원가입 완료')
  }

  // LoginView 로그인 폼에서 이메일과 비밀번호를 검증하고 JWT를 발급받을 때 호출한다.
  @Post('login')
  async login(@Body() req: LoginRequest) {
    return ok(await this.authService.login(req))
  }

  // 프론트가 이메일 인증 UI 표시 여부를 결정하는 데 사용
  // LoginView가 회원가입·비밀번호 재설정 화면에 이메일 인증 UI를 표시할지 확인할 때 호출한다.
  @Get('email/status')
  emailStatus() {
    return ok({ emailVerification: this.authService.emailVerificationEnabled })
  }

  // 회원가입 또는 비밀번호 재설정을 위해 사용자의 이메일로 일회용 인증 코드를 보낼 때 호출한다.
  @Post('email/send-code')
  async sendCode(@Body() req: SendCodeRequest) {
    await this.authService.sendCode(req.email, req.purpose)
    return ok(null, '인증 코드를 발송했습니다. 메일함을 확인해주세요.')
  }

  // 사용자가 입력한 이메일 인증 코드가 유효한지 별도로 확인할 때 호출한다.
  @Post('email/verify')
  async verifyCode(@Body() req: VerifyCodeRequest) {
    await this.authService.verifyCode(req.email, req.code, req.purpose)
    return ok(null, '인증되었습니다.')
  }

  // LoginView의 비밀번호 찾기에서 이메일 코드 확인 후 새 비밀번호로 초기화할 때 호출한다.
  @Post('password/reset')
  async resetPassword(@Body() req: ResetPasswordRequest) {
    await this.authService.resetPassword(req.email, req.code, req.newPassword)
    return ok(null, '비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.')
  }

  // SettingsView에서 로그인 사용자가 현재 비밀번호를 확인하고 새 비밀번호로 변경할 때 호출한다.
  @Post('password/change')
  @UseGuards(JwtAuthGuard)
  async changePassword(@CurrentUser() user: JwtUser, @Body() req: ChangePasswordRequest) {
    await this.authService.changePassword(user.userId, req.currentPassword, req.newPassword)
    return ok(null, '비밀번호가 변경되었습니다.')
  }
}
