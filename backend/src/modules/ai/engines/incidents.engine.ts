import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { IncidentsService } from '../../incidents/incidents.service';
import { AIContext } from '../interfaces/ai-context.interface';
import { AIEngine, AIEngineResult } from '../interfaces/ai-engine.interface';

/**
 * Engine de Accidentalidad (AUDIT-5).
 *
 * Capa delgada de composición: NO implementa lógica de negocio ni accede a
 * MongoDB directamente. Reutiliza IncidentsService (fuente real, scoped por
 * companyId) y resume los datos para la respuesta IA. Nunca expone
 * employeeId ni descripciones (PII): solo agregados y metadatos seguros.
 */
@Injectable()
export class IncidentsEngine implements AIEngine {
  constructor(private readonly incidentsService: IncidentsService) {}

  getName(): string {
    return 'incidents';
  }

  async execute(_question: string, context: AIContext): Promise<AIEngineResult> {
    if (!context.companyId) {
      return this.buildInsufficientResult();
    }

    let incidents: Array<{ type: string; severity: string; date?: Date; status: string }>;
    try {
      incidents = await this.incidentsService.findAll(new Types.ObjectId(context.companyId));
    } catch {
      return this.buildInsufficientResult();
    }

    if (incidents.length === 0) {
      return {
        action: 'incidents_summary',
        confidence: 0.5,
        response: 'No hay incidentes registrados para tu empresa.',
        suggestions: [
          '¿Cómo va el cumplimiento del SG-SST?',
          '¿Qué indicadores tenemos?',
          '¿Cómo está el ausentismo?',
        ],
      };
    }

    const open = incidents.filter((incident) => incident.status.toLowerCase() !== 'cerrado').length;
    const severityCounts = new Map<string, number>();
    for (const incident of incidents) {
      severityCounts.set(incident.severity, (severityCounts.get(incident.severity) ?? 0) + 1);
    }
    const severitySummary = Array.from(severityCounts.entries())
      .map(([severity, count]) => `${severity}: ${count}`)
      .join(', ');
    const recent = incidents
      .slice(0, 3)
      .map((incident) => `${incident.type} (${incident.severity})`)
      .join('; ');

    return {
      action: 'incidents_summary',
      confidence: 0.7,
      response: `Tu empresa tiene ${incidents.length} incidentes registrados, ${open} abiertos. Severidades: ${severitySummary}. Recientes: ${recent}.`,
      suggestions: [
        '¿Qué hallazgos tenemos sobre accidentalidad?',
        '¿Cómo está el cumplimiento del SG-SST?',
        '¿Qué debería priorizar el responsable SST?',
      ],
    };
  }

  private buildInsufficientResult(): AIEngineResult {
    return {
      action: 'incidents_summary',
      confidence: 0.2,
      response: 'Información insuficiente para analizar la accidentalidad.',
      suggestions: ['¿Cómo va el cumplimiento del SG-SST?', '¿Qué indicadores tenemos?'],
    };
  }
}
