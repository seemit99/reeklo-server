import { BadRequestException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export const ADMIN_TABLES = [
  { key: 'users', label: '사용자' },
  { key: 'plazas', label: '광장' },
  { key: 'rooms', label: '방' },
  { key: 'chat_messages', label: '채팅 메시지' },
  { key: 'reports', label: '신고' },
  { key: 'guilds', label: '길드' },
  { key: 'recovery_questions', label: '복구 질문' },
  { key: 'admin_audit_logs', label: '관리자 감사 로그' },
] as const

type AdminTableKey = (typeof ADMIN_TABLES)[number]['key']

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats() {
    const [
      users,
      activeUsers,
      plazas,
      activePlazas,
      rooms,
      messages,
      openReports,
      guilds,
    ] = await this.prisma.$transaction([
      this.prisma.users.count(),
      this.prisma.users.count({ where: { use_yn: 'Y' } }),
      this.prisma.plazas.count(),
      this.prisma.plazas.count({ where: { use_yn: 'Y' } }),
      this.prisma.rooms.count(),
      this.prisma.chat_messages.count(),
      this.prisma.reports.count({ where: { status: 'OPEN' } }),
      this.prisma.guilds.count(),
    ])
    return {
      users,
      activeUsers,
      plazas,
      activePlazas,
      rooms,
      messages,
      openReports,
      guilds,
    }
  }

  getTables() {
    return ADMIN_TABLES
  }

  async getTable(
    actorUserId: number,
    table: string,
    pageInput: number,
    pageSizeInput: number,
    searchInput?: string,
  ) {
    if (!ADMIN_TABLES.some((item) => item.key === table)) {
      throw new BadRequestException('조회할 수 없는 테이블입니다.')
    }
    const page = Math.max(1, pageInput || 1)
    const pageSize = Math.min(100, Math.max(10, pageSizeInput || 25))
    const skip = (page - 1) * pageSize
    const search = searchInput?.trim().slice(0, 100) || undefined
    const result = await this.queryTable(table as AdminTableKey, skip, pageSize, search)

    await this.prisma.admin_audit_logs.create({
      data: {
        actor_user_id: BigInt(actorUserId),
        action: 'VIEW_TABLE',
        target_type: table,
        metadata: { page, pageSize, searched: !!search },
      },
    })

    return {
      table,
      rows: result.rows,
      pagination: {
        page,
        pageSize,
        total: result.total,
        totalPages: Math.max(1, Math.ceil(result.total / pageSize)),
      },
    }
  }

  private async queryTable(
    table: AdminTableKey,
    skip: number,
    take: number,
    search?: string,
  ): Promise<{ rows: unknown[]; total: number }> {
    switch (table) {
      case 'users': {
        const where = search
          ? {
              OR: [
                { username: { contains: search, mode: 'insensitive' as const } },
                { email: { contains: search, mode: 'insensitive' as const } },
                { nickname: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}
        const [rows, total] = await this.prisma.$transaction([
          this.prisma.users.findMany({
            where,
            skip,
            take,
            orderBy: { created_at: 'desc' },
            select: {
              id: true,
              username: true,
              email: true,
              nickname: true,
              role: true,
              use_yn: true,
              coin: true,
              bio: true,
              main_game: true,
              privacy_consent_yn: true,
              created_at: true,
            },
          }),
          this.prisma.users.count({ where }),
        ])
        return { rows, total }
      }
      case 'plazas': {
        const where = search
          ? { name: { contains: search, mode: 'insensitive' as const } }
          : {}
        const [rows, total] = await this.prisma.$transaction([
          this.prisma.plazas.findMany({
            where,
            skip,
            take,
            orderBy: { created_at: 'desc' },
            select: {
              id: true,
              name: true,
              owner_id: true,
              plaza_type: true,
              category_code: true,
              description: true,
              max_users: true,
              current_users: true,
              is_private: true,
              use_yn: true,
              created_at: true,
            },
          }),
          this.prisma.plazas.count({ where }),
        ])
        return { rows, total }
      }
      case 'rooms': {
        const where = search
          ? { title: { contains: search, mode: 'insensitive' as const } }
          : {}
        const [rows, total] = await this.prisma.$transaction([
          this.prisma.rooms.findMany({
            where,
            skip,
            take,
            orderBy: { created_at: 'desc' },
            select: {
              id: true,
              plaza_id: true,
              owner_id: true,
              title: true,
              room_type: true,
              category_code: true,
              description: true,
              max_users: true,
              current_users: true,
              is_private: true,
              use_yn: true,
              created_at: true,
            },
          }),
          this.prisma.rooms.count({ where }),
        ])
        return { rows, total }
      }
      case 'chat_messages': {
        const where = search
          ? {
              OR: [
                { content: { contains: search, mode: 'insensitive' as const } },
                { sender_nickname: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}
        const [rows, total] = await this.prisma.$transaction([
          this.prisma.chat_messages.findMany({
            where,
            skip,
            take,
            orderBy: { created_at: 'desc' },
            select: {
              id: true,
              message_id: true,
              sender_id: true,
              recipient_id: true,
              sender_nickname: true,
              channel_type: true,
              channel_id: true,
              content: true,
              moderation_status: true,
              use_yn: true,
              created_at: true,
              edited_at: true,
              deleted_at: true,
            },
          }),
          this.prisma.chat_messages.count({ where }),
        ])
        return { rows, total }
      }
      case 'reports': {
        const where = search
          ? {
              OR: [
                { reason: { contains: search, mode: 'insensitive' as const } },
                { detail: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}
        const [rows, total] = await this.prisma.$transaction([
          this.prisma.reports.findMany({
            where,
            skip,
            take,
            orderBy: { created_at: 'desc' },
            select: {
              id: true,
              reporter_id: true,
              reported_user_id: true,
              reason: true,
              detail: true,
              context: true,
              status: true,
              created_at: true,
            },
          }),
          this.prisma.reports.count({ where }),
        ])
        return { rows, total }
      }
      case 'guilds': {
        const where = search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' as const } },
                { tag: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}
        const [rows, total] = await this.prisma.$transaction([
          this.prisma.guilds.findMany({
            where,
            skip,
            take,
            orderBy: { created_at: 'desc' },
            select: {
              id: true,
              name: true,
              tag: true,
              description: true,
              leader_id: true,
              game_type: true,
              max_members: true,
              current_members: true,
              is_public: true,
              created_at: true,
            },
          }),
          this.prisma.guilds.count({ where }),
        ])
        return { rows, total }
      }
      case 'recovery_questions': {
        const where = search
          ? { question: { contains: search, mode: 'insensitive' as const } }
          : {}
        const [rows, total] = await this.prisma.$transaction([
          this.prisma.password_recovery_questions.findMany({
            where,
            skip,
            take,
            orderBy: { created_at: 'desc' },
            select: {
              id: true,
              user_id: true,
              question: true,
              failed_count: true,
              locked_until: true,
              use_yn: true,
              created_at: true,
              updated_at: true,
            },
          }),
          this.prisma.password_recovery_questions.count({ where }),
        ])
        return { rows, total }
      }
      case 'admin_audit_logs': {
        const where = search
          ? { action: { contains: search, mode: 'insensitive' as const } }
          : {}
        const [rows, total] = await this.prisma.$transaction([
          this.prisma.admin_audit_logs.findMany({
            where,
            skip,
            take,
            orderBy: { created_at: 'desc' },
            select: {
              id: true,
              action: true,
              target_type: true,
              target_id: true,
              metadata: true,
              use_yn: true,
              created_at: true,
              actor: { select: { id: true, username: true } },
            },
          }),
          this.prisma.admin_audit_logs.count({ where }),
        ])
        return { rows, total }
      }
    }
  }
}
