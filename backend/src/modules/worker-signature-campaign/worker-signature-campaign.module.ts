import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { RolesGuard } from '../questions/roles.guard';
import { User, UserSchema } from '../users/schemas/user.schema';
import { UsersModule } from '../users/users.module';
import {
  SignatureAudit, SignatureAuditSchema,
  SignatureCampaign, SignatureCampaignSchema,
  SignatureCampaignWorker, SignatureCampaignWorkerSchema,
  SignatureEvidence, SignatureEvidenceSchema,
  SignatureReminder, SignatureReminderSchema,
  SignatureToken, SignatureTokenSchema,
} from './schemas/worker-signature-campaign.schema';
import { WorkerSignatureCampaignController, PublicSignController } from './worker-signature-campaign.controller';
import { WorkerSignatureCampaignService } from './worker-signature-campaign.service';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: SignatureCampaign.name, schema: SignatureCampaignSchema },
      { name: SignatureCampaignWorker.name, schema: SignatureCampaignWorkerSchema },
      { name: SignatureToken.name, schema: SignatureTokenSchema },
      { name: SignatureEvidence.name, schema: SignatureEvidenceSchema },
      { name: SignatureAudit.name, schema: SignatureAuditSchema },
      { name: SignatureReminder.name, schema: SignatureReminderSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [WorkerSignatureCampaignController, PublicSignController],
  providers: [WorkerSignatureCampaignService, RolesGuard, CompanyAccessGuard],
  exports: [WorkerSignatureCampaignService],
})
export class WorkerSignatureCampaignModule {}
