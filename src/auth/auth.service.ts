import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import { MailService } from '../mail/mail.service'
import { PrismaService } from '../prisma/prisma.service'
import { LoginRequest, RegisterRequest, TokenResponse } from './dto'

const CODE_TTL_MS = 10 * 60 * 1000   // 인증 코드 유효 10분
const CODE_RESEND_MS = 60 * 1000     // 재발송 최소 간격 1분

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
  ) {}

  async register(req: RegisterRequest): Promise<TokenResponse> {
    if (await this.prisma.users.findUnique({ where: { email: req.email } })) {
      throw new ConflictException('이미 사용 중인 이메일입니다.')
    }
    if (await this.prisma.users.findUnique({ where: { username: req.username } })) {
      throw new ConflictException('이미 사용 중인 아이디입니다.')
    }
    // 메일 발송이 가능한 환경에서만 이메일 인증을 강제 (SMTP 미설정 로컬/초기 프로드는 통과)
    if (this.mail.enabled) {
      if (!req.emailCode) throw new BadRequestException('이메일 인증 코드를 입력해주세요.')
      await this.consumeCode(req.email, req.emailCode, 'SIGNUP')
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
    return this.tokenOf(user.id, user.email, user.session_version)
  }

  async login(req: LoginRequest): Promise<TokenResponse> {
    const user = await this.prisma.users.findUnique({ where: { email: req.email } })
    if (!user || !(await bcrypt.compare(req.password, user.password))) {
      throw new BadRequestException('이메일 또는 비밀번호가 올바르지 않습니다.')
    }
    const session = await this.prisma.users.update({
      where: { id: user.id },
      data: { session_version: { increment: 1 } },
      select: { session_version: true },
    })
    return this.tokenOf(user.id, user.email, session.session_version)
  }

  // ── 이메일 인증 코드 ──────────────────────────────────

  async sendCode(email: string, purpose: 'SIGNUP' | 'RESET'): Promise<void> {
    const exists = await this.prisma.users.findUnique({ where: { email } })
    if (purpose === 'SIGNUP' && exists) throw new ConflictException('이미 사용 중인 이메일입니다.')
    if (purpose === 'RESET') {
      if (!exists) throw new NotFoundException('가입되지 않은 이메일입니다.')
      if (!this.mail.enabled) {
        throw new ServiceUnavailableException('메일 발송이 설정되지 않아 비밀번호 찾기를 사용할 수 없습니다. 관리자에게 문의하세요.')
      }
    }

    // 재발송 속도 제한
    const recent = await this.prisma.email_codes.findFirst({
      where: { email, purpose }, orderBy: { created_at: 'desc' },
    })
    if (recent && Date.now() - recent.created_at.getTime() < CODE_RESEND_MS) {
      throw new BadRequestException('잠시 후 다시 시도해주세요. (재발송은 1분 간격)')
    }

    const code = String(Math.floor(100000 + Math.random() * 900000))   // 6자리
    await this.prisma.email_codes.deleteMany({ where: { email, purpose } })
    await this.prisma.email_codes.create({
      data: { email, code, purpose, expires_at: new Date(Date.now() + CODE_TTL_MS) },
    })
    await this.mail.sendCode(email, code, purpose)
  }

  /** 코드 일치/만료 확인만 (소비하지 않음) — 가입 폼의 사전 확인용 */
  async verifyCode(email: string, code: string, purpose: 'SIGNUP' | 'RESET'): Promise<void> {
    const row = await this.findValidCode(email, code, purpose)
    await this.prisma.email_codes.update({ where: { id: row.id }, data: { verified: true } })
  }

  /** 코드 확인 후 소비(삭제) — 실제 가입/재설정 시 */
  private async consumeCode(email: string, code: string, purpose: 'SIGNUP' | 'RESET'): Promise<void> {
    const row = await this.findValidCode(email, code, purpose)
    await this.prisma.email_codes.delete({ where: { id: row.id } })
  }

  private async findValidCode(email: string, code: string, purpose: string) {
    const row = await this.prisma.email_codes.findFirst({
      where: { email, purpose }, orderBy: { created_at: 'desc' },
    })
    if (!row || row.code !== code) throw new BadRequestException('인증 코드가 올바르지 않습니다.')
    if (row.expires_at.getTime() < Date.now()) {
      throw new BadRequestException('인증 코드가 만료되었습니다. 다시 발송해주세요.')
    }
    return row
  }

  // ── 비밀번호 ─────────────────────────────────────────

  async resetPassword(email: string, code: string, newPassword: string): Promise<void> {
    await this.consumeCode(email, code, 'RESET')
    const user = await this.prisma.users.findUnique({ where: { email } })
    if (!user) throw new NotFoundException('가입되지 않은 이메일입니다.')
    await this.prisma.users.update({
      where: { id: user.id },
      data: { password: await bcrypt.hash(newPassword, 10) },
    })
  }

  async changePassword(userId: number, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.users.findUnique({ where: { id: BigInt(userId) } })
    if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
      throw new BadRequestException('현재 비밀번호가 올바르지 않습니다.')
    }
    await this.prisma.users.update({
      where: { id: user.id },
      data: { password: await bcrypt.hash(newPassword, 10) },
    })
  }

  get emailVerificationEnabled(): boolean {
    return this.mail.enabled
  }

  // Spring JwtTokenProvider와 동일: HS256, sub=userId, claim email
  private tokenOf(userId: bigint | number, email: string, sessionVersion: number): TokenResponse {
    const accessToken = this.jwt.sign({ email, sessionVersion }, { subject: String(userId) })
    return { accessToken, tokenType: 'Bearer' }
  }
}
