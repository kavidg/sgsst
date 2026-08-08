import { Injectable, NotFoundException } from '@nestjs/common';
import { ApprovalEntity } from '../enums/approval-entity.enum';
import { ApprovalStatus } from '../enums/approval-status.enum';
import { ApprovalAdapter, ApplyDecisionContext } from './approval-adapter.interface';
import { mapPhvaAdvancedStatus } from '../utils/phva-status-map';
import { ResourceAssignmentHandler } from './handlers/resource-assignment.handler';
import { TrainingManagementHandler } from './handlers/training-management.handler';
import { SstPolicyHandler } from './handlers/sst-policy.handler';
import { ResponsibilitiesHandler } from './handlers/responsibilities.handler';
import { ResponsibleSgsstHandler } from './handlers/responsible-sgsst.handler';

/**
 * Contrato estructural de los handlers de sub-entidad de PHVA Advanced.
 * Cada handler implementa getEntity/applyDecision/mapStatus/allowedRoles.
 */
interface PhvaAdvancedSubHandler {
  getEntity(companyId: string, entityId?: string): Promise<unknown>;
  applyDecision(ctx: ApplyDecisionContext): Promise<unknown>;
  mapStatus(localStatus: string): ApprovalStatus;
  allowedRoles(): string[];
}

/**
 * Adapter de PHVA Advanced para el Approval Workflow Core.
 *
 * El módulo PHVA Advanced agrupa varias sub-entidades con flujos de aprobación
 * propios (Resource Assignment, Training Management, SST Policy,
 * Responsibilities). Para evitar un adapter monolítico, este adapter es una
 * FACHAZA que despacha (dispatcher) hacia handlers especializados por
 * sub-entidad (patrón Strategy).
 *
 * Fase 6.1-6.3: ResourceAssignmentHandler (1.1.3).
 * Fase 6.4: TrainingManagementHandler (1.2.1).
 * Fase 6.5: SstPolicyHandler (2.1.1) — aprobación reutilizando
 * approveSstPolicy; REJECTED/ADJUSTMENTS no soportados (sin rechazo real).
 * Fase 6.6A: ResponsibilitiesHandler (1.1.2) — aprobación reutilizando
 * approveResponsibilities y rechazo reutilizando rejectResponsibilities;
 * ADJUSTMENTS no soportado (sin flujo real).
 * Fase 2 Document Generation: ResponsibleSgsstHandler (1.1.1) — aprobación
 * reutilizando approveResponsableSst y rechazo reutilizando
 * rejectResponsableSst. Tras la aprobación, el ApprovalWorkflowService
 * notifica al ApprovalDocumentGenerationListener (Fase 2.1), que resuelve el
 * ResponsibleSgsstDocumentGenerator vía ApprovalDocumentRegistryService para
 * generar el documento formal (Document Generation Engine).
 * La interfaz del motor (ApprovalAdapter) permanece intacta.
 *
 * El adapter NO contiene lógica de negocio: toda decisión se aplica
 * reutilizando los servicios existentes de PhvaAdvancedService a través de los
 * handlers.
 */
@Injectable()
export class PhvaAdvancedAdapter implements ApprovalAdapter {
  readonly module = ApprovalEntity.PHVA_ADVANCED;

  private readonly handlers: PhvaAdvancedSubHandler[];

  constructor(
    private readonly resourceAssignmentHandler: ResourceAssignmentHandler,
    private readonly trainingManagementHandler: TrainingManagementHandler,
    private readonly sstPolicyHandler: SstPolicyHandler,
    private readonly responsibilitiesHandler: ResponsibilitiesHandler,
    private readonly responsibleSgsstHandler: ResponsibleSgsstHandler,
  ) {
    this.handlers = [
      resourceAssignmentHandler,
      trainingManagementHandler,
      sstPolicyHandler,
      responsibilitiesHandler,
      responsibleSgsstHandler,
    ];
  }

  /**
   * Carga la entidad de la sub-entidad correspondiente validando pertenencia
   * por companyId. El dispatcher resuelve el handler probando cada sub-entidad
   * hasta encontrar la que posee la entidad (los getters lanzan
   * NotFoundException cuando el registro no existe en su colección).
   *
   * Soporta dos escenarios:
   * A) entityId presente → carga el registro específico.
   * B) entityId undefined → resuelve el registro vigente de la empresa.
   */
  async getEntity(companyId: string, entityId?: string) {
    const handler = await this.resolveHandler(companyId, entityId);
    return handler.getEntity(companyId, entityId);
  }

  /**
   * Aplica una decisión del motor delegando en el handler de la sub-entidad
   * que posee la entidad (resource assignment, training management, SST
   * policy o responsibilities), que reutiliza los métodos existentes de
   * PhvaAdvancedService conservando estado, historial, firmas y alertas del
   * módulo.
   */
  async applyDecision(ctx: ApplyDecisionContext) {
    const handler = await this.resolveHandler(
      ctx.companyId.toString(),
      ctx.entityId.toString(),
    );
    return handler.applyDecision(ctx);
  }

  /**
   * Mapeo canónico unificado de los estados locales de las sub-entidades:
   *
   * Resource Assignment: DRAFT, PENDING_APPROVAL, APPROVED, APPROVED_AND_SIGNED,
   * REJECTED, ARCHIVED.
   * Training Management: PENDING, APPROVED, REJECTED, ADJUSTMENTS_REQUESTED.
   * SST Policy (enum español): 'Borrador', 'Pendiente aprobación', 'Aprobado',
   * 'Vencido', 'Archivado'.
   * Responsibilities: DRAFT, PENDING_APPROVAL, APPROVED, APPROVED_AND_SIGNED,
   * REJECTED.
   * Responsible SG-SST: DRAFT, PENDING_APPROVAL, APPROVED,
   * APPROVED_AND_SIGNED, REJECTED, ARCHIVED.
   *
   * APPROVED_AND_SIGNED (estado compuesto de negocio: aprobado y firmado) se
   * mapea al APPROVED canónico; PENDING (estado inicial de capacitaciones) al
   * PENDING_APPROVAL canónico; 'Vencido' (ciclo cerrado) al ARCHIVED canónico.
   */
  mapStatus(localStatus: string): ApprovalStatus {
    // Conversión canónica UNIFICADA centralizada en utils/phva-status-map.ts
    // (Fase 6.7): cubre los estados de las cuatro sub-entidades (inglés y
    // español) con una única fuente de verdad.
    return mapPhvaAdvancedStatus(localStatus);
  }

  allowedRoles(): string[] {
    // Roles actuales de aprobación de ambas sub-entidades (controller):
    // submit owner/admin, approve/reject owner/manager.
    return ['owner', 'manager'];
  }

  /**
   * Resuelve el handler propietario de la entidad probando cada sub-entidad.
   * Solo un NotFoundException se interpreta como "no es esta sub-entidad";
   * cualquier otro error (p.ej. ObjectId inválido) se propaga.
   */
  private async resolveHandler(
    companyId: string,
    entityId?: string,
  ): Promise<PhvaAdvancedSubHandler> {
    let lastNotFound: NotFoundException | null = null;
    for (const handler of this.handlers) {
      try {
        await handler.getEntity(companyId, entityId);
        return handler;
      } catch (error) {
        if (error instanceof NotFoundException) {
          lastNotFound = error;
          continue;
        }
        throw error;
      }
    }
    throw lastNotFound ?? new NotFoundException('PHVA Advanced entity not found');
  }
}
