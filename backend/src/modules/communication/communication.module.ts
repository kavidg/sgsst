import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { AlertsModule } from '../alerts/alerts.module';
import { CommunicationController } from './communication.controller';
import { CommunicationService } from './communication.service';
import { Communication, CommunicationSchema } from './schemas/communication.schema';
import { CommunicationRecipient, CommunicationRecipientSchema } from './schemas/communication-recipient.schema';
import { CommunicationReadReceipt, CommunicationReadReceiptSchema } from './schemas/communication-read-receipt.schema';
import { CommunicationSignature, CommunicationSignatureSchema } from './schemas/communication-signature.schema';
import { CommunicationCampaign, CommunicationCampaignSchema } from './schemas/communication-campaign.schema';
import { CommunicationSurvey, CommunicationSurveySchema } from './schemas/communication-survey.schema';
import { CommunicationSurveyResponse, CommunicationSurveyResponseSchema } from './schemas/communication-survey-response.schema';
import { CommunicationMailbox, CommunicationMailboxSchema } from './schemas/communication-mailbox.schema';
import { CommunicationHistory, CommunicationHistorySchema } from './schemas/communication-history.schema';

@Module({
  imports: [
    AuthModule,
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
    ]),
  ],
  controllers: [CommunicationController],
  providers: [CommunicationService],
  exports: [CommunicationService],
})
export class CommunicationModule {}
