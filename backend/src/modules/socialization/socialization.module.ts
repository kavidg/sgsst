import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AlertsModule } from '../alerts/alerts.module';
import { AuthModule } from '../auth/auth.module';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { RolesGuard } from '../questions/roles.guard';
import { User, UserSchema } from '../users/schemas/user.schema';
import { CompanyUser, CompanyUserSchema } from '../companies/schemas/company-user.schema';
import { SocializationController } from './socialization.controller';
import { SocializationService } from './socialization.service';
import {
  SocializationSession, SocializationSessionSchema,
  SocializationPresentation, SocializationPresentationSchema,
  SocializationParticipant, SocializationParticipantSchema,
  SocializationToken, SocializationTokenSchema,
  SocializationEvidence, SocializationEvidenceSchema,
  SocializationAudit, SocializationAuditSchema,
} from './schemas';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SocializationSession.name, schema: SocializationSessionSchema },
      { name: SocializationPresentation.name, schema: SocializationPresentationSchema },
      { name: SocializationParticipant.name, schema: SocializationParticipantSchema },
      { name: SocializationToken.name, schema: SocializationTokenSchema },
      { name: SocializationEvidence.name, schema: SocializationEvidenceSchema },
      { name: SocializationAudit.name, schema: SocializationAuditSchema },
      { name: User.name, schema: UserSchema },
      { name: CompanyUser.name, schema: CompanyUserSchema },
    ]),
    AlertsModule,
    AuthModule,
  ],
  controllers: [SocializationController],
  providers: [SocializationService, RolesGuard, CompanyAccessGuard],
  exports: [SocializationService],
})
export class SocializationModule {}
