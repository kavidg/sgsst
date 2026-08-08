import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { ApprovalEntity } from '../approval-workflow/enums/approval-entity.enum';
import { resolveApprovedByObjectId } from '../approval-workflow/helpers/approval-actor.helper';
import {
  ApprovalDocumentContext,
  ApprovalDocumentGenerator,
  ApprovalDocumentRegistryKey,
} from '../approval-workflow/document-generation/approval-document-generator.interface';
import { PHVA_SOURCE_ENTITY_COPASST } from '../document-generation/types/document-generation.types';
import { PhvaAdvancedService } from './phva-advanced.service';

/**
 * Generador documental de conformación del COPASST (Fase 3).
 *
 * Implementa el contrato ApprovalDocumentGenerator del Approval Workflow Core:
 * traduce el contexto de la decisión APPROVED en la generación del acta de
 * conformación del comité reutilizando EXCLUSIVAMENTE
 * PhvaAdvancedService.generateCopasstDocument() (que delega en el Document
 * Generation Engine).
 *
 * Claves de registro (decisión del usuario, Fase 3):
 * - Clave REAL del flujo actual: module=COPASST + entityType='CopasstPeriod'
 *   (el copasst.controller registra el ApprovalRequest con esos valores).
 * - Alias normalizado futuro: module=PHVA_ADVANCED + entityType='COPASST'.
 *
 * Ambas apuntan al MISMO generador: el ApprovalDocumentRegistryService registra
 * la clave canónica y los aliases sin duplicar la generación.
 *
 * El generador NO contiene lógica de aprobación ni de generación: únicamente
 * mapea el contexto del ApprovalEvent (companyId, entityId, actor,
 * approvalEventId, approvedAt) hacia la firma del servicio de negocio.
 */
@Injectable()
export class CopasstDocumentGenerator implements ApprovalDocumentGenerator {
  readonly module = ApprovalEntity.COPASST;
  readonly entityType = 'CopasstPeriod';
  readonly aliases: ReadonlyArray<ApprovalDocumentRegistryKey> = [
    {
      module: ApprovalEntity.PHVA_ADVANCED,
      entityType: PHVA_SOURCE_ENTITY_COPASST,
    },
  ];

  constructor(private readonly phvaAdvancedService: PhvaAdvancedService) {}

  /**
   * Genera el acta de conformación del COPASST tras la aprobación del periodo.
   *
   * @param context - Contexto de la decisión APPROVED del Approval Workflow Core.
   */
  async generate(context: ApprovalDocumentContext): Promise<unknown> {
    return this.phvaAdvancedService.generateCopasstDocument({
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
