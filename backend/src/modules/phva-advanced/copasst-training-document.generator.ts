import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { ApprovalEntity } from '../approval-workflow/enums/approval-entity.enum';
import {
  ApprovalDocumentContext,
  ApprovalDocumentGenerator,
  ApprovalDocumentRegistryKey,
} from '../approval-workflow/document-generation/approval-document-generator.interface';
import { PHVA_SOURCE_ENTITY_COPASST_TRAINING } from '../document-generation/types/document-generation.types';
import { CopasstTrainingDocumentService } from './copasst-training-document.service';

/**
 * Generador documental de la Capacitación COPASST (PHVA 1.1.7, Fase 4).
 *
 * Implementa el contrato ApprovalDocumentGenerator del Approval Workflow Core
 * y queda REGISTRADO bajo la clave real `PHVA_ADVANCED:'PhvaAdvancedCopasstTraining'`
 * (+ alias normalizado `PHVA_ADVANCED:'COPASST_TRAINING'`) para que la Fase 5
 * (Approval Workflow de 1.1.7) pueda conectarlo sin cambios estructurales.
 *
 * Fase 5 — el generador quedó ACTIVO: desde que 1.1.7 posee flujo de
 * aprobación (CopasstTrainingHandler), el ApprovalDocumentGenerationListener
 * lo invoca cuando la entidad se APRUEBA (ApprovalEvent APPROVED) y genera el
 * Informe de capacitación (generateReport), documento definitivo del estándar.
 * La generación manual desde la UI NO pasa por este generador (usa
 * directamente CopasstTrainingDocumentService). Se delega sin usuario
 * autenticado (la generación post-aprobación es de sistema; el historial queda
 * como 'system').
 */
@Injectable()
export class CopasstTrainingDocumentGenerator implements ApprovalDocumentGenerator {
  readonly module = ApprovalEntity.PHVA_ADVANCED;
  readonly entityType = 'PhvaAdvancedCopasstTraining';
  readonly aliases: ReadonlyArray<ApprovalDocumentRegistryKey> = [
    {
      module: ApprovalEntity.PHVA_ADVANCED,
      entityType: PHVA_SOURCE_ENTITY_COPASST_TRAINING,
    },
  ];

  constructor(private readonly documentService: CopasstTrainingDocumentService) {}

  /**
   * Genera el informe de capacitación de la entidad 1.1.7 aprobada.
   *
   * @param context - Contexto de la decisión APPROVED del Approval Workflow Core.
   */
  async generate(context: ApprovalDocumentContext): Promise<unknown> {
    return this.documentService.generateReport(
      new Types.ObjectId(context.companyId),
      undefined,
    );
  }
}
