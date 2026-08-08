import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EvaluationsModule } from '../../evaluations/evaluations.module';
import { AlertsModule } from '../alerts/alerts.module';
import { AnnualWorkPlanModule } from '../annual-work-plan/annual-work-plan.module';
import { AuthModule } from '../auth/auth.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { DocumentManagementModule } from '../document-management/document-management.module';
import { IncidentsModule } from '../incidents/incidents.module';
import { InitialEvaluation, InitialEvaluationSchema } from '../initial-evaluation/schemas/initial-evaluation.schema';
import { InspectionsModule } from '../inspections/inspections.module';
import { LegalMatrixModule } from '../legal-matrix/legal-matrix.module';
import { RolesGuard } from '../questions/roles.guard';
import { RisksModule } from '../risks/risks.module';
import { TrainingsModule } from '../trainings/trainings.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ComplianceEngineController } from './compliance-engine.controller';
import { ComplianceEngineService } from './compliance-engine.service';
import { AlertsProvider } from './providers/alerts.provider';
import { AnnualWorkPlanProvider } from './providers/annual-work-plan.provider';
import { DashboardProvider } from './providers/dashboard.provider';
import { DocumentsProvider } from './providers/documents.provider';
import { EvaluationsProvider } from './providers/evaluations.provider';
import { IncidentsProvider } from './providers/incidents.provider';
import { InitialEvaluationProvider } from './providers/initial-evaluation.provider';
import { InspectionsProvider } from './providers/inspections.provider';
import { LegalMatrixProvider } from './providers/legal-matrix.provider';
import { RisksProvider } from './providers/risks.provider';
import { TrainingsProvider } from './providers/trainings.provider';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      // Schema de User requerido por RolesGuard para validar permisos.
      { name: User.name, schema: UserSchema },
      // Schema de InitialEvaluation requerido por InitialEvaluationProvider.
      { name: InitialEvaluation.name, schema: InitialEvaluationSchema },
    ]),
    EvaluationsModule,
    AnnualWorkPlanModule,
    IncidentsModule,
    RisksModule,
    TrainingsModule,
    InspectionsModule,
    DocumentManagementModule,
    LegalMatrixModule,
    AlertsModule,
    DashboardModule,
  ],
  controllers: [ComplianceEngineController],
  providers: [
    ComplianceEngineService,
    RolesGuard,
    EvaluationsProvider,
    AnnualWorkPlanProvider,
    IncidentsProvider,
    RisksProvider,
    TrainingsProvider,
    InspectionsProvider,
    DocumentsProvider,
    LegalMatrixProvider,
    AlertsProvider,
    DashboardProvider,
    InitialEvaluationProvider,
  ],
  // Exportado para que ComplianceTimelineModule pueda reutilizar getOverview()
  // como fuente única de datos del timeline.
  exports: [ComplianceEngineService],
})
export class ComplianceEngineModule {}
