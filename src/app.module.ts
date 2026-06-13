import { Module } from '@nestjs/common'
import { PrismaModule } from './prisma/prisma.module'
import { AuthModule } from './auth/auth.module'
import { UsersModule } from './users/users.module'
import { PlazasModule } from './plazas/plazas.module'
import { RoomsModule } from './rooms/rooms.module'
import { CharacterModule } from './character/character.module'
import { ItemsModule } from './items/items.module'
import { UploadsModule } from './uploads/uploads.module'
import { GatewayModule } from './gateway/gateway.module'
import { FriendsModule } from './friends/friends.module'
import { MailModule } from './mail/mail.module'
import { TurnModule } from './turn/turn.module'

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    PlazasModule,
    RoomsModule,
    CharacterModule,
    ItemsModule,
    UploadsModule,
    GatewayModule,
    FriendsModule,
    MailModule,
    TurnModule,
  ],
})
export class AppModule {}
