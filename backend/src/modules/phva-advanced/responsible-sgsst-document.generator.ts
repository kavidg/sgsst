import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { ApprovalEntity } from '../approval-workflow/enums/approval-entity.enum';
import { resolveApprovedByObjectId } from '../approval-workflow/helpers/approval-actor.helper';
import {
  ApprovalDocumentContext,
  ApprovalDocumentGenerator,
} from '../approval-workflow/document-generation/approval-document-generator.interface';
import { PHVA_SOURCE_ENTITY_RESPONSIBLE_SG_SST } from '../document-generation/types/document-generation.types';
import { PhvaAdvancedService } from './phva-advanced.service';

/**
 * Generador documental del Responsable del SG-SST (PHVA 1.1.1).
 *
 * Fase 2.1 — Implementa el contrato ApprovalDocumentGenerator del Approval
 * Workflow Core: traduce el contexto de la decisión APPROVED en la generación
 * del documento formal reutilizando EXCLUSIVAMENTE
 * PhvaAdvancedService.generateResponsibleSgsstDocument() (que delega en el
 * Document Generation Engine).
 *
 * El generador NO contiene lógica de aprobación ni de generación: únicamente
 * mapea el contexto del ApprovalEvent (companyId, entityId, actor,
 * approvalEventId, approvedAt) hacia la firma del servicio de negocio.
 *
 * Futuras entidades PHVA (COPASST, CONVIVENCIA, RESPONSIBILITIES, SST_POLICY)
 * registrarán su propio ApprovalDocumentGenerator en APPROVAL_DOCUMENT_GENERATORS.
 */
@Injectable()
export class ResponsibleSgsstDocumentGenerator implements ApprovalDocumentGenerator {
  readonly module = ApprovalEntity.PHVA_ADVANCED;
  readonly entityType = PHVA_SOURCE_ENTITY_RESPONSIBLE_SG_SST;

  constructor(private readonly phvaAdvancedService: PhvaAdvancedService) {}

  /**
   * Genera el documento formal del Responsable del SG-SST tras la aprobación.
   *
   * @param context - Contexto de la decisión APPROVED del Approval Workflow Core.
   */
  async generate(context: ApprovalDocumentContext): Promise<unknown> {
    return this.phvaAdvancedService.generateResponsibleSgsstDocument({
      companyId: new Types.ObjectId(context.companyId),
      sourceEntityId: new Types.ObjectId(context.entityId),
      approval: {
        status: 'APPROVED',
        approvedBy: resolveApprovedByObjectId(context.actor),
        approvedAt: context.approvedAt ?? new Date(),
        approvalEventId: context.approvalEventId,
        approvalRequestId: new Types.ObjectId(context.requestId),
      },
    });
  }
}
