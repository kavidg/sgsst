import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { RolesGuard } from '../questions/roles.guard';
import { RisksController } from './risks.controller';
import { RisksService } from './risks.service';
import { Risk, RiskSchema } from './schemas/risk.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }, { name: Risk.name, schema: RiskSchema }]),
    UsersModule,
  ],
  controllers: [RisksController],
  providers: [RisksService, RolesGuard],
})
export class RisksModule {}
