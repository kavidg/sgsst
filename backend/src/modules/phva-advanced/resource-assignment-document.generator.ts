import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { ApprovalEntity } from '../approval-workflow/enums/approval-entity.enum';
import { resolveApprovedByObjectId } from '../approval-workflow/helpers/approval-actor.helper';
import {
  ApprovalDocumentContext,
  ApprovalDocumentGenerator,
  ApprovalDocumentRegistryKey,
} from '../approval-workflow/document-generation/approval-document-generator.interface';
import { PHVA_SOURCE_ENTITY_RESOURCE_ASSIGNMENT } from '../document-generation/types/document-generation.types';
import { PhvaAdvancedService } from './phva-advanced.service';

/**
 * Generador documental de la Asignación de Recursos para el SG-SST (PHVA
 * 1.1.3).
 *
 * Fase 5 — Implementa el contrato ApprovalDocumentGenerator del Approval
 * Workflow Core: traduce el contexto de la decisión APPROVED en la generación
 * del documento formal reutilizando EXCLUSIVAMENTE
 * PhvaAdvancedService.generateResourceAssignmentDocument() (que delega en el
 * Document Generation Engine).
 *
 * Claves de registro:
 * - Clave REAL del flujo actual: module=PHVA_ADVANCED +
 *   entityType='PhvaAdvancedResourceAssignment' (el submitResourceAssignment
 *   del phva-advanced.controller registra el ApprovalRequest con esos valores).
 * - Alias normalizado futuro: module=PHVA_ADVANCED + entityType='RESOURCE_ASSIGNMENT'.
 *
 * Ambas apuntan al MISMO generador: el ApprovalDocumentRegistryService registra
 * la clave canónica y los aliases sin duplicar la generación.
 *
 * El generador NO contiene lógica de aprobación ni de generación: únicamente
 * mapea el contexto del ApprovalEvent (companyId, entityId, actor,
 * approvalEventId, approvedAt) hacia la firma del servicio de negocio.
 */
@Injectable()
export class ResourceAssignmentDocumentGenerator implements ApprovalDocumentGenerator {
  readonly module = ApprovalEntity.PHVA_ADVANCED;
  readonly entityType = 'PhvaAdvancedResourceAssignment';
  readonly aliases: ReadonlyArray<ApprovalDocumentRegistryKey> = [
    {
      module: ApprovalEntity.PHVA_ADVANCED,
      entityType: PHVA_SOURCE_ENTITY_RESOURCE_ASSIGNMENT,
    },
  ];

  constructor(private readonly phvaAdvancedService: PhvaAdvancedService) {}

  /**
   * Genera el documento formal de la Asignación de Recursos tras la aprobación
   * del punto PHVA 1.1.3.
   *
   * @param context - Contexto de la decisión APPROVED del Approval Workflow Core.
   */
  async generate(context: ApprovalDocumentContext): Promise<unknown> {
    return this.phvaAdvancedService.generateResourceAssignmentDocument({
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
