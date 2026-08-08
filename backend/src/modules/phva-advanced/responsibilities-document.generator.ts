import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { ApprovalEntity } from '../approval-workflow/enums/approval-entity.enum';
import { resolveApprovedByObjectId } from '../approval-workflow/helpers/approval-actor.helper';
import {
  ApprovalDocumentContext,
  ApprovalDocumentGenerator,
  ApprovalDocumentRegistryKey,
} from '../approval-workflow/document-generation/approval-document-generator.interface';
import { PHVA_SOURCE_ENTITY_RESPONSIBILITIES } from '../document-generation/types/document-generation.types';
import { PhvaAdvancedService } from './phva-advanced.service';

/**
 * Generador documental de la Matriz de Responsabilidades del SG-SST (PHVA
 * 1.1.2).
 *
 * Fase 4 — Implementa el contrato ApprovalDocumentGenerator del Approval
 * Workflow Core: traduce el contexto de la decisión APPROVED en la generación
 * del documento formal reutilizando EXCLUSIVAMENTE
 * PhvaAdvancedService.generateResponsibilitiesDocument() (que delega en el
 * Document Generation Engine).
 *
 * Claves de registro:
 * - Clave REAL del flujo actual: module=PHVA_ADVANCED +
 *   entityType='PhvaAdvancedResponsibilities' (el helper
 *   ensurePendingResponsibilitiesRequest del phva-advanced.controller registra
 *   el ApprovalRequest con esos valores).
 * - Alias normalizado futuro: module=PHVA_ADVANCED + entityType='RESPONSIBILITIES'.
 *
 * Ambas apuntan al MISMO generador: el ApprovalDocumentRegistryService registra
 * la clave canónica y los aliases sin duplicar la generación.
 *
 * El generador NO contiene lógica de aprobación ni de generación: únicamente
 * mapea el contexto del ApprovalEvent (companyId, entityId, actor,
 * approvalEventId, approvedAt) hacia la firma del servicio de negocio.
 */
@Injectable()
export class ResponsibilitiesDocumentGenerator implements ApprovalDocumentGenerator {
  readonly module = ApprovalEntity.PHVA_ADVANCED;
  readonly entityType = 'PhvaAdvancedResponsibilities';
  readonly aliases: ReadonlyArray<ApprovalDocumentRegistryKey> = [
    {
      module: ApprovalEntity.PHVA_ADVANCED,
      entityType: PHVA_SOURCE_ENTITY_RESPONSIBILITIES,
    },
  ];

  constructor(private readonly phvaAdvancedService: PhvaAdvancedService) {}

  /**
   * Genera el documento formal de la Matriz de Responsabilidades tras la
   * aprobación del punto PHVA 1.1.2.
   *
   * @param context - Contexto de la decisión APPROVED del Approval Workflow Core.
   */
  async generate(context: ApprovalDocumentContext): Promise<unknown> {
    return this.phvaAdvancedService.generateResponsibilitiesDocument({
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
