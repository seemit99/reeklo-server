import { Module } from '@nestjs/common'
import { PlazasController } from './plazas.controller'
import { PlazasService } from './plazas.service'

@Module({
  controllers: [PlazasController],
  providers: [PlazasService],
})
export class PlazasModule {}
