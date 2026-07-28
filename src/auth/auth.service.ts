import {
  BadRequestException, ConflictException, HttpException, HttpStatus, Injectable,
  NotFoundException, ServiceUnavailableException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import { MailService } from '../mail/mail.service'
import { PrismaService } from '../prisma/prisma.service'
import { LoginRequest, RegisterRequest, TokenResponse } from './dto'
import { normalizeRecoveryAnswer } from './recovery-questions'

const CODE_TTL_MS = 10 * 60 * 1000   // 인증 코드 유효 10분
const CODE_RESEND_MS = 60 * 1000     // 재발송 최소 간격 1분
const RECOVERY_MAX_FAILURES = 5
const RECOVERY_LOCK_MS = 15 * 60 * 1000
const DUMMY_RECOVERY_HASH = bcrypt.hashSync('invalid-recovery-answer', 10)

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
    const user = await this.prisma.users.create({
      data: {
        username: req.username,
        email: req.email,
        password: await bcrypt.hash(req.password, 10),
        nickname: req.nickname,
        coin: 0,
        privacy_consent_yn: req.privacyConsentYn,
        privacy_consent_at: new Date(),
        privacy_policy_version: '2026-07-28',
        password_recovery_questions: {
          create: {
            question: req.recoveryQuestion,
            answer_hash: await bcrypt.hash(normalizeRecoveryAnswer(req.recoveryAnswer), 10),
          },
        },
      },
    })
    return this.tokenOf(user.id, user.email, user.session_version)
  }

  async login(req: LoginRequest): Promise<TokenResponse> {
    const user =
      (await this.prisma.users.findUnique({ where: { email: req.email } })) ??
      (await this.prisma.users.findUnique({ where: { username: req.email } }))
    if (!user || user.use_yn !== 'Y' || !(await bcrypt.compare(req.password, user.password))) {
      throw new BadRequestException('이메일·아이디 또는 비밀번호가 올바르지 않습니다.')
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

  async resetPasswordByQuestion(
    email: string,
    recoveryQuestion: string,
    recoveryAnswer: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.users.findUnique({
      where: { email },
      include: {
        password_recovery_questions: {
          where: { use_yn: 'Y' },
          orderBy: { created_at: 'desc' },
          take: 1,
        },
      },
    })
    const recovery = user?.password_recovery_questions[0]

    if (!user || !recovery) {
      // 등록되지 않은 계정도 해시 비교를 거쳐 응답 시간 차이를 줄인다.
      await bcrypt.compare(normalizeRecoveryAnswer(recoveryAnswer), DUMMY_RECOVERY_HASH)
      throw new BadRequestException('이메일, 질문 또는 답변이 올바르지 않습니다.')
    }

    if (recovery.locked_until && recovery.locked_until.getTime() > Date.now()) {
      throw new HttpException(
        '답변 확인 횟수를 초과했습니다. 15분 후 다시 시도해주세요.',
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }

    const failedCount = recovery.locked_until ? 0 : recovery.failed_count
    const answerMatches = await bcrypt.compare(
      normalizeRecoveryAnswer(recoveryAnswer),
      recovery.answer_hash,
    )
    if (recovery.question !== recoveryQuestion || !answerMatches) {
      const nextFailedCount = failedCount + 1
      await this.prisma.password_recovery_questions.update({
        where: { id: recovery.id },
        data: {
          failed_count: nextFailedCount,
          locked_until:
            nextFailedCount >= RECOVERY_MAX_FAILURES
              ? new Date(Date.now() + RECOVERY_LOCK_MS)
              : null,
          updated_at: new Date(),
        },
      })
      throw new BadRequestException('이메일, 질문 또는 답변이 올바르지 않습니다.')
    }

    await this.prisma.$transaction([
      this.prisma.users.update({
        where: { id: user.id },
        data: {
          password: await bcrypt.hash(newPassword, 10),
          session_version: { increment: 1 },
        },
      }),
      this.prisma.password_recovery_questions.update({
        where: { id: recovery.id },
        data: { failed_count: 0, locked_until: null, updated_at: new Date() },
      }),
    ])
  }

  async getRecoveryQuestionStatus(userId: number) {
    const recovery = await this.prisma.password_recovery_questions.findFirst({
      where: { user_id: BigInt(userId), use_yn: 'Y' },
      orderBy: { created_at: 'desc' },
      select: { question: true },
    })
    return { configured: !!recovery, question: recovery?.question ?? null }
  }

  async setRecoveryQuestion(
    userId: number,
    currentPassword: string,
    recoveryQuestion: string,
    recoveryAnswer: string,
  ): Promise<void> {
    const user = await this.prisma.users.findUnique({ where: { id: BigInt(userId) } })
    if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
      throw new BadRequestException('현재 비밀번호가 올바르지 않습니다.')
    }

    const answerHash = await bcrypt.hash(normalizeRecoveryAnswer(recoveryAnswer), 10)
    await this.prisma.$transaction([
      this.prisma.password_recovery_questions.updateMany({
        where: { user_id: user.id, use_yn: 'Y' },
        data: { use_yn: 'N', updated_at: new Date() },
      }),
      this.prisma.password_recovery_questions.create({
        data: {
          user_id: user.id,
          question: recoveryQuestion,
          answer_hash: answerHash,
          use_yn: 'Y',
        },
      }),
    ])
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
