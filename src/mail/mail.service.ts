import { Injectable, Logger } from '@nestjs/common'
import * as nodemailer from 'nodemailer'

/**
 * SMTP 발송. SMTP_HOST 미설정이면 비활성 모드 — 코드가 서버 로그로만 출력된다(로컬 개발용).
 * 프로드는 .env에 SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/MAIL_FROM 설정 필요.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger('MailService')
  private readonly transporter: nodemailer.Transporter | null

  constructor() {
    this.transporter = process.env.SMTP_HOST
      ? nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT ?? 587),
          secure: process.env.SMTP_SECURE === 'true',
          auth: process.env.SMTP_USER
            ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
            : undefined,
        })
      : null
  }

  get enabled(): boolean {
    return this.transporter !== null
  }

  async sendCode(to: string, code: string, purpose: 'SIGNUP' | 'RESET'): Promise<void> {
    const title = purpose === 'SIGNUP' ? '회원가입 이메일 인증' : '비밀번호 재설정'
    if (!this.transporter) {
      this.logger.warn(`SMTP 미설정 — [${purpose}] ${to} 인증 코드: ${code}`)
      return
    }
    await this.transporter.sendMail({
      from: process.env.MAIL_FROM ?? process.env.SMTP_USER,
      to,
      subject: `[Reeklo] ${title} 인증 코드: ${code}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#1a1a2e;color:#fff;border-radius:12px">
          <h2 style="color:#a78bfa">Reeklo ${title}</h2>
          <p>아래 인증 코드를 입력해주세요. 코드는 <b>10분간</b> 유효합니다.</p>
          <div style="font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;padding:16px;background:#16213e;border-radius:8px;color:#a78bfa">${code}</div>
          <p style="color:#888;font-size:12px;margin-top:16px">본인이 요청하지 않았다면 이 메일을 무시하세요.</p>
        </div>`,
    })
  }
}
