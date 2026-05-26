import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AlertsModule } from '../alerts/alerts.module';
import { AuthModule } from '../auth/auth.module';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { RolesGuard } from '../questions/roles.guard';
import { CommitteeEngineController } from './committee-engine.controller';
import { CommitteeEngineService } from './committee-engine.service';
import { CommitteePeriod, CommitteePeriodSchema } from './schemas/committee.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([{ name: CommitteePeriod.name, schema: CommitteePeriodSchema }]),
    AlertsModule,
  ],
  controllers: [CommitteeEngineController],
  providers: [CommitteeEngineService, RolesGuard, CompanyAccessGuard],
  exports: [CommitteeEngineService],
})
export class CommitteeEngineModule {}
