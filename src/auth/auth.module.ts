import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { JwtStrategy } from './jwt.strategy'

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'gamerspace-secret-key-must-be-at-least-256-bits-long-for-hs256',
      signOptions: {
        algorithm: 'HS256',
        // Spring JWT_EXPIRATION(ms)과 동일 — jsonwebtoken은 숫자를 초로 해석하므로 변환
        expiresIn: Math.floor(Number(process.env.JWT_EXPIRATION ?? 86400000) / 1000),
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [JwtStrategy],
})
export class AuthModule {}
