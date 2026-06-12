import { BadRequestException, ConflictException, Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../prisma/prisma.service'
import { LoginRequest, RegisterRequest, TokenResponse } from './dto'

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(req: RegisterRequest): Promise<TokenResponse> {
    if (await this.prisma.users.findUnique({ where: { email: req.email } })) {
      throw new ConflictException('이미 사용 중인 이메일입니다.')
    }
    if (await this.prisma.users.findUnique({ where: { username: req.username } })) {
      throw new ConflictException('이미 사용 중인 아이디입니다.')
    }

    const user = await this.prisma.users.create({
      data: {
        username: req.username,
        email: req.email,
        password: await bcrypt.hash(req.password, 10),
        nickname: req.nickname,
        coin: 0,
      },
    })
    return this.tokenOf(user.id, user.email)
  }

  async login(req: LoginRequest): Promise<TokenResponse> {
    const user = await this.prisma.users.findUnique({ where: { email: req.email } })
    if (!user || !(await bcrypt.compare(req.password, user.password))) {
      throw new BadRequestException('이메일 또는 비밀번호가 올바르지 않습니다.')
    }
    return this.tokenOf(user.id, user.email)
  }

  // Spring JwtTokenProvider와 동일: HS256, sub=userId, claim email
  private tokenOf(userId: bigint | number, email: string): TokenResponse {
    const accessToken = this.jwt.sign({ email }, { subject: String(userId) })
    return { accessToken, tokenType: 'Bearer' }
  }
}
