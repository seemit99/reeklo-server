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
  guildName: string | null
  parts: PartInfo[] | null
  layerOrder: string[] | null
  rigPivots: string | null
  position: Position | null // 움직이기 전엔 null (스폰 지점)
}

interface RosterEntry {
  member: Member
  socketIds: Set<string>
}

/**
 * 광장별 접속자 명단 (닉네임/파츠/마지막 위치) — Spring PlazaRoster 포팅.
 * 새로 입장한 유저에게 기존 접속자를 알려주기 위해 메모리에 유지한다 (단일 인스턴스 전제).
 */
@Injectable()
export class PlazaRosterService {
  // plazaId → (userId → Member)
  private readonly plazas = new Map<string, Map<string, RosterEntry>>()

  /** 입장 등록. 신규 입장이면 true (재입장이면 false) */
  add(plazaId: string, member: Member, socketId: string): boolean {
    let members = this.plazas.get(plazaId)
    if (!members) {
      members = new Map()
      this.plazas.set(plazaId, members)
    }
    const existing = members.get(member.userId)
    if (existing) {
      existing.member = member
      existing.socketIds.add(socketId)
      return false
    }
    members.set(member.userId, { member, socketIds: new Set([socketId]) })
    return true
  }

  /** 퇴장 처리. 실제로 있던 유저였으면 true */
  remove(plazaId: string, userId: string, socketId: string): boolean {
    const members = this.plazas.get(plazaId)
    if (!members) return false
    const existing = members.get(userId)
    if (!existing) return false
    existing.socketIds.delete(socketId)
    if (existing.socketIds.size > 0) return false
    members.delete(userId)
    if (members.size === 0) this.plazas.delete(plazaId)
    return true
  }

  count(plazaId: string): number {
    return this.plazas.get(plazaId)?.size ?? 0
  }

  /** 본인을 제외한 현재 접속자 명단 */
  getMembers(plazaId: string, excludeUserId: string): Member[] {
    const members = this.plazas.get(plazaId)
    if (!members) return []
    return [...members.values()]
      .map((entry) => entry.member)
      .filter((m) => m.userId !== excludeUserId)
  }

  updatePosition(plazaId: string, userId: string, position: Position) {
    const entry = this.plazas.get(plazaId)?.get(userId)
    if (entry) entry.member.position = position
  }
}
