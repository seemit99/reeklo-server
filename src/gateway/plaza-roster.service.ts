import { Injectable } from '@nestjs/common'

// Spring PlazaUserHandler.PartInfo / PlazaRoster.Member와 동일한 형태
export interface PartInfo {
  type: string
  url: string
  pivotX: number | null
  pivotY: number | null
}

export interface Position {
  x: number
  y: number
  direction: string
}

export interface Member {
  userId: string
  nickname: string | null
  parts: PartInfo[] | null
  layerOrder: string[] | null
  rigPivots: string | null
  position: Position | null // 움직이기 전엔 null (스폰 지점)
}

/**
 * 광장별 접속자 명단 (닉네임/파츠/마지막 위치) — Spring PlazaRoster 포팅.
 * 새로 입장한 유저에게 기존 접속자를 알려주기 위해 메모리에 유지한다 (단일 인스턴스 전제).
 */
@Injectable()
export class PlazaRosterService {
  // plazaId → (userId → Member)
  private readonly plazas = new Map<string, Map<string, Member>>()

  /** 입장 등록. 신규 입장이면 true (재입장이면 false) */
  add(plazaId: string, member: Member): boolean {
    let members = this.plazas.get(plazaId)
    if (!members) {
      members = new Map()
      this.plazas.set(plazaId, members)
    }
    const isNew = !members.has(member.userId)
    members.set(member.userId, member)
    return isNew
  }

  /** 퇴장 처리. 실제로 있던 유저였으면 true */
  remove(plazaId: string, userId: string): boolean {
    const members = this.plazas.get(plazaId)
    if (!members) return false
    const removed = members.delete(userId)
    if (removed && members.size === 0) this.plazas.delete(plazaId)
    return removed
  }

  /** 본인을 제외한 현재 접속자 명단 */
  getMembers(plazaId: string, excludeUserId: string): Member[] {
    const members = this.plazas.get(plazaId)
    if (!members) return []
    return [...members.values()].filter((m) => m.userId !== excludeUserId)
  }

  updatePosition(plazaId: string, userId: string, position: Position) {
    const member = this.plazas.get(plazaId)?.get(userId)
    if (member) member.position = position
  }
}
