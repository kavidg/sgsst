import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { RolesGuard } from '../questions/roles.guard';
import { User, UserSchema } from '../users/schemas/user.schema';
import { CompanyUser, CompanyUserSchema } from '../companies/schemas/company-user.schema';
import { DocumentManagementModule } from '../document-management/document-management.module';
import { AnnualWorkPlanModule } from '../annual-work-plan/annual-work-plan.module';
import { InitialEvaluationModule } from '../initial-evaluation/initial-evaluation.module';
import { ResponsibilityMatrixModule } from '../responsibility-matrix/responsibility-matrix.module';
import { CopasstModule } from '../copasst/copasst.module';
import { ConvivenciaModule } from '../convivencia/convivencia.module';
import { PhvaAdvancedModule } from '../phva-advanced/phva-advanced.module';
import { ApprovalWorkflowController } from './approval-workflow.controller';
import { ApprovalWorkflowService } from './approval-workflow.service';
import { ApprovalEvent, ApprovalEventSchema } from './schemas/approval-event.schema';
import { ApprovalRequest, ApprovalRequestSchema } from './schemas/approval-request.schema';
import {
  APPROVAL_ADAPTERS,
  ApprovalAdapter,
} from './adapters/approval-adapter.interface';
import { DocumentAdapter } from './adapters/document.adapter';
import { AnnualWorkPlanAdapter } from './adapters/annual-work-plan.adapter';
import { InitialEvaluationAdapter } from './adapters/initial-evaluation.adapter';
import { ResponsibilityMatrixAdapter } from './adapters/responsibility-matrix.adapter';
import { CopasstAdapter } from './adapters/copasst.adapter';
import { ConvivenciaAdapter } from './adapters/convivencia.adapter';
// Fase 5 (1.1.8): generador documental del Comité de Convivencia (acta de
// conformación post-aprobación). Provisto y exportado por ConvivenciaModule.
import { ConvivenciaDocumentGenerator } from '../convivencia/convivencia-document.generator';
import { PhvaAdvancedAdapter } from './adapters/phva-advanced.adapter';
import { ResourceAssignmentHandler } from './adapters/handlers/resource-assignment.handler';
import { TrainingManagementHandler } from './adapters/handlers/training-management.handler';
import { SstPolicyHandler } from './adapters/handlers/sst-policy.handler';
import { ResponsibilitiesHandler } from './adapters/handlers/responsibilities.handler';
import { ResponsibleSgsstHandler } from './adapters/handlers/responsible-sgsst.handler';
import { CopasstTrainingHandler } from './adapters/handlers/copasst-training.handler';
import { ResponsibleSgsstDocumentGenerator } from '../phva-advanced/responsible-sgsst-document.generator';
import { CopasstDocumentGenerator } from '../phva-advanced/copasst-document.generator';
import { ResponsibilitiesDocumentGenerator } from '../phva-advanced/responsibilities-document.generator';
import { ResourceAssignmentDocumentGenerator } from '../phva-advanced/resource-assignment-document.generator';
import { SstPolicyDocumentGenerator } from '../phva-advanced/sst-policy-document.generator';
import { CopasstTrainingDocumentGenerator } from '../phva-advanced/copasst-training-document.generator';
import { ApprovalDocumentGenerationListener } from './document-generation/approval-document-generation.listener';
import { ApprovalDocumentRegistryService } from './document-generation/approval-document-registry.service';
import {
  APPROVAL_DOCUMENT_GENERATORS,
  ApprovalDocumentGenerator,
} from './document-generation/approval-document-generator.interface';

/**
 * Módulo Approval Workflow Core.
 *
 * Fase 0: infraestructura base del motor de aprobaciones (solicitudes,
 * decisiones e historial append-only).
 *
 * Fase 2: registra el DocumentAdapter y expone el registro APPROVAL_ADAPTERS
 * para que ApprovalWorkflowService aplique decisiones sobre entidades reales
 * reutilizando los servicios existentes. Los endpoints actuales de los módulos
 * permanecen intactos; solo se delega internamente al motor.
 *
 * Fase 3: registra el AnnualWorkPlanAdapter (Plan Anual de Trabajo) con el
 * mismo patrón.
 *
 * Fase 3 (Initial Evaluation): registra el InitialEvaluationAdapter, que
 * conecta la Evaluación Inicial al motor (una entidad por empresa, entityId
 * opcional en getEntity).
 *
 * Fase 4: registra el ResponsibilityMatrixAdapter, que conecta la Matriz de
 * Responsabilidades al motor (una matriz por empresa, entityId opcional en
 * getEntity vía findByCompany).
 *
 * Fase 5A: registra el CopasstAdapter, que conecta el COPASST al motor
 * (periodos por empresa, periodId opcional en getEntity vía findCurrent,
 * aprobación y rechazo reales).
 *
 * Fase 5B: registra el ConvivenciaAdapter, que conecta el Comité de
 * Convivencia al motor con el mismo patrón (periodos por empresa, periodId
 * opcional en getEntity, aprobación y rechazo reales).
 *
 * Fase 6.1-6.3: registra el PhvaAdvancedAdapter, fachada del módulo PHVA
 * Advanced que delega en handlers por sub-entidad. En esta fase únicamente
 * existe el ResourceAssignmentHandler (1.1.3): getEntity con entityId
 * opcional vía findResourceAssignmentByCompany, aprobación y rechazo reales
 * reutilizando PhvaAdvancedService.
 *
 * Fase 6.4: registra el TrainingManagementHandler (1.2.1). El adapter ahora
 * despacha entre Resource Assignment y Training Management probando cada
 * sub-entidad; approve/reject/adjustments reutilizan approveTrainingManagement.
 *
 * Fase 6.5: registra el SstPolicyHandler (2.1.1). La aprobación reutiliza
 * approveSstPolicy (conserva firmas, historial, versiones, socializaciones y
 * comunicaciones); REJECTED/ADJUSTMENTS_REQUESTED no son soportados porque el
 * módulo no posee rechazo real de política.
 *
 * Fase 6.6A: registra el ResponsibilitiesHandler (1.1.2). La aprobación
 * reutiliza approveResponsibilities y el rechazo reutiliza
 * rejectResponsibilities (conservan el __META__, auditHistory, versions,
 * locked, representante legal, firmas, notificaciones y compliance);
 * ADJUSTMENTS_REQUESTED no es soportado (sin flujo real).
 */
@Module({
  imports: [
    AuthModule,
    forwardRef(() => DocumentManagementModule),
    forwardRef(() => AnnualWorkPlanModule),
    forwardRef(() => InitialEvaluationModule),
    forwardRef(() => ResponsibilityMatrixModule),
    forwardRef(() => CopasstModule),
    forwardRef(() => ConvivenciaModule),
    forwardRef(() => PhvaAdvancedModule),
    MongooseModule.forFeature([
      { name: ApprovalRequest.name, schema: ApprovalRequestSchema },
      { name: ApprovalEvent.name, schema: ApprovalEventSchema },
      { name: User.name, schema: UserSchema },
      { name: CompanyUser.name, schema: CompanyUserSchema },
    ]),
  ],
  controllers: [ApprovalWorkflowController],
  providers: [
    ApprovalWorkflowService,
    RolesGuard,
    CompanyAccessGuard,
    DocumentAdapter,
    AnnualWorkPlanAdapter,
    InitialEvaluationAdapter,
    ResponsibilityMatrixAdapter,
    CopasstAdapter,
    ConvivenciaAdapter,
    PhvaAdvancedAdapter,
    ResourceAssignmentHandler,
    TrainingManagementHandler,
    SstPolicyHandler,
    ResponsibilitiesHandler,
    ResponsibleSgsstHandler,
    // Fase 5 (1.1.7) — Capacitación COPASST: approve/reject/adjustments
    // reutilizan PhvaAdvancedCopasstTrainingService.approveCopasstTraining.
    CopasstTrainingHandler,
    {
      provide: APPROVAL_ADAPTERS,
      useFactory: (...adapters: ApprovalAdapter[]) => adapters,
      inject: [
        DocumentAdapter,
        AnnualWorkPlanAdapter,
        InitialEvaluationAdapter,
        ResponsibilityMatrixAdapter,
        CopasstAdapter,
        ConvivenciaAdapter,
        PhvaAdvancedAdapter,
      ],
    },
    // Fase 2.1 — generación documental post-aprobación centralizada en el Core.
    ApprovalDocumentRegistryService,
    ApprovalDocumentGenerationListener,
    {
      provide: APPROVAL_DOCUMENT_GENERATORS,
      useFactory: (...generators: ApprovalDocumentGenerator[]) => generators,
      // Fase 2.1: ResponsibleSgsstDocumentGenerator (PHVA_ADVANCED:RESPONSIBLE_SG_SST).
      // Fase 3: CopasstDocumentGenerator (clave real COPASST:'CopasstPeriod' +
      // alias PHVA_ADVANCED:'COPASST' declarado en el propio generador).
      // Fase 4: ResponsibilitiesDocumentGenerator (clave real
      // PHVA_ADVANCED:'PhvaAdvancedResponsibilities' + alias
      // PHVA_ADVANCED:'RESPONSIBILITIES' declarado en el propio generador).
      // Fase 5: ResourceAssignmentDocumentGenerator (clave real
      // PHVA_ADVANCED:'PhvaAdvancedResourceAssignment' + alias
      // PHVA_ADVANCED:'RESOURCE_ASSIGNMENT' declarado en el propio generador).
      // Fase 6: SstPolicyDocumentGenerator (clave real
      // PHVA_ADVANCED:'PhvaAdvancedSstPolicy' + alias
      // PHVA_ADVANCED:'SST_POLICY' declarado en el propio generador).
      // Fase 4 (1.1.7): CopasstTrainingDocumentGenerator (clave real
      // PHVA_ADVANCED:'PhvaAdvancedCopasstTraining' + alias
      // PHVA_ADVANCED:'COPASST_TRAINING' declarado en el propio generador).
      // Fase 5: activo — genera el Informe de capacitación cuando 1.1.7 se
      // aprueba (ApprovalDocumentGenerationListener).
      // Fase 5 (1.1.8): ConvivenciaDocumentGenerator (clave real
      // CONVIVENCIA:'ConvivenciaPeriod' + alias CONVIVENCIA:'CONVIVENCIA'
      // declarado en el propio generador). Genera el acta de conformación
      // cuando 1.1.8 se aprueba.
      inject: [
        ResponsibleSgsstDocumentGenerator,
        CopasstDocumentGenerator,
        ResponsibilitiesDocumentGenerator,
        ResourceAssignmentDocumentGenerator,
        SstPolicyDocumentGenerator,
        CopasstTrainingDocumentGenerator,
        ConvivenciaDocumentGenerator,
      ],
    },
  ],
  exports: [ApprovalWorkflowService],
})
export class ApprovalWorkflowModule {}
