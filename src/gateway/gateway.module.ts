import { Module } from '@nestjs/common'
import { AuthModule } from '../auth/auth.module'
import { GameGateway } from './game.gateway'
import { PlazaRosterService } from './plaza-roster.service'
import { PresenceService } from './presence.service'

@Module({
  imports: [AuthModule],
  providers: [GameGateway, PlazaRosterService, PresenceService],
  exports: [PresenceService],
})
export class GatewayModule {}
