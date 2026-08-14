import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AlertsModule } from '../alerts/alerts.module';
import { ApprovalWorkflowModule } from '../approval-workflow/approval-workflow.module';
import { AuthModule } from '../auth/auth.module';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { CompanyUser, CompanyUserSchema } from '../companies/schemas/company-user.schema';
import { Company, CompanySchema } from '../companies/schemas/company.schema';
import { Employee, EmployeeSchema } from '../employees/schemas/employee.schema';
import { RolesGuard } from '../questions/roles.guard';
import { User, UserSchema } from '../users/schemas/user.schema';
import { UsersModule } from '../users/users.module';
import { CommunicationModule } from '../communication/communication.module';
import { DocumentGenerationModule } from '../document-generation/document-generation.module';
import { CopasstModule } from '../copasst/copasst.module';
import { PhvaAdvancedController } from './phva-advanced.controller';
import { PhvaAdvancedService } from './phva-advanced.service';
import { PhvaAdvancedCopasstTrainingService } from './phva-advanced-copasst-training.service';
import { ResponsibleSgsstVariableResolver } from './responsible-sgsst-variable-resolver.service';
import { ResponsibleSgsstDocumentGenerator } from './responsible-sgsst-document.generator';
import { PhvaAdvancedResourceAssignment, PhvaAdvancedResourceAssignmentSchema } from './schemas/phva-advanced-resource-assignment.schema';
import { PhvaAdvancedResponsibilities, PhvaAdvancedResponsibilitiesSchema } from './schemas/phva-advanced-responsibilities.schema';
import { PhvaAdvancedResponsableSst, PhvaAdvancedResponsableSstSchema } from './schemas/phva-advanced-responsable-sst.schema';
import { PhvaAdvancedArlAffiliations, PhvaAdvancedArlAffiliationsSchema } from './schemas/phva-advanced-arl-affiliations.schema';
import { SpecialPensionConfiguration, SpecialPensionConfigurationSchema } from './schemas/phva-advanced-special-pension.schema';
import { TrainingManagement, TrainingManagementSchema } from './schemas/phva-advanced-training-management.schema';
import { PhvaAdvancedCopasstTraining, PhvaAdvancedCopasstTrainingSchema } from './schemas/phva-advanced-copasst-training.schema';
import { SstPolicy, SstPolicySchema } from './schemas/phva-advanced-sst-policy.schema';
import { SstObjectives, SstObjectivesSchema } from './schemas/phva-advanced-sst-objective.schema';
import { PolicyTemplate, PolicyTemplateSchema } from './schemas/policy-template.schema';
import { PolicyTemplateService } from './policy-template.service';
import { PolicyTemplateController } from './policy-template.controller';
import { Training, TrainingSchema } from '../trainings/schemas/training.schema';
import { InspectionActivity, InspectionActivitySchema } from '../inspections/schemas/inspection-activity.schema';
import { Incident, IncidentSchema } from '../incidents/schemas/incident.schema';
import { CompanyProfile, CompanyProfileSchema } from '../company-profile/schemas/company-profile.schema';
import { CopasstPeriod, CopasstPeriodSchema } from '../copasst/schemas/copasst.schema';
import { CopasstVariableResolverService } from './copasst-variable-resolver.service';
import { CopasstDocumentGenerator } from './copasst-document.generator';
import { ResponsibilitiesVariableResolverService } from './responsibilities-variable-resolver.service';
import { ResponsibilitiesDocumentGenerator } from './responsibilities-document.generator';
import { ResourceAssignmentVariableResolverService } from './resource-assignment-variable-resolver.service';
import { ResourceAssignmentDocumentGenerator } from './resource-assignment-document.generator';
import { SstPolicyVariableResolverService } from './sst-policy-variable-resolver.service';
import { SstPolicyDocumentGenerator } from './sst-policy-document.generator';
// Fase 4 (1.1.7) — evidencias y generación documental de la Capacitación COPASST.
import { CopasstTrainingVariableResolverService } from './copasst-training-variable-resolver.service';
import { CopasstTrainingDocumentService } from './copasst-training-document.service';
import { CopasstTrainingDocumentGenerator } from './copasst-training-document.generator';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    AlertsModule,
    CommunicationModule,
    MongooseModule.forFeature([
      { name: PhvaAdvancedResponsableSst.name, schema: PhvaAdvancedResponsableSstSchema },
      { name: PhvaAdvancedResponsibilities.name, schema: PhvaAdvancedResponsibilitiesSchema },
      { name: PhvaAdvancedResourceAssignment.name, schema: PhvaAdvancedResourceAssignmentSchema },
      { name: PhvaAdvancedArlAffiliations.name, schema: PhvaAdvancedArlAffiliationsSchema },
      { name: SpecialPensionConfiguration.name, schema: SpecialPensionConfigurationSchema },
      { name: User.name, schema: UserSchema },
      { name: CompanyUser.name, schema: CompanyUserSchema },
      { name: TrainingManagement.name, schema: TrainingManagementSchema },
      { name: SstPolicy.name, schema: SstPolicySchema },
      { name: SstObjectives.name, schema: SstObjectivesSchema },
      { name: Training.name, schema: TrainingSchema },
      { name: InspectionActivity.name, schema: InspectionActivitySchema },
      { name: Incident.name, schema: IncidentSchema },
      { name: Company.name, schema: CompanySchema },
      { name: Employee.name, schema: EmployeeSchema },
      { name: PolicyTemplate.name, schema: PolicyTemplateSchema },
      { name: CompanyProfile.name, schema: CompanyProfileSchema },
      // Fase 3 — generación documental del COPASST: el resolver de dominio
      // consulta el periodo CopasstPeriod para resolver las variables de la
      // plantilla de conformación del comité.
      { name: CopasstPeriod.name, schema: CopasstPeriodSchema },
      // Fase 1 (1.1.7) — dominio independiente de Capacitación COPASST.
      { name: PhvaAdvancedCopasstTraining.name, schema: PhvaAdvancedCopasstTrainingSchema },
    ]),
    // Fase 1 (1.1.7) — CopasstService (periodo vigente + miembros activos).
    // forwardRef por el grafo real de dependencias del dominio
    // (phva-advanced ↔ copasst ↔ approval-workflow ↔ phva-advanced).
    forwardRef(() => CopasstModule),
    forwardRef(() => ApprovalWorkflowModule),
    // Fase 2 — Document Generation Engine: genera el documento formal del
    // Responsable del SG-SST (1.1.1) tras la aprobación. forwardRef por el
    // ciclo real del grafo (phva-advanced ↔ document-generation ↔
    // document-management ↔ approval-workflow ↔ phva-advanced).
    forwardRef(() => DocumentGenerationModule),
  ],
  controllers: [PhvaAdvancedController, PolicyTemplateController],
  providers: [
    PhvaAdvancedService,
    // Fase 1 (1.1.7) — service de dominio de Capacitación COPASST.
    PhvaAdvancedCopasstTrainingService,
    PolicyTemplateService,
    RolesGuard,
    CompanyAccessGuard,
    // Fase 2 — resolución de variables de dominio del documento del
    // Responsable del SG-SST (PHVA 1.1.1).
    ResponsibleSgsstVariableResolver,
    // Fase 2.1 — generador documental del Responsable del SG-SST. Se registra
    // en el ApprovalDocumentRegistryService del Approval Workflow Core
    // (APPROVAL_DOCUMENT_GENERATORS) y delega en PhvaAdvancedService. El
    // DocumentApprovalListener de Fase 2 se eliminó: la generación se dispara
    // ahora desde el Core para cubrir también el endpoint genérico /decide.
    ResponsibleSgsstDocumentGenerator,
    // Fase 3 — resolución de variables del acta de conformación del COPASST.
    CopasstVariableResolverService,
    // Fase 3 — generador documental del COPASST. Se registra en el
    // ApprovalDocumentRegistryService bajo la clave real COPASST:'CopasstPeriod'
    // y el alias PHVA_ADVANCED:'COPASST' (ambas apuntan al mismo generador).
    CopasstDocumentGenerator,
    // Fase 4 — resolución de variables del documento de la Matriz de
    // Responsabilidades del SG-SST (1.1.2).
    ResponsibilitiesVariableResolverService,
    // Fase 4 — generador documental de Responsibilities. Se registra en el
    // ApprovalDocumentRegistryService bajo la clave real
    // PHVA_ADVANCED:'PhvaAdvancedResponsibilities' y el alias
    // PHVA_ADVANCED:'RESPONSIBILITIES' (ambas apuntan al mismo generador).
    ResponsibilitiesDocumentGenerator,
    // Fase 5 — resolución de variables del documento de Asignación de Recursos
    // del SG-SST (1.1.3).
    ResourceAssignmentVariableResolverService,
    // Fase 5 — generador documental de Resource Assignment. Se registra en el
    // ApprovalDocumentRegistryService bajo la clave real
    // PHVA_ADVANCED:'PhvaAdvancedResourceAssignment' y el alias
    // PHVA_ADVANCED:'RESOURCE_ASSIGNMENT' (ambas apuntan al mismo generador).
    ResourceAssignmentDocumentGenerator,
    // Fase 6 — resolución de variables del documento de la Política de
    // Seguridad y Salud en el Trabajo (2.1.1).
    SstPolicyVariableResolverService,
    // Fase 6 — generador documental de SST Policy. Se registra en el
    // ApprovalDocumentRegistryService bajo la clave real
    // PHVA_ADVANCED:'PhvaAdvancedSstPolicy' y el alias
    // PHVA_ADVANCED:'SST_POLICY' (ambas apuntan al mismo generador).
    SstPolicyDocumentGenerator,
    // Fase 4 (1.1.7) — resolución de variables de los documentos de la
    // Capacitación COPASST (certificado, asistencia, informe, cumplimiento).
    CopasstTrainingVariableResolverService,
    // Fase 4 (1.1.7) — generación documental de la Capacitación COPASST.
    CopasstTrainingDocumentService,
    // Fase 4 (1.1.7) — generador documental post-aprobación (INERTE en esta
    // fase: 1.1.7 no posee flujo de aprobación aún). Se registra en el
    // ApprovalDocumentRegistryService bajo la clave real
    // PHVA_ADVANCED:'PhvaAdvancedCopasstTraining' y el alias
    // PHVA_ADVANCED:'COPASST_TRAINING' para que la Fase 5 lo conecte sin
    // cambios estructurales.
    CopasstTrainingDocumentGenerator,
  ],
  exports: [
    PhvaAdvancedService,
    // Fase 1 (1.1.7) — exportado para futuras fases (Approval/Document/Compliance).
    PhvaAdvancedCopasstTrainingService,
    ResponsibleSgsstDocumentGenerator,
    CopasstDocumentGenerator,
    ResponsibilitiesDocumentGenerator,
    ResourceAssignmentDocumentGenerator,
    SstPolicyDocumentGenerator,
    // Fase 4 (1.1.7) — exportados para futuras fases (Approval Fase 5).
    CopasstTrainingVariableResolverService,
    CopasstTrainingDocumentService,
    CopasstTrainingDocumentGenerator,
  ],
})
export class PhvaAdvancedModule {}
