import { Body, Controller, Post } from '@nestjs/common'
import { ok } from '../common/api-response'
import { AuthService } from './auth.service'
import { LoginRequest, RegisterRequest } from './dto'

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
}
