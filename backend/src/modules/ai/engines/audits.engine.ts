import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { InspectionsService } from '../../inspections/inspections.service';
import { AIContext } from '../interfaces/ai-context.interface';
import { AIEngine, AIEngineResult } from '../interfaces/ai-engine.interface';

/**
 * Engine de Auditorías / Inspecciones (AUDIT-5).
 *
 * Capa delgada de composición: reutiliza InspectionsService (fuente real,
 * scoped por companyId). No expone responsables ni notas internas (PII/sensible):
 * solo títulos, estados y fechas planificadas.
 */
@Injectable()
export class AuditsEngine implements AIEngine {
  constructor(private readonly inspectionsService: InspectionsService) {}

  getName(): string {
    return 'audits';
  }

  async execute(_question: string, context: AIContext): Promise<AIEngineResult> {
    if (!context.companyId) {
      return this.buildInsufficientResult();
    }

    let audits: Array<{ title: string; status: string; plannedDate?: Date; completedDate?: Date }>;
    try {
      audits = await this.inspectionsService.findAll(new Types.ObjectId(context.companyId));
    } catch {
      return this.buildInsufficientResult();
    }

    if (audits.length === 0) {
      return {
        action: 'audits_summary',
        confidence: 0.5,
        response: 'No hay inspecciones ni auditorías registradas para tu empresa.',
        suggestions: [
          '¿Cómo va el cumplimiento del SG-SST?',
          '¿Qué actividades del plan anual están pendientes?',
          '¿Qué debería priorizar el responsable SST?',
        ],
      };
    }

    // Sin double-count: un registro es completado si NO está pendiente
    // (completedDate es metadata adicional, no redefine el estado).
    const pending = audits.filter((audit) => audit.status === 'pendiente').length;
    const completed = audits.length - pending;
    const upcoming = audits
      .filter((audit) => audit.status === 'pendiente')
      .slice(0, 3)
      .map((audit) => audit.title)
      .join('; ');

    return {
      action: 'audits_summary',
      confidence: 0.7,
      response: `Tu empresa tiene ${audits.length} inspecciones/auditorías: ${pending} pendientes y ${completed} completadas. Próximas: ${upcoming}.`,
      suggestions: [
        '¿Qué hallazgos tenemos?',
        '¿Cómo va el cumplimiento del SG-SST?',
        '¿Qué debería priorizar el responsable SST?',
      ],
    };
  }

  private buildInsufficientResult(): AIEngineResult {
    return {
      action: 'audits_summary',
      confidence: 0.2,
      response: 'Información insuficiente para analizar las inspecciones y auditorías.',
      suggestions: ['¿Cómo va el cumplimiento del SG-SST?', '¿Qué actividades del plan anual están pendientes?'],
    };
  }
}
