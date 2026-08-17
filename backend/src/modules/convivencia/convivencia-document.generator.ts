import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { ApprovalEntity } from '../approval-workflow/enums/approval-entity.enum';
import {
  ApprovalDocumentContext,
  ApprovalDocumentGenerator,
  ApprovalDocumentRegistryKey,
} from '../approval-workflow/document-generation/approval-document-generator.interface';
import { PHVA_SOURCE_ENTITY_CONVIVENCIA } from '../document-generation/types/document-generation.types';
import { ConvivenciaDocumentService } from './convivencia-document.service';

/**
 * Generador documental del Comité de Convivencia (PHVA 1.1.8, Fase 5).
 *
 * Implementa el contrato ApprovalDocumentGenerator del Approval Workflow Core
 * y queda REGISTRADO bajo la clave real `CONVIVENCIA:'ConvivenciaPeriod'` (la
 * que usa el convivencia.controller al crear la solicitud) + alias normalizado
 * `CONVIVENCIA:'CONVIVENCIA'` (clave del Document Generation Engine).
 *
 * Fase 5 — el generador queda ACTIVO: cuando la entidad 1.1.8 se APRUEBA
 * (ApprovalEvent APPROVED), el ApprovalDocumentGenerationListener lo invoca y
 * genera el Acta de conformación del comité. La generación manual desde la UI
 * usa directamente ConvivenciaDocumentService. Se delega sin usuario
 * autenticado (la generación post-aprobación es de sistema; el historial queda
 * como 'system').
 *
 * Multi-tenancy: el document service resuelve el periodo SIEMPRE con el
 * companyId del contexto de la decisión (nunca periodId suelto) vía
 * findById/findCurrent del dominio endurecido.
 */
@Injectable()
export class ConvivenciaDocumentGenerator implements ApprovalDocumentGenerator {
  readonly module = ApprovalEntity.CONVIVENCIA;
  readonly entityType = 'ConvivenciaPeriod';
  readonly aliases: ReadonlyArray<ApprovalDocumentRegistryKey> = [
    {
      module: ApprovalEntity.CONVIVENCIA,
      entityType: PHVA_SOURCE_ENTITY_CONVIVENCIA,
    },
  ];

  constructor(private readonly documentService: ConvivenciaDocumentService) {}

  /**
   * Genera el acta de conformación de la entidad 1.1.8 aprobada.
   *
   * @param context - Contexto de la decisión APPROVED del Approval Workflow Core.
   */
  async generate(context: ApprovalDocumentContext): Promise<unknown> {
    return this.documentService.generateConstitutionMinutes(
      new Types.ObjectId(context.companyId),
      undefined,
      context.entityId,
    );
  }
}
