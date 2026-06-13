import { Controller, Get, UseGuards } from '@nestjs/common'
import * as crypto from 'crypto'
import { ok } from '../common/api-response'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'

const STUN = { urls: 'stun:stun.l.google.com:19302' }
const TTL_SEC = 12 * 60 * 60 // 자격증명 12시간 유효

/**
 * WebRTC ICE 서버 발급. coturn `use-auth-secret`(TURN REST API) 방식 —
 * username = "<만료타임스탬프>:reeklo", credential = base64(HMAC-SHA1(TURN_SECRET, username)).
 * 시크릿은 서버/coturn만 보유하고 브라우저에는 시간제한 자격증명만 내려간다.
 * TURN_SECRET 미설정(로컬)이면 STUN만 반환.
 */
@Controller('api/turn-credentials')
@UseGuards(JwtAuthGuard)
export class TurnController {
  @Get()
  get() {
    const secret = process.env.TURN_SECRET
    const base = process.env.TURN_URL // 예: turn:34.64.244.91:3478
    if (!secret || !base) return ok({ iceServers: [STUN] })

    const expiry = Math.floor(Date.now() / 1000) + TTL_SEC
    const username = `${expiry}:reeklo`
    const credential = crypto.createHmac('sha1', secret).update(username).digest('base64')

    return ok({
      iceServers: [
        STUN,
        { urls: [`${base}?transport=udp`, `${base}?transport=tcp`], username, credential },
      ],
    })
  }
}
