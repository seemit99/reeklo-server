import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { GameGateway } from './game.gateway'
import { PlazaRosterService } from './plaza-roster.service'

@Module({
  imports: [AuthModule],
  providers: [GameGateway, PlazaRosterService],
})
export class GatewayModule {}
