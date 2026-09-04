import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  RiskMethodology,
  RiskMethodologyDocument,
  RiskMethodologyStatus,
} from '../../risks/schemas/risk-methodology.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { classifyComplianceLevel } from '../utils/compliance-score';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Evaluación automática del estándar 4.1.1
 * "Metodología para la identificación de peligros,
 *  evaluación y valoración de los riesgos".
 *
 * Evalúa la existencia y calidad de la metodología formal
 * utilizada por la organización para identificar peligros.
 *
 * CRÍTICO: Este provider evalúa EXCLUSIVAMENTE RiskMethodology.
 * NO evalúa Risk (cantidad, nivel, controles).
 * NO evalúa accidentalidad, ausentismo, ni otros dominios.
 *
 * Fuentes de datos:
 * - RiskMethodology.status
 * - RiskMethodology.effectiveFrom
 * - RiskMethodology.reviewDate
 * - RiskMethodology.identificationCriteria
 * - RiskMethodology.evaluationCriteria
 * - RiskMethodology.valuationCriteria
 *
 * Criterios y pesos (PROPUESTOS — NO NORMATIVOS):
 * - Existencia de metodología:         30%
 * - Estado ACTIVE:                     25%
 * - Campos críticos completos:         25%
 * - Vigencia/revisión:                 20%
 *
 * NO_DATA: sin metodologías registradas.
 * TARGET_MET: methodology ACTIVE completa y vigente.
 * TARGET_NOT_MET: methodology DRAFT, ARCHIVED, incompleta o ausente.
 */
@Injectable()
export class RiskMethodologyProvider implements ComplianceProvider {
  private static readonly MODULE = 'risk-methodology';
  private static readonly COMPLIANCE_TARGET = 90;

  constructor(
    @InjectModel(RiskMethodology.name)
    private readonly methodologyModel: Model<RiskMethodologyDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);

    const methodologies = await this.methodologyModel
      .find({ companyId: companyObjectId })
      .sort({ createdAt: -1 })
      .exec();

    // ── NO_DATA ──
    if (methodologies.length === 0) {
      return {
        module: RiskMethodologyProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: [
          {
            id: 'methodology-no-data',
            module: RiskMethodologyProvider.MODULE,
            title: 'Sin metodologías de identificación de peligros',
            description:
              'No existen metodologías de identificación de peligros, evaluación y valoración de riesgos registradas. El estándar 4.1.1 requiere una metodología documentada y aplicada.',
            priority: FindingPriority.HIGH,
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
        pending: 0,
        completed: 0,
        phases: { plan: 0 } as Partial<Record<CompliancePhaseKey, number>>,
      };
    }

    const totalMethodologies = methodologies.length;
    const now = new Date();

    // ══════════════════════════════════════════════════════════
    // CRITERIO 1 — Existencia de metodología (30%)
    //
    // Si existe al menos una metodología → 30 puntos.
    // El volumen no es el criterio; la existencia documentada sí.
    // ══════════════════════════════════════════════════════════
    const existenceScore = 1;

    // ══════════════════════════════════════════════════════════
    // CRITERIO 2 — Estado ACTIVE (25%)
    //
    // Evalúa si existe al menos una metodología ACTIVE.
    // Si hay múltiples ACTIVE, se permite (regla del Bloque 3).
    // ══════════════════════════════════════════════════════════
    const activeMethodologies = methodologies.filter(
      (m) => m.status === RiskMethodologyStatus.ACTIVE,
    );
    const activeScore = activeMethodologies.length > 0 ? 1 : 0;

    // ══════════════════════════════════════════════════════════
    // CRITERIO 3 — Campos críticos completos (25%)
    //
    // Evalúa la completitud de la metodología ACTIVE (o la más
    // reciente si no hay ACTIVE).
    //
    // Campos críticos:
    // - name
    // - version
    // - identificationCriteria
    // - evaluationCriteria
    // - valuationCriteria
    // ══════════════════════════════════════════════════════════
    const targetMethodology = activeMethodologies[0] ?? methodologies[0];

    const criticalFields = [
      'name',
      'version',
      'identificationCriteria',
      'evaluationCriteria',
      'valuationCriteria',
    ];

    let filledFields = 0;
    for (const field of criticalFields) {
      const value = (targetMethodology as any)[field];
      if (value && typeof value === 'string' && value.trim().length > 0) {
        filledFields++;
      }
    }
    const completenessScore = filledFields / criticalFields.length;

    // ══════════════════════════════════════════════════════════
    // CRITERIO 4 — Vigencia/revisión (20%)
    //
    // Evalúa si la metodología está vigente:
    // - effectiveFrom no es en el futuro
    // - reviewDate no está vencida (si se proporciona)
    //
    // Si no hay fechas definidas → score parcial (0.5)
    // Si effectiveFrom es futuro → score bajo (0.25)
    // Si reviewDate vencida → score bajo (0.25)
    // Si ambas ok → score completo (1)
    // ══════════════════════════════════════════════════════════
    let validityScore = 0.5; // Default: fechas no definidas

    if (targetMethodology.effectiveFrom) {
      const effectiveDate = new Date(targetMethodology.effectiveFrom);
      if (effectiveDate.getTime() > now.getTime()) {
        validityScore = 0.25; // Metodología no vigente aún
      } else {
        validityScore = 1; // Effective from is in the past → vigente
      }
    }

    if (targetMethodology.reviewDate) {
      const reviewDate = new Date(targetMethodology.reviewDate);
      if (reviewDate.getTime() < now.getTime()) {
        validityScore = Math.min(validityScore, 0.25); // Revisión vencida
      }
    }

    // ══════════════════════════════════════════════════════════
    // CÁLCULO FINAL (30/25/25/20)
    //
    // PROPUESTO — NO NORMATIVO.
    // Los pesos son una propuesta funcional del proyecto,
    // NO pesos normativos explícitos de la Resolución 0312.
    // ══════════════════════════════════════════════════════════
    const percentage = Math.round(
      existenceScore * 30 +
      activeScore * 25 +
      completenessScore * 25 +
      validityScore * 20,
    );

    // ── Status ──
    const status =
      percentage >= RiskMethodologyProvider.COMPLIANCE_TARGET
        ? 'TARGET_MET'
        : 'TARGET_NOT_MET';

    // ── Findings ──
    const findings: ProviderComplianceResult['findings'] = [];

    // Finding: no hay metodología ACTIVE
    if (activeMethodologies.length === 0) {
      findings.push({
        id: 'methodology-no-active',
        module: RiskMethodologyProvider.MODULE,
        title: 'Sin metodología en estado ACTIVE',
        description:
          'No existe ninguna metodología de identificación de peligros en estado ACTIVE. Activar al menos una metodología para cumplir el estándar 4.1.1.',
        priority: FindingPriority.HIGH,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Finding: campos críticos incompletos
    if (completenessScore < 1) {
      const missingFields = criticalFields.filter((field) => {
        const value = (targetMethodology as any)[field];
        return !value || typeof value !== 'string' || value.trim().length === 0;
      });

      findings.push({
        id: 'methodology-incomplete',
        module: RiskMethodologyProvider.MODULE,
        title: `Metodología con campos incompletos (${missingFields.length} faltantes)`,
        description:
          `La metodología "${targetMethodology.name ?? 'Sin nombre'}" no tiene completos los campos críticos: ${missingFields.join(', ')}. Completar estos campos para mejorar el cumplimiento del estándar 4.1.1.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Finding: revisión vencida
    if (targetMethodology.reviewDate) {
      const reviewDate = new Date(targetMethodology.reviewDate);
      if (reviewDate.getTime() < now.getTime()) {
        findings.push({
          id: 'methodology-review-overdue',
          module: RiskMethodologyProvider.MODULE,
          title: 'Revisión de metodología vencida',
          description:
            `La metodología "${targetMethodology.name ?? 'Sin nombre'}" tiene una fecha de revisión vencida (${reviewDate.toLocaleDateString('es-CO')}). Actualizar la metodología o programar la revisión.`,
          priority: FindingPriority.MEDIUM,
          status: 'OPEN',
          responsible: '',
          dueDate: '',
          createdAt: new Date().toISOString(),
        });
      }
    }

    return {
      module: RiskMethodologyProvider.MODULE,
      percentage,
      status,
      findings,
      pending: activeMethodologies.length === 0 ? 1 : 0,
      completed: activeMethodologies.length > 0 ? 1 : 0,
      phases: { plan: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }
}
