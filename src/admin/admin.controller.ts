import {
  Controller, DefaultValuePipe, Get, Header, Param, ParseIntPipe, Query, UseGuards,
} from '@nestjs/common'
import { CurrentUser } from '../auth/current-user.decorator'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { JwtUser } from '../auth/jwt.strategy'
import { ok } from '../common/api-response'
import { AdminGuard } from './admin.guard'
import { AdminService } from './admin.service'

@Controller('api/admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  @Header('Cache-Control', 'no-store')
  async stats() {
    return ok(await this.adminService.getStats())
  }

  @Get('tables')
  @Header('Cache-Control', 'no-store')
  tables() {
    return ok(this.adminService.getTables())
  }

  @Get('tables/:table')
  @Header('Cache-Control', 'no-store')
  async table(
    @CurrentUser() user: JwtUser,
    @Param('table') table: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(25), ParseIntPipe) pageSize: number,
    @Query('search') search?: string,
  ) {
    return ok(await this.adminService.getTable(user.userId, table, page, pageSize, search))
  }
}
