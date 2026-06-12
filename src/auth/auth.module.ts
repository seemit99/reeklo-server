import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { MailModule } from '../mail/mail.module'
import { JWT_SECRET } from './jwt-secret'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { JwtStrategy } from './jwt.strategy'

@Module({
  imports: [
    MailModule,
    JwtModule.register({
      secret: JWT_SECRET,
      signOptions: {
        algorithm: 'HS256',
        // Spring JWT_EXPIRATION(ms)과 동일 — jsonwebtoken은 숫자를 초로 해석하므로 변환
        expiresIn: Math.floor(Number(process.env.JWT_EXPIRATION ?? 86400000) / 1000),
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [JwtStrategy, JwtModule],
})
export class AuthModule {}
