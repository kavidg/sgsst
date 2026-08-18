import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { TrainingsService } from '../../trainings/trainings.service';
import { AIContext } from '../interfaces/ai-context.interface';
import { AIEngine, AIEngineResult } from '../interfaces/ai-engine.interface';

/**
 * Engine de Programas / Capacitaciones (AUDIT-5).
 *
 * Capa delgada de composición: reutiliza TrainingsService (fuente real, scoped
 * por companyId). No expone instructores ni listas de asistencia (PII): solo
 * temas, fechas y conteo de capacitaciones con control de asistencia.
 */
@Injectable()
export class ProgramsEngine implements AIEngine {
  constructor(private readonly trainingsService: TrainingsService) {}

  getName(): string {
    return 'programs';
  }

  async execute(_question: string, context: AIContext): Promise<AIEngineResult> {
    if (!context.companyId) {
      return this.buildInsufficientResult();
    }

    let programs: Array<{ topic: string; date?: Date }>;
    try {
      programs = await this.trainingsService.findAll(new Types.ObjectId(context.companyId));
    } catch {
      return this.buildInsufficientResult();
    }

    if (programs.length === 0) {
      return {
        action: 'programs_summary',
        confidence: 0.5,
        response: 'No hay capacitaciones registradas para tu empresa.',
        suggestions: [
          '¿Cómo va el cumplimiento del SG-SST?',
          '¿Qué documentos están pendientes?',
          '¿Qué hallazgos tenemos sobre capacitación?',
        ],
      };
    }

    const recent = programs
      .slice(0, 3)
      .map((program) => program.topic)
      .join('; ');

    return {
      action: 'programs_summary',
      confidence: 0.7,
      response: `Tu empresa tiene ${programs.length} capacitaciones registradas. Recientes: ${recent}.`,
      suggestions: [
        '¿Cómo va el cumplimiento del SG-SST?',
        '¿Qué capacitaciones están pendientes?',
        '¿Qué debería priorizar el responsable SST?',
      ],
    };
  }

  private buildInsufficientResult(): AIEngineResult {
    return {
      action: 'programs_summary',
      confidence: 0.2,
      response: 'Información insuficiente para analizar los programas de capacitación.',
      suggestions: ['¿Cómo va el cumplimiento del SG-SST?', '¿Qué documentos están pendientes?'],
    };
  }
}
