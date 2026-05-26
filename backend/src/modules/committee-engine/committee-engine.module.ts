import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AlertsModule } from '../alerts/alerts.module';
import { CommitteeEngineController } from './committee-engine.controller';
import { CommitteeEngineService } from './committee-engine.service';
import { CommitteePeriod, CommitteePeriodSchema } from './schemas/committee.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: CommitteePeriod.name, schema: CommitteePeriodSchema }]), AlertsModule],
  controllers: [CommitteeEngineController],
  providers: [CommitteeEngineService],
  exports: [CommitteeEngineService],
})
export class CommitteeEngineModule {}
