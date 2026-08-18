import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { RolesGuard } from '../questions/roles.guard';
import { CompanyUser, CompanyUserSchema } from '../companies/schemas/company-user.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { UsersModule } from '../users/users.module';
import { AlertsModule } from '../alerts/alerts.module';
import { LegalMatrixController } from './legal-matrix.controller';
import { LegalMatrixService } from './legal-matrix.service';
import { LegalRegulationTemplate, LegalRegulationTemplateSchema } from './schemas/legal-regulation-template.schema';
import { CompanyLegalMatrix, CompanyLegalMatrixSchema } from './schemas/company-legal-matrix.schema';
import { LegalRequirement, LegalRequirementSchema } from './schemas/legal-requirement.schema';
import { LegalEvidence, LegalEvidenceSchema } from './schemas/legal-evidence.schema';
import { LegalActionPlan, LegalActionPlanSchema } from './schemas/legal-action-plan.schema';
import { LegalFollowUp, LegalFollowUpSchema } from './schemas/legal-follow-up.schema';
import { LegalRegulatoryChange, LegalRegulatoryChangeSchema } from './schemas/legal-regulatory-change.schema';
import { LegalHistory, LegalHistorySchema } from './schemas/legal-history.schema';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    AlertsModule,
    MongooseModule.forFeature([
      { name: LegalRegulationTemplate.name, schema: LegalRegulationTemplateSchema },
      { name: CompanyLegalMatrix.name, schema: CompanyLegalMatrixSchema },
      { name: LegalRequirement.name, schema: LegalRequirementSchema },
      { name: LegalEvidence.name, schema: LegalEvidenceSchema },
      { name: LegalActionPlan.name, schema: LegalActionPlanSchema },
      { name: LegalFollowUp.name, schema: LegalFollowUpSchema },
      { name: LegalRegulatoryChange.name, schema: LegalRegulatoryChangeSchema },
      { name: LegalHistory.name, schema: LegalHistorySchema },
      { name: User.name, schema: UserSchema },
      { name: CompanyUser.name, schema: CompanyUserSchema },
    ]),
  ],
  controllers: [LegalMatrixController],
  providers: [LegalMatrixService, RolesGuard, CompanyAccessGuard],
  exports: [LegalMatrixService],
})
export class LegalMatrixModule {}
