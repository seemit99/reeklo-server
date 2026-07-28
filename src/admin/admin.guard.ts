import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { JwtUser } from '../auth/jwt.strategy'

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: JwtUser }>()
    const userId = request.user?.userId
    if (!userId) throw new ForbiddenException('관리자 권한이 필요합니다.')

    const user = await this.prisma.users.findUnique({
      where: { id: BigInt(userId) },
      select: { role: true, use_yn: true },
    })
    if (!user || user.role !== 'ADMIN' || user.use_yn !== 'Y') {
      throw new ForbiddenException('관리자 권한이 필요합니다.')
    }
    return true
  }
}
