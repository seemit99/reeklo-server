import { Injectable } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { JWT_SECRET } from './jwt-secret'

export interface JwtUser {
  userId: number
  email: string
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: JWT_SECRET,
      // Spring(jjwt)은 시크릿 길이에 따라 HS384로 서명함 — 기존 토큰 호환을 위해 모두 허용
      algorithms: ['HS256', 'HS384', 'HS512'],
    })
  }

  validate(payload: { sub: string; email: string }): JwtUser {
    return { userId: Number(payload.sub), email: payload.email }
  }
}
