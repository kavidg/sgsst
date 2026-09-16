import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { PhvaAdvancedService } from '../../phva-advanced/phva-advanced.service';
import {
  PhvaAdvancedResourceAssignmentDocument,
} from '../../phva-advanced/schemas/phva-advanced-resource-assignment.schema';
import {
  AutoEvaluationResult,
  RuleOutcome,
} from '../interfaces/auto-evaluation-result';
import { StandardRule, StandardRuleContext } from '../interfaces/standard-rule';
import { buildRuleResult } from '../utils/rule-result.factory';

// ============================================================
// Regla 1.1.3 — Asignación de recursos (FASE 1)
// ============================================================
//
// Replica la semántica REAL de PhvaAdvancedService.updateResourceAssignment()
// sin modificarla:
//
// - COMPLIES del módulo exige los cinco requisitos simultáneos:
//     1) recursos financieros registrados,
//     2) al menos un recurso humano activo,
//     3) recursos técnicos registrados,
//     4) evidencias (evidences[] o evidencia en filas financieras/técnicas),
//     5) aprobación gerencial con firma (approval.approved && signatureImage).
// - PENDING del módulo = hay algún recurso registrado pero faltan requisitos
//   obligatorios → PENDIENTE_ANALISIS en el motor (falta información para
//   concluir cumplimiento).
// - La firma gerencial pendiente es requisito obligatorio del estándar según
//   la regla vigente (alerta 'Firma gerencial pendiente'); su ausencia impide
//   concluir cumplimiento (PENDIENTE_ANALISIS), y el rechazo del ciclo de
//   aprobación es incumplimiento demostrable.
// - Módulo sin gestión avanzada iniciada (sin registro) → PENDIENTE_ANALISIS.
// - Nada de esto equivale a "si hay datos entonces cumple".

export const RESOURCE_ASSIGNMENT_STANDARD_CODE = '1.1.3';

const MODULE_SOURCE = 'phva-advanced/resource-assignment';

@Injectable()
export class ResourceAssignmentRule implements StandardRule {
  constructor(private readonly phvaAdvancedService: PhvaAdvancedService) {}

  supports(code: string): boolean {
    return code === RESOURCE_ASSIGNMENT_STANDARD_CODE;
  }

  getModule(): string {
    return MODULE_SOURCE;
  }

  async evaluate(context: StandardRuleContext): Promise<AutoEvaluationResult> {
    let record: PhvaAdvancedResourceAssignmentDocument;
    try {
      record = await this.phvaAdvancedService.findResourceAssignmentByCompany(
        new Types.ObjectId(context.companyId),
      );
    } catch {
      return buildRuleResult({
        code: RESOURCE_ASSIGNMENT_STANDARD_CODE,
        outcomes: [
          {
            requirement: 'Gestión avanzada de Asignación de Recursos iniciada',
            satisfied: false,
            missingInformation:
              'La gestión avanzada de Asignación de Recursos SG-SST (1.1.3) aún no ha sido iniciada. Registra los recursos financieros, humanos y técnicos para poder evaluar el estándar.',
          },
        ],
      });
    }

    const financialResources = record.financialResources ?? [];
    const humanResources = record.humanResources ?? [];
    const technicalResources = record.technicalResources ?? [];
    const evidences = record.evidences ?? [];
    const approval = record.approval;

    const hasFinancial = financialResources.length > 0;
    const hasHuman = humanResources.some((entry) => entry.active);
    const hasTechnical = technicalResources.length > 0;
    const hasEvidence =
      evidences.length > 0 ||
      financialResources.some((entry) => Boolean(entry.evidence?.fileUrl)) ||
      technicalResources.some((entry) => Boolean(entry.evidence?.fileUrl));
    const hasManagerApproval = Boolean(approval?.approved && approval?.signatureImage);

    const moduleTouched =
      financialResources.length > 0 ||
      humanResources.length > 0 ||
      technicalResources.length > 0 ||
      evidences.length > 0;

    const outcomes: RuleOutcome[] = [];

    // ── Recursos financieros registrados ────────────────────────────────────
    outcomes.push(
      hasFinancial
        ? {
            requirement: 'Recursos financieros registrados',
            satisfied: true,
            evidence: `${financialResources.length} recurso(s) financiero(s) en el presupuesto SG-SST.`,
          }
        : {
            requirement: 'Recursos financieros registrados',
            satisfied: false,
            ...(moduleTouched
              ? { missingInformation: 'No hay recursos financieros registrados en el presupuesto SG-SST (1.1.3). Registra las partidas presupuestales.' }
              : {
                  missingInformation:
                    'La gestión avanzada de Asignación de Recursos SG-SST (1.1.3) no tiene información registrada. Registra los recursos financieros, humanos y técnicos.',
                }),
          },
    );

    // ── Recursos humanos activos ────────────────────────────────────────────
    outcomes.push(
      hasHuman
        ? {
            requirement: 'Recursos humanos asignados al SG-SST',
            satisfied: true,
            evidence: `${humanResources.filter((entry) => entry.active).length} recurso(s) humano(s) activo(s) asignado(s).`,
          }
        : {
            requirement: 'Recursos humanos asignados al SG-SST',
            satisfied: false,
            missingInformation:
              'No hay recursos humanos activos asignados al SG-SST. Asigna al menos una persona con rol y responsabilidades.',
          },
    );

    // ── Recursos técnicos registrados ───────────────────────────────────────
    outcomes.push(
      hasTechnical
        ? {
            requirement: 'Recursos técnicos registrados',
            satisfied: true,
            evidence: `${technicalResources.length} recurso(s) técnico(s) registrado(s).`,
          }
        : {
            requirement: 'Recursos técnicos registrados',
            satisfied: false,
            missingInformation:
              'No hay recursos técnicos registrados para el SG-SST. Registra el inventario técnico (equipos, herramientas, dotación).',
          },
    );

    // ── Evidencias de recursos ──────────────────────────────────────────────
    outcomes.push(
      hasEvidence
        ? {
            requirement: 'Evidencias de recursos cargadas',
            satisfied: true,
            evidence: 'Existen evidencias documentales de los recursos (repositorio o evidencia por fila).',
          }
        : {
            requirement: 'Evidencias de recursos cargadas',
            satisfied: false,
            missingInformation:
              'No hay evidencias cargadas para los recursos del SG-SST. Adjunta los soportes del presupuesto y del inventario.',
          },
    );

    // ── Aprobación gerencial con firma ──────────────────────────────────────
    const approvalStatus = String(record.approvalStatus ?? 'DRAFT');
    if (hasManagerApproval) {
      outcomes.push({
        requirement: 'Aprobación gerencial del presupuesto SG-SST con firma',
        satisfied: true,
        evidence: approval.signedBy
          ? `Aprobado y firmado por ${approval.signedBy}.`
          : 'Aprobación gerencial registrada con firma.',
      });
    } else if (approvalStatus === 'REJECTED') {
      outcomes.push({
        requirement: 'Aprobación gerencial del presupuesto SG-SST con firma',
        satisfied: false,
        finding: {
          title: 'Presupuesto SG-SST rechazado',
          description:
            'El último ciclo de aprobación gerencial de la asignación de recursos fue rechazado. Corrige las observaciones y reenvía a aprobación.',
          source: MODULE_SOURCE,
        },
      });
    } else {
      outcomes.push({
        requirement: 'Aprobación gerencial del presupuesto SG-SST con firma',
        satisfied: false,
        missingInformation:
          approvalStatus === 'PENDING_APPROVAL'
            ? 'La asignación de recursos está pendiente de aprobación gerencial. Espera la decisión del manager para concluir el estándar.'
            : 'Falta la aprobación gerencial con firma del presupuesto SG-SST. Envía la asignación de recursos al flujo de aprobación.',
      });
    }

    return buildRuleResult({ code: RESOURCE_ASSIGNMENT_STANDARD_CODE, outcomes });
  }
}
