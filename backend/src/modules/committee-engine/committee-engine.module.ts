import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AlertsModule } from '../alerts/alerts.module';
import { AuthModule } from '../auth/auth.module';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { CompanyUser, CompanyUserSchema } from '../companies/schemas/company-user.schema';
import { RolesGuard } from '../questions/roles.guard';
import { User, UserSchema } from '../users/schemas/user.schema';
import { CommitteeEngineController } from './committee-engine.controller';
import { CommitteeEngineService } from './committee-engine.service';
import { CommitteePeriod, CommitteePeriodSchema } from './schemas/committee.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: CommitteePeriod.name, schema: CommitteePeriodSchema },
      { name: User.name, schema: UserSchema },
      { name: CompanyUser.name, schema: CompanyUserSchema },
    ]),
    AlertsModule,
  ],
  controllers: [CommitteeEngineController],
  providers: [CommitteeEngineService, RolesGuard, CompanyAccessGuard],
  exports: [CommitteeEngineService],
})
export class CommitteeEngineModule {}
