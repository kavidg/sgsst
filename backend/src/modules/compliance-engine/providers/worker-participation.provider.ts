import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  WorkerParticipation,
  WorkerParticipationDocument,
  ParticipationActivityType,
  ParticipationStatus,
} from '../../risks/schemas/worker-participation.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Evaluación automática del estándar 4.1.2
 * "Participación de trabajadores en la identificación de peligros,
 *  evaluación y valoración de riesgos, y toma de decisiones sobre
 *  medidas de prevención y establecimiento de controles".
 *
 * Evalúa la existencia y calidad de registros de participación
 * de trabajadores en la gestión de peligros y riesgos.
 *
 * CRÍTICO: Este provider evalúa EXCLUSIVAMENTE WorkerParticipation.
 * NO evalúa RiskMethodology (4.1.1).
 * NO evalúa Risk individual.
 * NO evalúa COPASST ni Convivencia.
 *
 * Fuentes de datos:
 * - WorkerParticipation.activityType
 * - WorkerParticipation.status
 * - WorkerParticipation.participants
 * - WorkerParticipation.participationDate
 *
 * Criterios y pesos (PROPUESTOS — NO NORMATIVOS):
 * - Existencia de registros:          25%
 * - Actividades completadas:          25%
 * - Presencia de participantes:       25%
 * - Cobertura de activityType:        25%
 *
 * NO_DATA: sin registros de participación.
 * TARGET_MET: actividades completadas con participantes y cobertura completa.
 * TARGET_NOT_MET: sin registros, sin completar, sin participantes o cobertura incompleta.
 */
@Injectable()
export class WorkerParticipationProvider implements ComplianceProvider {
  private static readonly MODULE = 'worker-participation';
  private static readonly COMPLIANCE_TARGET = 90;

  /**
   * Categorías esenciales para cobertura completa del estándar 4.1.2.
   * 
   * La cobertura requiere evidencia de participación en:
   * 1. Identificación de peligros
   * 2. Evaluación de riesgos
   * 3. Valoración de riesgos
   * 4. Toma de decisiones sobre medidas de prevención/control
   * 5. Establecimiento de medidas de control
   */
  private static readonly ESSENTIAL_TYPES: ParticipationActivityType[] = [
    ParticipationActivityType.HAZARD_IDENTIFICATION,
    ParticipationActivityType.RISK_ASSESSMENT,
    ParticipationActivityType.RISK_VALUATION,
    ParticipationActivityType.CONTROL_DECISION,
    ParticipationActivityType.CONTROL_ESTABLISHMENT,
  ];

  constructor(
    @InjectModel(WorkerParticipation.name)
    private readonly participationModel: Model<WorkerParticipationDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);

    const participations = await this.participationModel
      .find({ companyId: companyObjectId })
      .sort({ participationDate: -1 })
      .exec();

    // ── NO_DATA ──
    if (participations.length === 0) {
      return {
        module: WorkerParticipationProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: [
          {
            id: 'worker-participation-no-data',
            module: WorkerParticipationProvider.MODULE,
            title: 'Sin registros de participación de trabajadores',
            description:
              'No existen registros de participación de trabajadores en la identificación de peligros, evaluación y valoración de riesgos. El estándar 4.1.2 requiere evidencia de participación activa.',
            priority: FindingPriority.HIGH,
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
        pending: 0,
        completed: 0,
        phases: { do: 0 } as Partial<Record<CompliancePhaseKey, number>>,
      };
    }

    const totalParticipations = participations.length;

    // ══════════════════════════════════════════════════════════
    // CRITERIO 1 — Existencia de registros (25%)
    //
    // Si existen registros → 25 puntos.
    // El volumen no es el criterio; la existencia documentada sí.
    // ══════════════════════════════════════════════════════════
    const existenceScore = 1;

    // ══════════════════════════════════════════════════════════
    // CRITERIO 2 — Actividades completadas (25%)
    //
    // Evalúa qué proporción de registros están COMPLETED.
    // COMPLETED = evidencia efectiva de participación.
    // DRAFT = registrado pero no completado.
    // CANCELLED = no cuenta como evidencia.
    // ══════════════════════════════════════════════════════════
    const completedParticipations = participations.filter(
      (p) => p.status === ParticipationStatus.COMPLETED,
    );
    const completionScore = completedParticipations.length / totalParticipations;

    // ══════════════════════════════════════════════════════════
    // CRITERIO 3 — Presencia de participantes (25%)
    //
    // Evalúa qué proporción de actividades COMPLETED tienen
    // al menos un participante registrado.
    //
    // Actividad registrada ≠ participación demostrada.
    // Sin participantes = no hay evidencia de quién participó.
    // ══════════════════════════════════════════════════════════
    let withParticipants = 0;
    for (const p of completedParticipations) {
      const participants = (p as any).participants as Types.ObjectId[] | undefined;
      if (participants && participants.length > 0) {
        withParticipants++;
      }
    }
    const participantScore = completedParticipations.length > 0
      ? withParticipants / completedParticipations.length
      : 0;

    // ══════════════════════════════════════════════════════════
    // CRITERIO 4 — Cobertura de activityType (25%)
    //
    // Evalúa si existen actividades COMPLETED en las categorías
    // esenciales del 4.1.2:
    // - HAZARD_IDENTIFICATION
    // - RISK_ASSESSMENT
    // - RISK_VALUATION
    // - CONTROL_DECISION
    // - CONTROL_ESTABLISHMENT
    //
    // Cada categoría presente = 1/5 del score.
    // ══════════════════════════════════════════════════════════
    const coveredTypes = new Set<ParticipationActivityType>();
    for (const p of completedParticipations) {
      coveredTypes.add(p.activityType);
    }

    let coveredEssential = 0;
    for (const essentialType of WorkerParticipationProvider.ESSENTIAL_TYPES) {
      if (coveredTypes.has(essentialType)) {
        coveredEssential++;
      }
    }
    const coverageScore = coveredEssential / WorkerParticipationProvider.ESSENTIAL_TYPES.length;

    // ══════════════════════════════════════════════════════════
    // CÁLCULO FINAL (25/25/25/25)
    //
    // PROPUESTO — NO NORMATIVO.
    // Los pesos son una propuesta funcional del proyecto,
    // NO pesos normativos explícitos de la Resolución 0312.
    // ══════════════════════════════════════════════════════════
    const percentage = Math.round(
      existenceScore * 25 +
      completionScore * 25 +
      participantScore * 25 +
      coverageScore * 25,
    );

    // ── Status ──
    const status =
      percentage >= WorkerParticipationProvider.COMPLIANCE_TARGET
        ? 'TARGET_MET'
        : 'TARGET_NOT_MET';

    // ── Findings ──
    const findings: ProviderComplianceResult['findings'] = [];

    // Finding: no hay actividades completadas
    if (completedParticipations.length === 0) {
      findings.push({
        id: 'worker-participation-no-completed',
        module: WorkerParticipationProvider.MODULE,
        title: 'Sin actividades de participación completadas',
        description:
          `Existen ${totalParticipations} registros de participación, pero ninguno está en estado COMPLETED. Completar las actividades para generar evidencia efectiva de participación.`,
        priority: FindingPriority.HIGH,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Finding: actividades completadas sin participantes
    if (completedParticipations.length > 0 && withParticipants === 0) {
      findings.push({
        id: 'worker-participation-no-participants',
        module: WorkerParticipationProvider.MODULE,
        title: 'Actividades sin participantes registrados',
        description:
          `Las ${completedParticipations.length} actividades completadas no tienen participantes registrados. La participación de trabajadores requiere identificar quiénes participaron.`,
        priority: FindingPriority.HIGH,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    } else if (completedParticipations.length > 0 && withParticipants < completedParticipations.length) {
      findings.push({
        id: 'worker-participation-partial-participants',
        module: WorkerParticipationProvider.MODULE,
        title: `${completedParticipations.length - withParticipants} actividades sin participantes`,
        description:
          `${completedParticipations.length - withParticipants} de ${completedParticipations.length} actividades completadas no tienen participantes registrados. Completar la información de quiénes participaron.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Finding: cobertura incompleta de activityType
    if (coverageScore < 1) {
      const missingTypes = WorkerParticipationProvider.ESSENTIAL_TYPES.filter(
        (t) => !coveredTypes.has(t),
      );
      const missingNames = missingTypes.map((t) => {
        const labels: Record<string, string> = {
          HAZARD_IDENTIFICATION: 'identificación de peligros',
          RISK_ASSESSMENT: 'evaluación de riesgos',
          RISK_VALUATION: 'valoración de riesgos',
          CONTROL_DECISION: 'decisiones de control',
          CONTROL_ESTABLISHMENT: 'establecimiento de controles',
          OTHER: 'otras actividades',
        };
        return labels[t] ?? t;
      });

      findings.push({
        id: 'worker-participation-incomplete-coverage',
        module: WorkerParticipationProvider.MODULE,
        title: `Cobertura incompleta: faltan ${missingNames.length} categorías`,
        description:
          `Falta evidencia de participación en: ${missingNames.join(', ')}. El estándar 4.1.2 requiere participación en identificación, evaluación y toma de decisiones sobre controles.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    return {
      module: WorkerParticipationProvider.MODULE,
      percentage,
      status,
      findings,
      pending: completedParticipations.length < totalParticipations ? 1 : 0,
      completed: completedParticipations.length > 0 ? 1 : 0,
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }
}
