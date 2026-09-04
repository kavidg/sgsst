import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  MedicalRecommendation,
  MedicalRecommendationDocument,
  RecommendationStatus,
} from '../../medical-recommendation/schemas/medical-recommendation.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';

/**
 * Evaluación automática del estándar 3.1.3 "Seguimiento a recomendaciones médicas".
 *
 * Conecta el dominio de Recomendaciones Médicas con ComplianceEngine
 * para evaluar el seguimiento administrativo de recomendaciones ocupacionales.
 *
 * Criterios y pesos (40/30/30):
 * - Seguimiento de recomendaciones: 40%
 *   (proporción de recomendaciones completadas vs total no canceladas)
 * - Acciones ejecutadas:            30%
 *   (proporción de acciones completadas vs total de acciones)
 * - Verificación de efectividad:    30%
 *   (proporción de recomendaciones con efectividad verificada vs total no canceladas)
 *
 * NO_DATA: sin recomendaciones registradas.
 * TARGET_MET: percentage >= 90.
 * TARGET_NOT_MET: percentage < 90.
 */
@Injectable()
export class MedicalRecommendationProvider implements ComplianceProvider {
  private static readonly COMPLIANCE_TARGET = 90;

  constructor(
    @InjectModel(MedicalRecommendation.name)
    private readonly recommendationModel: Model<MedicalRecommendationDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);

    const recommendations = await this.recommendationModel
      .find({ companyId: companyObjectId })
      .exec();

    // ── NO_DATA ──
    if (recommendations.length === 0) {
      return {
        module: 'medical-recommendation',
        percentage: 0,
        status: 'NO_DATA',
        findings: [
          {
            id: 'recommendation-no-data',
            module: 'medical-recommendation',
            title: 'Sin datos de seguimiento a recomendaciones médicas',
            description:
              'No hay recomendaciones médicas ocupacionales registradas para evaluar el seguimiento. Registrar recomendaciones para evaluar el cumplimiento de 3.1.3.',
            priority: FindingPriority.HIGH,
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
        pending: 0,
        completed: 0,
        overdue: 0,
        phases: { do: 0 } as Partial<Record<CompliancePhaseKey, number>>,
      };
    }

    const now = new Date();

    // ══════════════════════════════════════════════════════════
    // CRITERIO 1 — Seguimiento de recomendaciones (40%)
    //
    // Evalúa la proporción de recomendaciones completadas
    // respecto al total de recomendaciones no canceladas.
    //
    // Las recomendaciones CANCELLED se excluyen del cálculo
    // porque no representan incumplimiento.
    // ══════════════════════════════════════════════════════════

    const activeRecommendations = recommendations.filter(
      (r) => r.status !== RecommendationStatus.CANCELLED,
    );
    const totalActive = activeRecommendations.length;

    let followUpScore: number;
    if (totalActive === 0) {
      // Solo recomendaciones canceladas → no hay nada que evaluar
      followUpScore = 1;
    } else {
      const completedCount = activeRecommendations.filter(
        (r) => r.status === RecommendationStatus.COMPLETED,
      ).length;
      followUpScore = completedCount / totalActive;
    }

    // ══════════════════════════════════════════════════════════
    // CRITERIO 2 — Acciones ejecutadas (30%)
    //
    // Evalúa la proporción de acciones completadas respecto
    // al total de acciones registradas.
    //
    // Si NO hay acciones registradas, el criterio se considera
    // cumplido (no hay evidencia de incumplimiento).
    // ══════════════════════════════════════════════════════════

    const allActions = recommendations.flatMap((r) => r.actions ?? []);
    const totalActions = allActions.length;

    let actionsScore: number;
    if (totalActions === 0) {
      actionsScore = 1;
    } else {
      const completedActions = allActions.filter(
        (a) => a.status === 'COMPLETED',
      ).length;
      actionsScore = completedActions / totalActions;
    }

    // ══════════════════════════════════════════════════════════
    // CRITERIO 3 — Verificación de efectividad (30%)
    //
    // Evalúa la proporción de recomendaciones con efectividad
    // verificada respecto al total de recomendaciones no canceladas.
    //
    // Completar una recomendación NO equivale a demostrar
    // efectividad. La verificación es un paso adicional.
    //
    // Si NO hay recomendaciones activas, el criterio se
    // considera cumplido.
    // ══════════════════════════════════════════════════════════

    let effectivenessScore: number;
    if (totalActive === 0) {
      effectivenessScore = 1;
    } else {
      const verifiedCount = activeRecommendations.filter(
        (r) => r.effectivenessVerified,
      ).length;
      effectivenessScore = verifiedCount / totalActive;
    }

    // ══════════════════════════════════════════════════════════
    // CÁLCULO FINAL (40/30/30)
    // Sin redondeos intermedios.
    // ══════════════════════════════════════════════════════════

    const percentage = Math.round(
      followUpScore * 40 +
      actionsScore * 30 +
      effectivenessScore * 30,
    );

    // ── Status ──
    const status =
      percentage >= MedicalRecommendationProvider.COMPLIANCE_TARGET
        ? 'TARGET_MET'
        : 'TARGET_NOT_MET';

    // ── Findings ──
    const findings: ProviderComplianceResult['findings'] = [];

    // Finding: recomendaciones vencidas
    const overdueRecommendations = recommendations.filter(
      (r) =>
        r.status !== RecommendationStatus.COMPLETED &&
        r.status !== RecommendationStatus.CANCELLED &&
        r.dueDate &&
        new Date(r.dueDate).getTime() < now.getTime(),
    ).length;

    if (overdueRecommendations > 0) {
      findings.push({
        id: 'recommendation-overdue',
        module: 'medical-recommendation',
        title: `${overdueRecommendations} recomendación(es) vencida(s)`,
        description:
          `${overdueRecommendations} recomendaciones tienen fecha límite vencida y aún no han sido completadas. Priorizar el seguimiento de estas recomendaciones para mejorar la trazabilidad del estándar 3.1.3.`,
        priority: FindingPriority.HIGH,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Finding: recomendaciones pendientes/en progreso que requieren seguimiento
    const pendingInProgress = recommendations.filter(
      (r) =>
        r.status === RecommendationStatus.PENDING ||
        r.status === RecommendationStatus.IN_PROGRESS,
    ).length;

    if (pendingInProgress > 0) {
      findings.push({
        id: 'recommendation-pending-follow-up',
        module: 'medical-recommendation',
        title: `${pendingInProgress} recomendación(es) pendiente(s) de seguimiento`,
        description:
          `${pendingInProgress} recomendaciones están en estado PENDING o IN_PROGRESS y requieren seguimiento continuo para asegurar su correcta gestión.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Finding: acciones pendientes
    const pendingActions = allActions.filter(
      (a) => a.status === 'PENDING' || a.status === 'IN_PROGRESS',
    ).length;

    if (pendingActions > 0) {
      findings.push({
        id: 'recommendation-actions-pending',
        module: 'medical-recommendation',
        title: `${pendingActions} acción(es) derivada(s) pendiente(s)`,
        description:
          `${pendingActions} acciones derivadas de recomendaciones médicas aún no han sido completadas. Gestionar y asignar responsables para avanzar en su ejecución.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Finding: efectividad pendiente
    const effectivenessPending = activeRecommendations.filter(
      (r) => !r.effectivenessVerified,
    ).length;

    if (effectivenessPending > 0) {
      findings.push({
        id: 'recommendation-effectiveness-pending',
        module: 'medical-recommendation',
        title: `${effectivenessPending} recomendación(es) sin verificación de efectividad`,
        description:
          `${effectivenessPending} recomendaciones activas no tienen verificación de efectividad. Completar una acción no equivale a demostrar efectividad; verificar administrativamente el resultado del seguimiento.`,
        priority: FindingPriority.LOW,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // ── Pending / Completed ──
    const completedRecommendations = recommendations.filter(
      (r) => r.status === RecommendationStatus.COMPLETED,
    ).length;
    const pending = recommendations.length - completedRecommendations;

    return {
      module: 'medical-recommendation',
      percentage,
      status,
      findings,
      pending,
      completed: completedRecommendations,
      overdue: overdueRecommendations,
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }
}
