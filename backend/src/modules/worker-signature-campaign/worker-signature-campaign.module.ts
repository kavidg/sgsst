import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { RolesGuard } from '../questions/roles.guard';
import { User, UserSchema } from '../users/schemas/user.schema';
import { UsersModule } from '../users/users.module';
// Fase 2 — seguridad del flujo público: store OTP compartido + rate-limit
// distribuido (infraestructura existente del repo, patrón COPASST F7B-10).
import { OtpChallengeModule } from '../otp-challenge/otp-challenge.module';
import { OtpRateLimitModule } from '../otp-rate-limit/otp-rate-limit.module';
// Fase 3A — entidad de entrega (solo para auditoría EMAIL_* desde el service
// de campaña; el envío vive en NotificationsModule).
import {
  NotificationDelivery, NotificationDeliverySchema,
} from '../notifications/schemas/notification-delivery.schema';
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
    OtpChallengeModule,
    OtpRateLimitModule,
    MongooseModule.forFeature([
      { name: SignatureCampaign.name, schema: SignatureCampaignSchema },
      { name: SignatureCampaignWorker.name, schema: SignatureCampaignWorkerSchema },
      { name: SignatureToken.name, schema: SignatureTokenSchema },
      { name: SignatureEvidence.name, schema: SignatureEvidenceSchema },
      { name: SignatureAudit.name, schema: SignatureAuditSchema },
      { name: SignatureReminder.name, schema: SignatureReminderSchema },
      { name: User.name, schema: UserSchema },
      // Fase 3A — modelo de entrega disponible para el service de campaña.
      { name: NotificationDelivery.name, schema: NotificationDeliverySchema },
    ]),
  ],
  controllers: [WorkerSignatureCampaignController, PublicSignController],
  providers: [WorkerSignatureCampaignService, RolesGuard, CompanyAccessGuard],
  exports: [WorkerSignatureCampaignService],
})
export class WorkerSignatureCampaignModule {}
