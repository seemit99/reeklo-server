import { Injectable } from '@nestjs/common'
import { Socket } from 'socket.io'

/** 전역 접속 현황 — userId별 소켓 묶음 (중복 탭 대비 Set). 친구 온라인 표시/귓속말 직송에 사용 */
@Injectable()
export class PresenceService {
  private readonly sockets = new Map<string, Set<Socket>>()

  /** @returns 이 유저의 첫 접속이면 true (오프라인→온라인 전환) */
  add(userId: string, socket: Socket): boolean {
    let set = this.sockets.get(userId)
    if (!set) {
      set = new Set()
      this.sockets.set(userId, set)
    }
    set.add(socket)
    return set.size === 1
  }

  /** @returns 이 유저의 마지막 접속 해제면 true (온라인→오프라인 전환) */
  remove(userId: string, socket: Socket): boolean {
    const set = this.sockets.get(userId)
    if (!set) return false
    set.delete(socket)
    if (set.size === 0) {
      this.sockets.delete(userId)
      return true
    }
    return false
  }

  isOnline(userId: string | number | bigint): boolean {
    return this.sockets.has(String(userId))
  }

  sendToUser(userId: string | number | bigint, event: string, payload: unknown): void {
    const set = this.sockets.get(String(userId))
    if (!set) return
    for (const s of set) s.emit(event, payload)
  }
}
