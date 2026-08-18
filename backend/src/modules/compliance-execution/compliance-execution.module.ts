import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AlertsModule } from '../alerts/alerts.module';
import { AnnualWorkPlanModule } from '../annual-work-plan/annual-work-plan.module';
import { AuthModule } from '../auth/auth.module';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { CompanyUser, CompanyUserSchema } from '../companies/schemas/company-user.schema';
import { DashboardModule } from '../dashboard/dashboard.module';
import { DocumentManagementModule } from '../document-management/document-management.module';
import { InitialEvaluationModule } from '../initial-evaluation/initial-evaluation.module';
import { RolesGuard } from '../questions/roles.guard';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ComplianceExecutionController } from './compliance-execution.controller';
import { ComplianceExecutionService } from './compliance-execution.service';
import { ExecutionHistory, ExecutionHistorySchema } from './schemas/execution-history.schema';

@Module({
  imports: [
    AuthModule,
    AnnualWorkPlanModule,
    AlertsModule,
    DocumentManagementModule,
    DashboardModule,
    InitialEvaluationModule,
    MongooseModule.forFeature([
      { name: ExecutionHistory.name, schema: ExecutionHistorySchema },
      { name: User.name, schema: UserSchema },
      { name: CompanyUser.name, schema: CompanyUserSchema },
    ]),
  ],
  controllers: [ComplianceExecutionController],
  providers: [ComplianceExecutionService, RolesGuard, CompanyAccessGuard],
  exports: [ComplianceExecutionService],
})
export class ComplianceExecutionModule {}
