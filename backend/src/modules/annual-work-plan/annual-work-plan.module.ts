import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AlertsModule } from '../alerts/alerts.module';
import { RolesGuard } from '../questions/roles.guard';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { AnnualWorkPlanController } from './annual-work-plan.controller';
import { AnnualWorkPlanService } from './services/annual-work-plan.service';
import { ActivityService } from './services/activity.service';
import { TaskService } from './services/task.service';
import { PlanComplianceService } from './services/plan-compliance.service';
import { PlanHistoryService } from './services/plan-history.service';
import { TaskEvidenceService } from './services/task-evidence.service';
import { TaskJustificationService } from './services/task-justification.service';
import { AnnualWorkPlan, AnnualWorkPlanSchema } from './schemas/annual-work-plan.schema';
import { PlanActivity, PlanActivitySchema } from './schemas/plan-activity.schema';
import { PlanTask, PlanTaskSchema } from './schemas/plan-task.schema';
import { PlanSubtask, PlanSubtaskSchema } from './schemas/plan-subtask.schema';
import { TaskEvidence, TaskEvidenceSchema } from './schemas/task-evidence.schema';
import { TaskJustification, TaskJustificationSchema } from './schemas/task-justification.schema';
import { PlanHistory, PlanHistorySchema } from './schemas/plan-history.schema';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    AlertsModule,
    MongooseModule.forFeature([
      { name: AnnualWorkPlan.name, schema: AnnualWorkPlanSchema },
      { name: PlanActivity.name, schema: PlanActivitySchema },
      { name: PlanTask.name, schema: PlanTaskSchema },
      { name: PlanSubtask.name, schema: PlanSubtaskSchema },
      { name: TaskEvidence.name, schema: TaskEvidenceSchema },
      { name: TaskJustification.name, schema: TaskJustificationSchema },
      { name: PlanHistory.name, schema: PlanHistorySchema },
    ]),
  ],
  controllers: [AnnualWorkPlanController],
  providers: [
    AnnualWorkPlanService,
    ActivityService,
    TaskService,
    PlanComplianceService,
    PlanHistoryService,
    TaskEvidenceService,
    TaskJustificationService,
    RolesGuard,
    CompanyAccessGuard,
  ],
  exports: [
    AnnualWorkPlanService,
    ActivityService,
    TaskService,
    PlanComplianceService,
    PlanHistoryService,
    TaskEvidenceService,
    TaskJustificationService,
  ],
})
export class AnnualWorkPlanModule {}
