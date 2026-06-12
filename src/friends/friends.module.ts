import { Module } from '@nestjs/common'
import { GatewayModule } from '../gateway/gateway.module'
import { FriendsController } from './friends.controller'
import { FriendsService } from './friends.service'

@Module({
  imports: [GatewayModule],
  controllers: [FriendsController],
  providers: [FriendsService],
})
export class FriendsModule {}
