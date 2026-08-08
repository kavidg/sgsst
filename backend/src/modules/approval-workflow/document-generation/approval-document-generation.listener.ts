import { Injectable } from '@nestjs/common';
import { ApprovalDecision } from '../enums/approval-decision.enum';
import {
  ApprovalDocumentContext,
  ApprovalDocumentGenerator,
} from './approval-document-generator.interface';
import { ApprovalDocumentRegistryService } from './approval-document-registry.service';

/**
 * Listener global de generación documental post-aprobación (Fase 2.1).
 *
 * Escucha las decisiones del Approval Workflow Core y, cuando una entidad
 * aprobada tiene un documento formal registrado en el
 * ApprovalDocumentRegistryService, delega en el generador correspondiente:
 *
 *   ApprovalWorkflow
 *     ↓ ApprovalEvent (decision === APPROVED)
 *   ApprovalDocumentGenerationListener   ← este listener
 *     ↓ ApprovalDocumentRegistryService  (module + entity → generator)
 *   ApprovalDocumentGenerator            (p.ej. ResponsibleSgsstDocumentGenerator)
 *     ↓
 *   DocumentGenerationService            (única ruta de generación)
 *
 * El listener NO conoce lógica PHVA ni de ningún módulo: únicamente resuelve
 * el generador por module + entityType y delega. Si la entidad no tiene
 * documento registrado, no genera nada y NO falla (el ApprovalEvent APPROVED
 * sin documento registrado es un escenario válido).
 *
 * NOTA de arquitectura: el Approval Workflow Core no posee un bus de eventos
 * (sin dependencias nuevas); el listener se invoca explícitamente desde
 * ApprovalWorkflowService.decideAndApply tras registrar el ApprovalEvent
 * APPROVED, que es el punto único por donde pasan TODAS las decisiones
 * (endpoints PHVA y endpoint genérico /decide). El Core sigue siendo dueño
 * únicamente de las decisiones.
 */
@Injectable()
export class ApprovalDocumentGenerationListener {
  constructor(
    private readonly registry: ApprovalDocumentRegistryService,
  ) {}

  /**
   * Procesa una decisión ya aplicada del Approval Workflow Core y orquesta la
   * generación del documento formal cuando corresponde.
   *
   * @param context - Contexto de la decisión (ApprovalEvent APPROVED).
   */
  async onDecisionApplied(context: ApprovalDocumentContext): Promise<unknown> {
    // Solo las decisiones APPROVED pueden originar documentos formales.
    if (context.decision !== ApprovalDecision.APPROVED) {
      return null;
    }

    const generator: ApprovalDocumentGenerator | undefined =
      this.registry.findGenerator(context.module, context.entityType);

    // Entidad sin documento registrado: no genera y no falla.
    if (!generator) {
      return null;
    }

    return generator.generate(context);
  }
}
