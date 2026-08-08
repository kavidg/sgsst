import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './modules/auth/auth.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CompaniesModule } from './modules/companies/companies.module';
import { UsersModule } from './modules/users/users.module';
import { EvaluationsModule } from './evaluations/evaluations.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { RisksModule } from './modules/risks/risks.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { IncidentsModule } from './modules/incidents/incidents.module';
import { TrainingsModule } from './modules/trainings/trainings.module';
import { QuestionsModule } from './modules/questions/questions.module';
import { EvaluationAnswersModule } from './modules/evaluation-answers/evaluation-answers.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { InspectionsModule } from './modules/inspections/inspections.module';
import { AbsenteeismModule } from './modules/absenteeism/absenteeism.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { PhvaAdvancedModule } from './modules/phva-advanced/phva-advanced.module';
import { CopasstModule } from './modules/copasst/copasst.module';
import { CommitteeEngineModule } from './modules/committee-engine/committee-engine.module';
import { ComplianceCredentialsModule } from './modules/compliance-credentials/compliance-credentials.module';
import { InitialEvaluationModule } from './modules/initial-evaluation/initial-evaluation.module';
import { AnnualWorkPlanModule } from './modules/annual-work-plan/annual-work-plan.module';
import { DocumentManagementModule } from './modules/document-management/document-management.module';
import { AccountabilityModule } from './modules/accountability/accountability.module';
import { LegalMatrixModule } from './modules/legal-matrix/legal-matrix.module';
import { CommunicationModule } from './modules/communication/communication.module';
import { CompanyProfileModule } from './modules/company-profile/company-profile.module';
import { ImplementationWizardModule } from './modules/implementation-wizard/implementation-wizard.module';
import { ImplementationValidatorModule } from './modules/implementation-validator/implementation-validator.module';
import { ImplementationPriorityModule } from './modules/implementation-priority/implementation-priority.module';
import { StandardCatalogModule } from './modules/standard-catalog/standard-catalog.module';
import { WorkerSignatureCampaignModule } from './modules/worker-signature-campaign/worker-signature-campaign.module';
import { ResponsibilityMatrixModule } from './modules/responsibility-matrix/responsibility-matrix.module';
import { SocializationModule } from './modules/socialization/socialization.module';
import { ConvivenciaModule } from './modules/convivencia/convivencia.module';
import { ComplianceEngineModule } from './modules/compliance-engine/compliance-engine.module';
import { ComplianceTimelineModule } from './modules/compliance-timeline/compliance-timeline.module';
import { ComplianceActionEngineModule } from './modules/compliance-action-engine/compliance-action-engine.module';
import { ComplianceAutomationModule } from './modules/compliance-automation/compliance-automation.module';
import { ComplianceExecutionModule } from './modules/compliance-execution/compliance-execution.module';
import { AiModule } from './modules/ai/ai.module';
import { AiContextModule } from './modules/ai/context/ai-context.module';
import { ApprovalWorkflowModule } from './modules/approval-workflow/approval-workflow.module';
import { ComplianceAiModule } from './modules/compliance-ai/compliance-ai.module';
import { PhvaModule } from './modules/phva/phva.module';
import { DocumentGenerationModule } from './modules/document-generation/document-generation.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
    }),
    AuthModule,
    CompaniesModule,
    UsersModule,
    EvaluationsModule,
    EmployeesModule,
    RisksModule,
    DocumentsModule,
    IncidentsModule,
    TrainingsModule,
    QuestionsModule,
    EvaluationAnswersModule,
    DashboardModule,
    InspectionsModule,
    AbsenteeismModule,
    AlertsModule,
    TemplatesModule,
    PhvaAdvancedModule,
    CopasstModule,
    CommitteeEngineModule,
    ComplianceCredentialsModule,
    InitialEvaluationModule,
    AnnualWorkPlanModule,
    DocumentManagementModule,
    AccountabilityModule,
    LegalMatrixModule,
    CommunicationModule,
    CompanyProfileModule,
    ImplementationWizardModule,
    ImplementationValidatorModule,
    ImplementationPriorityModule,
    StandardCatalogModule,
    WorkerSignatureCampaignModule,
    ResponsibilityMatrixModule,
    SocializationModule,
    ConvivenciaModule,
    ComplianceEngineModule,
    ComplianceTimelineModule,
    ComplianceActionEngineModule,
    ComplianceAutomationModule,
    ComplianceExecutionModule,
    AiModule,
    AiContextModule,
    ComplianceAiModule,
    PhvaModule,
    DocumentGenerationModule,
    ApprovalWorkflowModule,
  ],
})
export class AppModule {}
