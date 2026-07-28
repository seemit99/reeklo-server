import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { JWT_SECRET } from './jwt-secret'
import { PrismaService } from '../prisma/prisma.service'

export interface JwtUser {
  userId: number
  email: string
  sessionVersion: number
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: JWT_SECRET,
      // Spring(jjwt)은 시크릿 길이에 따라 HS384로 서명함 — 기존 토큰 호환을 위해 모두 허용
      algorithms: ['HS256', 'HS384', 'HS512'],
    })
  }

  async validate(payload: { sub: string; email: string; sessionVersion?: number }): Promise<JwtUser> {
    const user = await this.prisma.users.findUnique({
      where: { id: BigInt(payload.sub) },
      select: { session_version: true, use_yn: true },
    })
    if (
      !user ||
      user.use_yn !== 'Y' ||
      payload.sessionVersion == null ||
      user.session_version !== payload.sessionVersion
    ) {
      throw new UnauthorizedException('다른 기기에서 로그인되어 세션이 종료되었습니다.')
    }
    return { userId: Number(payload.sub), email: payload.email, sessionVersion: payload.sessionVersion }
  }
}
