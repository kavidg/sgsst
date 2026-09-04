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
      { name: InspectionActivity.name, schema: InspectionActivitySchema },
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
  ],
  // Exportado para que ComplianceTimelineModule pueda reutilizar getOverview()
  // como fuente única de datos del timeline.
  exports: [ComplianceEngineService],
})
export class ComplianceEngineModule {}
