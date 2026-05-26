import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AlertsModule } from '../alerts/alerts.module';
import { AuthModule } from '../auth/auth.module';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { CompanyUser, CompanyUserSchema } from '../companies/schemas/company-user.schema';
import { RolesGuard } from '../questions/roles.guard';
import { User, UserSchema } from '../users/schemas/user.schema';
import { UsersModule } from '../users/users.module';
import { CopasstController } from './copasst.controller';
import { CopasstService } from './copasst.service';
import { CopasstPeriod, CopasstPeriodSchema } from './schemas/copasst.schema';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    AlertsModule,
    MongooseModule.forFeature([
      { name: CopasstPeriod.name, schema: CopasstPeriodSchema },
      { name: User.name, schema: UserSchema },
      { name: CompanyUser.name, schema: CompanyUserSchema },
    ]),
  ],
  controllers: [CopasstController],
  providers: [CopasstService, RolesGuard, CompanyAccessGuard],
})
export class CopasstModule {}
