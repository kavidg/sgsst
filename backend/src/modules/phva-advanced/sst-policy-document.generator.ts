import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { ApprovalEntity } from '../approval-workflow/enums/approval-entity.enum';
import { resolveApprovedByObjectId } from '../approval-workflow/helpers/approval-actor.helper';
import {
  ApprovalDocumentContext,
  ApprovalDocumentGenerator,
  ApprovalDocumentRegistryKey,
} from '../approval-workflow/document-generation/approval-document-generator.interface';
import { PHVA_SOURCE_ENTITY_SST_POLICY } from '../document-generation/types/document-generation.types';
import { PhvaAdvancedService } from './phva-advanced.service';

/**
 * Generador documental de la Política de Seguridad y Salud en el Trabajo
 * (PHVA 2.1.1).
 *
 * Fase 6 — Implementa el contrato ApprovalDocumentGenerator del Approval
 * Workflow Core: traduce el contexto de la decisión APPROVED en la generación
 * del documento formal reutilizando EXCLUSIVAMENTE
 * PhvaAdvancedService.generateSstPolicyDocument() (que delega en el Document
 * Generation Engine).
 *
 * Claves de registro:
 * - Clave REAL del flujo actual: module=PHVA_ADVANCED +
 *   entityType='PhvaAdvancedSstPolicy' (el approveSstPolicy del
 *   phva-advanced.controller registra el ApprovalRequest con esos valores).
 * - Alias normalizado futuro: module=PHVA_ADVANCED + entityType='SST_POLICY'.
 *
 * Ambas apuntan al MISMO generador: el ApprovalDocumentRegistryService registra
 * la clave canónica y los aliases sin duplicar la generación.
 *
 * El generador NO contiene lógica de aprobación ni de generación: únicamente
 * mapea el contexto del ApprovalEvent (companyId, entityId, actor,
 * approvalEventId, approvedAt) hacia la firma del servicio de negocio.
 */
@Injectable()
export class SstPolicyDocumentGenerator implements ApprovalDocumentGenerator {
  readonly module = ApprovalEntity.PHVA_ADVANCED;
  readonly entityType = 'PhvaAdvancedSstPolicy';
  readonly aliases: ReadonlyArray<ApprovalDocumentRegistryKey> = [
    {
      module: ApprovalEntity.PHVA_ADVANCED,
      entityType: PHVA_SOURCE_ENTITY_SST_POLICY,
    },
  ];

  constructor(private readonly phvaAdvancedService: PhvaAdvancedService) {}

  /**
   * Genera el documento formal de la Política SST tras la aprobación del punto
   * PHVA 2.1.1.
   *
   * @param context - Contexto de la decisión APPROVED del Approval Workflow Core.
   */
  async generate(context: ApprovalDocumentContext): Promise<unknown> {
    return this.phvaAdvancedService.generateSstPolicyDocument({
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
