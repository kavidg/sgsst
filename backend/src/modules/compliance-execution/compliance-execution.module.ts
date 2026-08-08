import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AlertsModule } from '../alerts/alerts.module';
import { AnnualWorkPlanModule } from '../annual-work-plan/annual-work-plan.module';
import { AuthModule } from '../auth/auth.module';
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
    // Servicios existentes reutilizados por los ejecutores de pasos.
    AnnualWorkPlanModule,
    AlertsModule,
    DocumentManagementModule,
    DashboardModule,
    InitialEvaluationModule,
    // Schema de User requerido por RolesGuard + resolución del ejecutor.
    MongooseModule.forFeature([
      { name: ExecutionHistory.name, schema: ExecutionHistorySchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [ComplianceExecutionController],
  providers: [ComplianceExecutionService, RolesGuard],
  exports: [ComplianceExecutionService],
})
export class ComplianceExecutionModule {}
