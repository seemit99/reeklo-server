import { Module } from '@nestjs/common'
import { GatewayModule } from '../gateway/gateway.module'
import { GuildsController } from './guilds.controller'
import { GuildsService } from './guilds.service'

@Module({
  imports: [GatewayModule],
  controllers: [GuildsController],
  providers: [GuildsService],
})
export class GuildsModule {}
