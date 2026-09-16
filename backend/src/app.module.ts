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
// F7B-9B/9E: CommitteeEngineModule (legacy) retirado del registro de NestJS
// (F7B-9B) y eliminado físicamente del repositorio (F7B-9E). Sus endpoints
// /committee-engine/* ya no existen (superficie legacy con OTP Math.random,
// otpPreview, IDOR y resultados con PII). La implementación segura de
// CONVIVENCIA vive en ConvivenciaModule (/convivencia/*).
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
import { AiPipelineModule } from './modules/ai-pipeline/ai-pipeline.module';
import { AiContextModule } from './modules/ai/context/ai-context.module';
import { ApprovalWorkflowModule } from './modules/approval-workflow/approval-workflow.module';
import { ComplianceAiModule } from './modules/compliance-ai/compliance-ai.module';
import { PhvaModule } from './modules/phva/phva.module';
import { DocumentGenerationModule } from './modules/document-generation/document-generation.module';
import { IndicatorsModule } from './modules/indicators/indicators.module';
import { AcquisitionsModule } from './modules/acquisitions/acquisitions.module';
import { ContractingModule } from './modules/contracting/contracting.module';
import { ChangeManagementModule } from './modules/change-management/change-management.module';
import { ProgramsModule } from './modules/programs/programs.module';
import { OccupationalExamModule } from './modules/occupational-exam/occupational-exam.module';
import { MedicalRecommendationModule } from './modules/medical-recommendation/medical-recommendation.module';
import { EpidemiologicalSurveillanceModule } from './modules/epidemiological-surveillance/epidemiological-surveillance.module';
// FASE 30D-2: módulo de perfiles de cargo (3.1.3).
import { JobProfileModule } from './modules/job-profile/job-profile.module';
import { HealthPromotionModule } from './modules/health-promotion/health-promotion.module';
// FASE 30F: OccupationalMedicalRecordCustody (3.1.5) — Control de custodia de
// historias clínicas ocupacionales (registro administrativo, sin contenido clínico).
import { OccupationalMedicalRecordCustodyModule } from './modules/occupational-medical-record-custody/occupational-medical-record-custody.module';
// FASE 33: WorkRestriction (3.1.6) — Restricciones y recomendaciones
// médico-laborales (registro administrativo, sin contenido clínico).
import { WorkRestrictionModule } from './modules/work-restriction/work-restriction.module';
import { WorkplaceSanitaryConditionsModule } from './modules/workplace-sanitary-conditions/workplace-sanitary-conditions.module';
import { WasteManagementModule } from './modules/waste-management/waste-management.module';
// FASE 35B: infraestructura estadística de enfermedad laboral (sin scoring —
// 3.3.4/3.3.5 permanecen PLANNED; los providers llegan en 35C/35D).
import { OccupationalDiseaseStatisticalCaseModule } from './modules/occupational-disease-statistical-case/occupational-disease-statistical-case.module';
import { PhvaEvaluationEngineModule } from './modules/phva-evaluation-engine/phva-evaluation-engine.module';

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
    AiPipelineModule,
    PhvaModule,
    DocumentGenerationModule,
    ApprovalWorkflowModule,
    IndicatorsModule,
    ProgramsModule,
    AcquisitionsModule,    ContractingModule,
    ChangeManagementModule,
    OccupationalExamModule,
    MedicalRecommendationModule,
    EpidemiologicalSurveillanceModule,
    // FASE 30D-2: JobProfile (3.1.3) — CRUD tenant-aware de perfiles de cargo.
    JobProfileModule,
    // FASE 30E: HealthPromotion (3.1.2) — CRUD tenant-aware de actividades de
    // promoción y prevención en salud.
    HealthPromotionModule,
    // FASE 30F: OccupationalMedicalRecordCustody (3.1.5) — Control de custodia
    // de historias clínicas ocupacionales (sin contenido clínico).
    OccupationalMedicalRecordCustodyModule,
    // FASE 33: WorkRestriction (3.1.6) — Restricciones y recomendaciones
    // médico-laborales (sin contenido clínico).
    WorkRestrictionModule,
    // FASE 34B: WorkplaceSanitaryConditions (3.1.8) — Agua potable, servicios
    // sanitarios y disposición de basuras (metadata-only).
    WorkplaceSanitaryConditionsModule,
    // FASE 34C: WasteManagement (3.1.9) — Eliminación adecuada de residuos
    // sólidos, líquidos o gaseosos (metadata-only).
    WasteManagementModule,
    // FASE 35B: casos estadísticos de enfermedad laboral (infraestructura base).
    OccupationalDiseaseStatisticalCaseModule,
    // FASE 1 Motor PHVA: evaluación automática por estándar (solo consulta).
    // NO modifica el flujo manual, NO persiste en Evaluation, NO genera alertas.
    PhvaEvaluationEngineModule,
  ],
}) export class AppModule {}
