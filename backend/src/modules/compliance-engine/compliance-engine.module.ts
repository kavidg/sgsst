import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EvaluationsModule } from '../../evaluations/evaluations.module';
import { AlertsModule } from '../alerts/alerts.module';
import { AnnualWorkPlanModule } from '../annual-work-plan/annual-work-plan.module';
import { AuthModule } from '../auth/auth.module';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { CompanyUser, CompanyUserSchema } from '../companies/schemas/company-user.schema';
import { ConvivenciaModule } from '../convivencia/convivencia.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { DocumentManagementModule } from '../document-management/document-management.module';
import { IncidentsModule } from '../incidents/incidents.module';
import { Incident, IncidentSchema } from '../incidents/schemas/incident.schema';
import { InitialEvaluation, InitialEvaluationSchema } from '../initial-evaluation/schemas/initial-evaluation.schema';
import { InspectionsModule } from '../inspections/inspections.module';
import { LegalMatrixModule } from '../legal-matrix/legal-matrix.module';
import { PhvaAdvancedModule } from '../phva-advanced/phva-advanced.module';
import { RolesGuard } from '../questions/roles.guard';
import { RisksModule } from '../risks/risks.module';
import { TrainingsModule } from '../trainings/trainings.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ComplianceEngineController } from './compliance-engine.controller';
import { ComplianceEngineService } from './compliance-engine.service';
import { AlertsProvider } from './providers/alerts.provider';
import { AnnualWorkPlanProvider } from './providers/annual-work-plan.provider';
import { ConvivenciaProvider } from './providers/convivencia.provider';
import { SstObjectivesProvider } from './providers/sst-objectives.provider';
import { EmergenciesProvider } from './providers/emergencies.provider';
import { CopasstTrainingProvider } from './providers/copasst-training.provider';
import { DashboardProvider } from './providers/dashboard.provider';
import { DocumentsProvider } from './providers/documents.provider';
import { EvaluationsProvider } from './providers/evaluations.provider';
import { IncidentsProvider } from './providers/incidents.provider';
import { InitialEvaluationProvider } from './providers/initial-evaluation.provider';
import { InspectionsProvider } from './providers/inspections.provider';
import { LegalMatrixProvider } from './providers/legal-matrix.provider';
import { RisksProvider } from './providers/risks.provider';
import { TrainingsProvider } from './providers/trainings.provider';
import { IndicatorsModule } from '../indicators/indicators.module';
import { IndicatorsProvider } from './providers/indicators.provider';
import { ProgramsModule } from '../programs/programs.module';
import { SgstProgram, SgstProgramSchema } from '../programs/schemas/program.schema';
import { ProgramsProvider } from './providers/programs.provider';
import { DocumentEvaluationProvider } from './providers/document-evaluation.provider';
import { AcquisitionProvider } from './providers/acquisition.provider';
import { AcquisitionsModule } from '../acquisitions/acquisitions.module';
import { Acquisition, AcquisitionSchema } from '../acquisitions/schemas/acquisition.schema';
import { Supplier, SupplierSchema } from '../acquisitions/schemas/supplier.schema';
import { ContractingProvider } from './providers/contracting.provider';
import { Contract, ContractSchema } from '../contracting/schemas/contract.schema';
import { ContractInduction, ContractInductionSchema } from '../contracting/schemas/contract-induction.schema';
import { ContractEvaluation, ContractEvaluationSchema } from '../contracting/schemas/contract-evaluation.schema';
import { ChangeManagementProvider } from './providers/change-management.provider';
import { ChangeRequest, ChangeRequestSchema } from '../change-management/schema/change-request.schema';
import { SociodemographicProvider } from './providers/sociodemographic.provider';
import { OccupationalExamProvider } from './providers/occupational-exam.provider';
import { OccupationalExam, OccupationalExamSchema } from '../../modules/occupational-exam/schemas/occupational-exam.schema';
import { MedicalRecommendationProvider } from './providers/medical-recommendation.provider';
import { MedicalRecommendation, MedicalRecommendationSchema } from '../../modules/medical-recommendation/schemas/medical-recommendation.schema';
import { JobProfileMedicalInformationProvider } from './providers/job-profile-medical-information.provider';
import { JobProfile, JobProfileSchema } from '../job-profile/schemas/job-profile.schema';
// FASE 30E: HealthPromotion (3.1.2 — Promoción y prevención en salud).
import { HealthPromotionProvider } from './providers/health-promotion.provider';
import {
  HealthPromotionActivity,
  HealthPromotionActivitySchema,
} from '../health-promotion/schemas/health-promotion-activity.schema';
import { OccupationalEvaluationProvider } from './providers/occupational-evaluation.provider';
import { AbsenteeismProvider } from './providers/absenteeism.provider';
import { Absenteeism, AbsenteeismSchema } from '../../modules/absenteeism/schemas/absenteeism.schema';
import { DiseaseInvestigationProvider } from './providers/disease-investigation.provider';
import { EpidemiologicalSurveillanceProvider } from './providers/epidemiological-surveillance.provider';
import { CaseInterventionProvider } from './providers/case-intervention.provider';
import {
  EpidemiologicalSurveillanceProgram,
  EpidemiologicalSurveillanceProgramSchema,
} from '../epidemiological-surveillance/schemas/epidemiological-surveillance.schema';
import { Employee, EmployeeSchema } from '../employees/schemas/employee.schema';
import { EmployeesModule } from '../employees/employees.module';
import { Risk, RiskSchema } from '../risks/schemas/risk.schema';
import { RiskMethodology, RiskMethodologySchema } from '../risks/schemas/risk-methodology.schema';
import { RiskMethodologyProvider } from './providers/risk-methodology.provider';
import { WorkerParticipation, WorkerParticipationSchema } from '../risks/schemas/worker-participation.schema';
import { WorkerParticipationProvider } from './providers/worker-participation.provider';
import { HazardousSubstance, HazardousSubstanceSchema } from '../risks/schemas/hazardous-substance.schema';
import { HazardousSubstanceProvider } from './providers/hazardous-substance.provider';
import { EnvironmentalMeasurement, EnvironmentalMeasurementSchema } from '../risks/schemas/environmental-measurement.schema';
import { EnvironmentalMeasurementProvider } from './providers/environmental-measurement.provider';
// FASE 34B: provider EXACT para 3.1.8 — Agua potable, servicios sanitarios y disposición de basuras.
import { WorkplaceSanitaryConditionsProvider } from './providers/workplace-sanitary-conditions.provider';
import {
  WorkplaceSanitaryCondition,
  WorkplaceSanitaryConditionSchema,
} from '../workplace-sanitary-conditions/schemas/workplace-sanitary-condition.schema';
// FASE 34C: provider EXACT para 3.1.9 — Eliminación adecuada de residuos sólidos, líquidos o gaseosos.
import { WasteManagementProvider } from './providers/waste-management.provider';
import {
  WasteManagementRecord,
  WasteManagementRecordSchema,
} from '../waste-management/schemas/waste-management-record.schema';
import {
  WasteTypeDeclaration,
  WasteTypeDeclarationSchema,
} from '../waste-management/schemas/waste-type-declaration.schema';
import { ControlImplementationProvider } from './providers/control-implementation.provider';
import { ControlVerificationProvider } from './providers/control-verification.provider';
import { ProceduresProvider } from './providers/procedures.provider';
import { InspectionComplianceProvider } from './providers/inspection-compliance.provider';
import { MaintenanceProvider } from './providers/maintenance.provider';
import { EppComplianceProvider } from './providers/epp-compliance.provider';
import { ControlVerificationStandardProvider } from './providers/control-verification-standard.provider';
import { EmergencyManagementProvider } from './providers/emergency-management.provider';
import { ProceduresDocProvider } from './providers/procedures-doc.provider';
import { RecordsDocProvider } from './providers/records-doc.provider';
import { ManagementMeasurementProvider } from './providers/management-measurement.provider';
import { ManagementReviewProvider } from './providers/management-review.provider';
import { InternalAuditProvider } from './providers/internal-audit.provider';
import { FindingsReviewProvider } from './providers/findings-review.provider';
import { CorrectivePreventiveProvider } from './providers/corrective-preventive.provider';
import { ManagementImprovementProvider } from './providers/management-improvement.provider';
import { IncidentActionsProvider } from './providers/incident-actions.provider';
import { ImprovementPlanProvider } from './providers/improvement-plan.provider';
import { InductionReinductionProvider } from './providers/induction-reinduction.provider';
import { HealthIndicatorsProvider } from './providers/health-indicators.provider';
import { AccidentReportingProvider } from './providers/accident-reporting.provider';
import { AccidentFrequencyProvider } from './providers/accident-frequency.provider';
import { AccidentMortalityProvider } from './providers/accident-mortality.provider';
// SCOPE-1: 3.3.4/3.3.5/3.3.6 quedaron FUERA DEL ALCANCE aprobado por los
// socios. Los providers DiseasePrevalenceProvider, DiseaseIncidenceProvider y
// MedicalAbsenteeismProvider (fases 35C-2/35D-2/35E-2) se conservan en el
// repositorio como infraestructura futura, pero NO se registran en este módulo
// (no se instancian, no consultan Mongo, no aportan findings ni scoring).
import { AccidentStatisticsProvider } from './providers/accident-statistics.provider';
import { AccidentSeverityProvider } from './providers/accident-severity.provider';
// FASE 30F: provider EXACT para 3.1.5 — Custodia de historias clínicas ocupacionales.
import { OccupationalMedicalRecordCustodyProvider } from './providers/occupational-medical-record-custody.provider';
// FASE 32: provider 3.1.7 — Estilos de vida y entornos saludables (EXACT).
import { LifestyleHealthyEnvironmentProvider } from './providers/lifestyle-healthy-environment.provider';
// FASE 33: provider 3.1.6 — Restricciones y recomendaciones médico-laborales (EXACT).
import { WorkRestrictionProvider } from './providers/work-restriction.provider';
import {
  OccupationalMedicalRecordCustody,
  OccupationalMedicalRecordCustodySchema,
} from '../occupational-medical-record-custody/schemas/occupational-medical-record-custody.schema';
// FASE 33: WorkRestriction (3.1.6) — consumido por WorkRestrictionProvider.
import {
  WorkRestriction,
  WorkRestrictionSchema,
} from '../work-restriction/schemas/work-restriction.schema';
// SCOPE-1: los schemas OccupationalDiseaseStatisticalCase (3.3.4/3.3.5) y
// CompanyPeriodScheduledWorkData (3.3.6) se desregistran de este módulo junto
// con sus providers. Las colecciones y sus módulos propios permanecen intactos
// (infraestructura futura, no compartida con estándares aprobados).
import { SstEpp, SstEppSchema } from '../phva-advanced/schemas/phva-advanced-epp.schema';
import { SstEmergencies, SstEmergenciesSchema } from '../phva-advanced/schemas/phva-advanced-emergencies.schema';
import { IndicatorDefinition, IndicatorDefinitionSchema } from '../indicators/schemas/indicator-definition.schema';
import { IndicatorMeasurement, IndicatorMeasurementSchema } from '../indicators/schemas/indicator-measurement.schema';
import { AccountabilityMeeting, AccountabilityMeetingSchema } from '../accountability/schemas/accountability-meeting.schema';
import { AccountabilityCommitment, AccountabilityCommitmentSchema } from '../accountability/schemas/accountability-commitment.schema';
import { InspectionActivity, InspectionActivitySchema } from '../inspections/schemas/inspection-activity.schema';
import { SstInduction, SstInductionSchema } from '../risks/schemas/sst-induction.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: CompanyUser.name, schema: CompanyUserSchema },
      // Schema de InitialEvaluation requerido por InitialEvaluationProvider.
      { name: InitialEvaluation.name, schema: InitialEvaluationSchema },
      // Schemas de Adquisiciones requeridos por AcquisitionProvider.
      { name: Supplier.name, schema: SupplierSchema },
      { name: Acquisition.name, schema: AcquisitionSchema },
      // Schemas de Contratación requeridos por ContractingProvider.
      { name: Contract.name, schema: ContractSchema },
      { name: ContractInduction.name, schema: ContractInductionSchema },
      { name: ContractEvaluation.name, schema: ContractEvaluationSchema },
      // Schemas de Gestión del Cambio requeridos por ChangeManagementProvider.
      { name: ChangeRequest.name, schema: ChangeRequestSchema },
      // Schema de Empleados requerido por SociodemographicProvider.
      { name: Employee.name, schema: EmployeeSchema },
      // Schema de Exámenes Médicos requerido por OccupationalExamProvider.
      { name: OccupationalExam.name, schema: OccupationalExamSchema },
      // Schema de Recomendaciones Médicas requerido por MedicalRecommendationProvider.
      { name: MedicalRecommendation.name, schema: MedicalRecommendationSchema },
      // Schema de JobProfile requerido por JobProfileMedicalInformationProvider (FASE 30D-2).
      { name: JobProfile.name, schema: JobProfileSchema },
      // Schema de actividades de promoción/prevención requerido por HealthPromotionProvider (FASE 30E).
      { name: HealthPromotionActivity.name, schema: HealthPromotionActivitySchema },
      // Schema de Ausentismo requerido por AbsenteeismProvider.
      { name: Absenteeism.name, schema: AbsenteeismSchema },
      // Schema de Incidentes requerido por DiseaseInvestigationProvider.
      { name: Incident.name, schema: IncidentSchema },
      // Schema de Programas de Vigilancia Epidemiológica requerido por EpidemiologicalSurveillanceProvider.
      { name: EpidemiologicalSurveillanceProgram.name, schema: EpidemiologicalSurveillanceProgramSchema },
      // Schema de Riesgos requerido por EpidemiologicalSurveillanceProvider.
      { name: Risk.name, schema: RiskSchema },
      // Schema de Metodología de Riesgos requerido por RiskMethodologyProvider.
      { name: RiskMethodology.name, schema: RiskMethodologySchema },
      // Schema de Participación de Trabajadores requerido por WorkerParticipationProvider.
      { name: WorkerParticipation.name, schema: WorkerParticipationSchema },
      // Schema de Sustancias Peligrosas requerido por HazardousSubstanceProvider.
      { name: HazardousSubstance.name, schema: HazardousSubstanceSchema },
      // Schema de Mediciones Ambientales requerido por EnvironmentalMeasurementProvider.
      { name: EnvironmentalMeasurement.name, schema: EnvironmentalMeasurementSchema },
      { name: SstEpp.name, schema: SstEppSchema },
      { name: SstEmergencies.name, schema: SstEmergenciesSchema },
      { name: IndicatorDefinition.name, schema: IndicatorDefinitionSchema },
      { name: IndicatorMeasurement.name, schema: IndicatorMeasurementSchema },
      { name: AccountabilityMeeting.name, schema: AccountabilityMeetingSchema },
      { name: AccountabilityCommitment.name, schema: AccountabilityCommitmentSchema },
      { name: SgstProgram.name, schema: SgstProgramSchema },
      { name: SstInduction.name, schema: SstInductionSchema },
      // FASE 30F: OccupationalMedicalRecordCustody (3.1.5).
      {
        name: OccupationalMedicalRecordCustody.name,
        schema: OccupationalMedicalRecordCustodySchema,
      },
      // FASE 32: HealthPromotionActivity reutilizado por el provider 3.1.7
      // (LifestyleHealthyEnvironmentProvider) con frontera complianceStandard.
      { name: InspectionActivity.name, schema: InspectionActivitySchema },
      // FASE 33: WorkRestriction (3.1.6) requerido por WorkRestrictionProvider.
      { name: WorkRestriction.name, schema: WorkRestrictionSchema },
      // FASE 34B: WorkplaceSanitaryCondition (3.1.8) requerido por
      // WorkplaceSanitaryConditionsProvider. Colección propia; NO reutiliza
      // EnvironmentalMeasurement ni InspectionActivity (frontera anti-double-scoring).
      {
        name: WorkplaceSanitaryCondition.name,
        schema: WorkplaceSanitaryConditionSchema,
      },
      // FASE 34C: WasteManagementRecord + WasteTypeDeclaration (3.1.9)
      // requeridos por WasteManagementProvider. Colecciones propias; NO
      // reutilizan HazardousSubstance ni EnvironmentalMeasurement (frontera
      // anti-double-scoring).
      {
        name: WasteManagementRecord.name,
        schema: WasteManagementRecordSchema,
      },
      {
        name: WasteTypeDeclaration.name,
        schema: WasteTypeDeclarationSchema,
      },
      // SCOPE-1: los tokens OccupationalDiseaseStatisticalCase y
      // CompanyPeriodScheduledWorkData fueron desregistrados con sus providers
      // (3.3.4/3.3.5/3.3.6 fuera del alcance aprobado).
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
    // FASE 6: provider de cumplimiento 1.1.7 (Capacitación COPASST) que
    // reutiliza PhvaAdvancedCopasstTrainingService (entidad + cobertura real).
    PhvaAdvancedModule,
    // FASE 3: provider de cumplimiento 1.1.8 (Comité de Convivencia) que
    // consume el snapshot de cumplimiento del dominio (fuente única de verdad).
    ConvivenciaModule,
    IndicatorsModule,
    ProgramsModule,
    AcquisitionsModule,
    EmployeesModule,
  ],
  controllers: [ComplianceEngineController],
  providers: [
    ComplianceEngineService,
    RolesGuard,
    CompanyAccessGuard,
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
    CopasstTrainingProvider,
    ConvivenciaProvider,
    SstObjectivesProvider,
    EmergenciesProvider,
    IndicatorsProvider,
    ProgramsProvider,
    DocumentEvaluationProvider,
    AcquisitionProvider,
    ContractingProvider,
    ChangeManagementProvider,
    SociodemographicProvider,
    OccupationalExamProvider,
    MedicalRecommendationProvider,
    JobProfileMedicalInformationProvider,
    HealthPromotionProvider,
    // FASE 32: 3.1.7 — Estilos de vida y entornos saludables (EXACT).
    LifestyleHealthyEnvironmentProvider,
    OccupationalEvaluationProvider,
    AbsenteeismProvider,
    DiseaseInvestigationProvider,
    EpidemiologicalSurveillanceProvider,
    CaseInterventionProvider,
    RiskMethodologyProvider,
    WorkerParticipationProvider,
    HazardousSubstanceProvider,
    EnvironmentalMeasurementProvider,
    ControlImplementationProvider,
    ControlVerificationProvider,
    ProceduresProvider,
    InspectionComplianceProvider,
    MaintenanceProvider,
    EppComplianceProvider,
    ControlVerificationStandardProvider,
    EmergencyManagementProvider,
    ProceduresDocProvider,
    RecordsDocProvider,
    ManagementMeasurementProvider,
    ManagementReviewProvider,
    InternalAuditProvider,
    FindingsReviewProvider,
    CorrectivePreventiveProvider,
    ManagementImprovementProvider,
    IncidentActionsProvider,
    ImprovementPlanProvider,
    InductionReinductionProvider,
    HealthIndicatorsProvider,
    AccidentReportingProvider,
    AccidentFrequencyProvider,
    AccidentMortalityProvider,
    AccidentStatisticsProvider,
    AccidentSeverityProvider,
    // FASE 30F: provider EXACT para 3.1.5.
    OccupationalMedicalRecordCustodyProvider,
    // FASE 33: provider EXACT para 3.1.6.
    WorkRestrictionProvider,
    // FASE 34B: provider EXACT para 3.1.8.
    WorkplaceSanitaryConditionsProvider,
    // FASE 34C: provider EXACT para 3.1.9.
    WasteManagementProvider,
    // SCOPE-1: DiseasePrevalenceProvider (3.3.4), DiseaseIncidenceProvider
    // (3.3.5) y MedicalAbsenteeismProvider (3.3.6) desregistrados del engine
    // — estándares fuera del alcance aprobado. Código conservado como
    // infraestructura futura en providers/.
  ],
  // Exportado para que ComplianceTimelineModule pueda reutilizar getOverview()
  // como fuente única de datos del timeline.
  exports: [ComplianceEngineService],
})
export class ComplianceEngineModule {}
