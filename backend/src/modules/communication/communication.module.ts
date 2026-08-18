import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { RolesGuard } from '../questions/roles.guard';
import { CompanyUser, CompanyUserSchema } from '../companies/schemas/company-user.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { UsersModule } from '../users/users.module';
import { AlertsModule } from '../alerts/alerts.module';
import { CommunicationController } from './communication.controller';
import { CommunicationService } from './communication.service';
import { AutoCommunicationService } from './auto-communication.service';
import { Communication, CommunicationSchema } from './schemas/communication.schema';
import { CommunicationRecipient, CommunicationRecipientSchema } from './schemas/communication-recipient.schema';
import { CommunicationReadReceipt, CommunicationReadReceiptSchema } from './schemas/communication-read-receipt.schema';
import { CommunicationSignature, CommunicationSignatureSchema } from './schemas/communication-signature.schema';
import { CommunicationCampaign, CommunicationCampaignSchema } from './schemas/communication-campaign.schema';
import { CommunicationSurvey, CommunicationSurveySchema } from './schemas/communication-survey.schema';
import { CommunicationSurveyResponse, CommunicationSurveyResponseSchema } from './schemas/communication-survey-response.schema';
import { CommunicationMailbox, CommunicationMailboxSchema } from './schemas/communication-mailbox.schema';
import { CommunicationHistory, CommunicationHistorySchema } from './schemas/communication-history.schema';
import { Employee, EmployeeSchema } from '../employees/schemas/employee.schema';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    AlertsModule,
    MongooseModule.forFeature([
      { name: Communication.name, schema: CommunicationSchema },
      { name: CommunicationRecipient.name, schema: CommunicationRecipientSchema },
      { name: CommunicationReadReceipt.name, schema: CommunicationReadReceiptSchema },
      { name: CommunicationSignature.name, schema: CommunicationSignatureSchema },
      { name: CommunicationCampaign.name, schema: CommunicationCampaignSchema },
      { name: CommunicationSurvey.name, schema: CommunicationSurveySchema },
      { name: CommunicationSurveyResponse.name, schema: CommunicationSurveyResponseSchema },
      { name: CommunicationMailbox.name, schema: CommunicationMailboxSchema },
      { name: CommunicationHistory.name, schema: CommunicationHistorySchema },
      { name: Employee.name, schema: EmployeeSchema },
      { name: User.name, schema: UserSchema },
      { name: CompanyUser.name, schema: CompanyUserSchema },
    ]),
  ],
  controllers: [CommunicationController],
  providers: [CommunicationService, AutoCommunicationService, RolesGuard, CompanyAccessGuard],
  exports: [CommunicationService, AutoCommunicationService],
})
export class CommunicationModule {}
