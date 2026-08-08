import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnnualWorkPlanModule } from '../annual-work-plan/annual-work-plan.module';
import { CommunicationModule } from '../communication/communication.module';
import { CompanyProfileModule } from '../company-profile/company-profile.module';
import { ComplianceCredentialsModule } from '../compliance-credentials/compliance-credentials.module';
import { ConvivenciaModule } from '../convivencia/convivencia.module';
import { CopasstModule } from '../copasst/copasst.module';
import { DocumentInstance, DocumentInstanceSchema } from '../document-generation/schemas/document-instance.schema';
import { InitialEvaluationModule } from '../initial-evaluation/initial-evaluation.module';
import { LegalMatrixModule } from '../legal-matrix/legal-matrix.module';
import { PhvaAdvancedModule } from '../phva-advanced/phva-advanced.module';
import {
  SstObjectives,
  SstObjectivesSchema,
} from '../phva-advanced/schemas/phva-advanced-sst-objective.schema';
import {
  TrainingManagement,
  TrainingManagementSchema,
} from '../phva-advanced/schemas/phva-advanced-training-management.schema';
import { TrainingsModule } from '../trainings/trainings.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ImplementationValidatorService } from './implementation-validator.service';
import { AnnualPlanProvider } from './providers/annual-plan.provider';
import { CommunicationProvider } from './providers/communication.provider';
import { CompanyInfoProvider } from './providers/company-info.provider';
import { ConvivenciaProvider } from './providers/convivencia.provider';
import { CopasstProvider } from './providers/copasst.provider';
import { Course50HoursProvider } from './providers/course-50-hours.provider';
import { DocumentManagementProvider } from './providers/document-management.provider';
import { InitialEvaluationProvider } from './providers/initial-evaluation.provider';
import { LegalMatrixProvider } from './providers/legal-matrix.provider';
import { ResponsibleSstProvider } from './providers/responsible-sst.provider';
import { SstObjectivesProvider } from './providers/sst-objectives.provider';
import { SstPolicyProvider } from './providers/sst-policy.provider';
import { TrainingProvider } from './providers/training.provider';
import { UsersRolesProvider } from './providers/users-roles.provider';

@Module({
  imports: [
    CompanyProfileModule,
    InitialEvaluationModule,
    AnnualWorkPlanModule,
    PhvaAdvancedModule,
    ComplianceCredentialsModule,
    CopasstModule,
    ConvivenciaModule,
    TrainingsModule,
    CommunicationModule,
    LegalMatrixModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: SstObjectives.name, schema: SstObjectivesSchema },
      { name: TrainingManagement.name, schema: TrainingManagementSchema },
      { name: DocumentInstance.name, schema: DocumentInstanceSchema },
    ]),
  ],
  providers: [
    ImplementationValidatorService,
    CompanyInfoProvider,
    UsersRolesProvider,
    ResponsibleSstProvider,
    Course50HoursProvider,
    SstPolicyProvider,
    SstObjectivesProvider,
    InitialEvaluationProvider,
    AnnualPlanProvider,
    CopasstProvider,
    ConvivenciaProvider,
    TrainingProvider,
    CommunicationProvider,
    LegalMatrixProvider,
    DocumentManagementProvider,
  ],
  exports: [ImplementationValidatorService],
})
export class ImplementationValidatorModule {}
