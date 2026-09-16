import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  AutoEvaluationResult,
  AutoResultStatus,
  PHVA_EVALUATION_ENGINE_VERSION,
} from './interfaces/auto-evaluation-result';
import { StandardRule } from './interfaces/standard-rule';
import { ResponsableSstRule } from './rules/responsable-sst.rule';
import { ResponsibilitiesRule } from './rules/responsibilities.rule';
import { ResourceAssignmentRule } from './rules/resource-assignment.rule';

// ============================================================
// PhvaEvaluationEngine — Orquestador (FASE 1)
// ============================================================
//
// Responsabilidades del orquestador (y límites explícitos):
// - Resuelve la regla correspondiente al código de estándar.
// - Valida el companyId como ObjectId antes de delegar.
// - Devuelve el resultado tipado de la regla.
//
// El orquestador NO:
// - Recalcula porcentajes del Compliance Engine.
// - Duplica reglas existentes (delega en los servicios reales del módulo
//   phva-advanced).
// - Persiste en la colección Evaluation.
// - Genera alertas ni planes de mejoramiento.
// - Modifica el estado manual existente del PHVA.

/** Mensaje para los estándares sin regla implementada en esta fase. */
export const STANDARDS_WITHOUT_RULE_MESSAGE =
  'Motor de evaluación no implementado para este estándar';

@Injectable()
export class PhvaEvaluationEngineService {
  private readonly rules: StandardRule[];

  constructor(
    private readonly responsableSstRule: ResponsableSstRule,
    private readonly responsibilitiesRule: ResponsibilitiesRule,
    private readonly resourceAssignmentRule: ResourceAssignmentRule,
  ) {
    this.rules = [this.responsableSstRule, this.responsibilitiesRule, this.resourceAssignmentRule];
  }

  /**
   * Evalúa un estándar individual para una empresa.
   *
   * @param companyId Empresa propietaria (debe ser un ObjectId válido).
   * @param code Código canónico del estándar (p. ej. '1.1.1').
   * @throws BadRequestException si el companyId no es un ObjectId válido.
   * @throws NotFoundException si el código de estándar no tiene formato canónico.
   */
  async evaluateStandard(companyId: string, code: string): Promise<AutoEvaluationResult> {
    this.assertValidCompanyId(companyId);
    this.assertKnownStandardCode(code);

    const rule = this.rules.find((candidate) => candidate.supports(code));
    if (!rule) {
      return this.buildNotImplementedResult(code);
    }

    return rule.evaluate({ companyId });
  }

  /**
   * Evalúa todos los estándares con regla activa. Los estándares sin regla no
   * se incluyen (el endpoint por código sí los reporta como
   * PENDIENTE_ANALISIS para consulta explícita).
   */
  async evaluateCompany(companyId: string): Promise<AutoEvaluationResult[]> {
    this.assertValidCompanyId(companyId);

    const results: AutoEvaluationResult[] = [];
    for (const rule of this.rules) {
      results.push(await rule.evaluate({ companyId }));
    }
    return results;
  }

  private assertValidCompanyId(companyId: string): void {
    if (!Types.ObjectId.isValid(companyId)) {
      throw new BadRequestException(`Invalid companyId: ${companyId}`);
    }
  }

  private assertKnownStandardCode(code: string): void {
    // Formato canónico del catálogo: capítulo.subcapítulo.estándar (p. ej. 1.1.1).
    if (!/^\d+\.\d+\.\d+$/.test(code)) {
      throw new NotFoundException(`Unknown standard code: ${code}`);
    }
  }

  private buildNotImplementedResult(code: string): AutoEvaluationResult {
    return {
      code,
      status: AutoResultStatus.PENDIENTE_ANALISIS,
      ruleTrace: [
        {
          requirement: 'Regla de evaluación automática disponible',
          satisfied: false,
          evidence: STANDARDS_WITHOUT_RULE_MESSAGE,
        },
      ],
      findings: [],
      missingInformation: [STANDARDS_WITHOUT_RULE_MESSAGE],
      evaluatedAt: new Date().toISOString(),
      engineVersion: PHVA_EVALUATION_ENGINE_VERSION,
    };
  }
}
