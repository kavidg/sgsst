import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AlertsModule } from '../alerts/alerts.module';
import { DocumentManagementModule } from '../document-management/document-management.module';
import { AnnualWorkPlanModule } from '../annual-work-plan/annual-work-plan.module';
import { RolesGuard } from '../questions/roles.guard';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { AccountabilityController } from './accountability.controller';
import { AccountabilityService } from './services/accountability.service';
import { AccountabilityReportService } from './services/accountability-report.service';
import { AccountabilityMeetingService } from './services/accountability-meeting.service';
import { AccountabilityCommitmentService } from './services/accountability-commitment.service';
import { AccountabilityHistoryService } from './services/accountability-history.service';
import { AccountabilityReport, AccountabilityReportSchema } from './schemas/accountability-report.schema';
import { AccountabilityMeeting, AccountabilityMeetingSchema } from './schemas/accountability-meeting.schema';
import { AccountabilityCommitment, AccountabilityCommitmentSchema } from './schemas/accountability-commitment.schema';
import { AccountabilityHistory, AccountabilityHistorySchema } from './schemas/accountability-history.schema';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    AlertsModule,
    DocumentManagementModule,
    AnnualWorkPlanModule,
    MongooseModule.forFeature([
      { name: AccountabilityReport.name, schema: AccountabilityReportSchema },
      { name: AccountabilityMeeting.name, schema: AccountabilityMeetingSchema },
      { name: AccountabilityCommitment.name, schema: AccountabilityCommitmentSchema },
      { name: AccountabilityHistory.name, schema: AccountabilityHistorySchema },
    ]),
  ],
  controllers: [AccountabilityController],
  providers: [
    AccountabilityService,
    AccountabilityReportService,
    AccountabilityMeetingService,
    AccountabilityCommitmentService,
    AccountabilityHistoryService,
    RolesGuard,
    CompanyAccessGuard,
  ],
  exports: [
    AccountabilityService,
    AccountabilityReportService,
    AccountabilityMeetingService,
    AccountabilityCommitmentService,
    AccountabilityHistoryService,
  ],
})
export class AccountabilityModule {}
