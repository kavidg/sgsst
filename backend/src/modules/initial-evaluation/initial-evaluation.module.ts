import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AlertsModule } from '../alerts/alerts.module';
import { AuthModule } from '../auth/auth.module';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { CompanyUser, CompanyUserSchema } from '../companies/schemas/company-user.schema';
import { Company, CompanySchema } from '../companies/schemas/company.schema';
import { CopasstPeriod, CopasstPeriodSchema } from '../committee-engine/schemas/copasst.schema';
import { PhvaAdvancedResponsableSst, PhvaAdvancedResponsableSstSchema } from '../phva-advanced/schemas/phva-advanced-responsable-sst.schema';
import { SstObjectives, SstObjectivesSchema } from '../phva-advanced/schemas/phva-advanced-sst-objective.schema';
import { SstPolicy, SstPolicySchema } from '../phva-advanced/schemas/phva-advanced-sst-policy.schema';
import { TrainingManagement, TrainingManagementSchema } from '../phva-advanced/schemas/phva-advanced-training-management.schema';
import { RolesGuard } from '../questions/roles.guard';
import { User, UserSchema } from '../users/schemas/user.schema';
import { UsersModule } from '../users/users.module';
import { InitialEvaluationController } from './initial-evaluation.controller';
import { InitialEvaluationService } from './initial-evaluation.service';
import { InitialEvaluation, InitialEvaluationSchema } from './schemas/initial-evaluation.schema';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    AlertsModule,
    MongooseModule.forFeature([
      { name: InitialEvaluation.name, schema: InitialEvaluationSchema },
      { name: Company.name, schema: CompanySchema },
      { name: User.name, schema: UserSchema },
      { name: CompanyUser.name, schema: CompanyUserSchema },
      { name: PhvaAdvancedResponsableSst.name, schema: PhvaAdvancedResponsableSstSchema },
      { name: SstPolicy.name, schema: SstPolicySchema },
      { name: SstObjectives.name, schema: SstObjectivesSchema },
      { name: CopasstPeriod.name, schema: CopasstPeriodSchema },
      { name: TrainingManagement.name, schema: TrainingManagementSchema },
    ]),
  ],
  controllers: [InitialEvaluationController],
  providers: [InitialEvaluationService, RolesGuard, CompanyAccessGuard],
  exports: [InitialEvaluationService],
})
export class InitialEvaluationModule {}
