import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { PlazasController } from './plazas.controller'
import { PlazasService } from './plazas.service'

@Module({
  imports: [AuthModule],
  controllers: [PlazasController],
  providers: [PlazasService],
})
export class PlazasModule {}
