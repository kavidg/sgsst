import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { PhvaAdvancedService } from '../../phva-advanced/phva-advanced.service';
import {
  PhvaAdvancedResponsibilitiesDocument,
  ResponsibilityAssignmentEntry,
} from '../../phva-advanced/schemas/phva-advanced-responsibilities.schema';
import {
  AutoEvaluationResult,
  RuleOutcome,
} from '../interfaces/auto-evaluation-result';
import { StandardRule, StandardRuleContext } from '../interfaces/standard-rule';
import { buildRuleResult } from '../utils/rule-result.factory';

// ============================================================
// Regla 1.1.2 — Responsabilidades en SG-SST (FASE 1)
// ============================================================
//
// Replica la semántica REAL del módulo Responsibilities
// (PhvaAdvancedService.updateResponsibilities + getResponsibilitiesApprovalStatus)
// sin modificarlo:
//
// - Compliance COMPLIES del módulo exige: al menos una responsabilidad activa,
//   ninguna activa sin usuario asignado, ninguna firma pendiente y cobertura
//   de responsabilidades activas para MANAGER, ADMIN y MEMBER.
// - Requisitos de aceptación y aprobación reales del módulo: las filas activas
//   con requiresSignature deben tener firma (accepted + signedAt) y el ciclo
//   de aprobación del __META__ debe estar APPROVED o APPROVED_AND_SIGNED
//   (DRAFT/PENDING_APPROVAL/REJECTED mantienen el estándar sin veredicto
//   completo).
//
// Semántica de traducción (sin equivalencias genéricas):
// - Una lista con datos NO implica cumplimiento: filas sin asignar, sin firma
//   o sin cobertura producen PENDIENTE_ANALISIS o NO_CUMPLE según corresponda.
// - Módulo sin gestión avanzada iniciada (sin registro) → PENDIENTE_ANALISIS.
// - Incumplimiento demostrable: cobertura de rol vacía (ningún cargo con
//   responsabilidades activas) cuando el módulo ya fue diligenciado.

export const RESPONSIBILITIES_STANDARD_CODE = '1.1.2';

const MODULE_SOURCE = 'phva-advanced/responsibilities';

/** Roles con cobertura exigida por la regla vigente del módulo. */
const REQUIRED_ROLE_COVERAGE: readonly string[] = ['MANAGER', 'ADMIN', 'MEMBER'];

interface ResponsibilitiesMeta {
  approvalStatus?: string;
}

function readMetaApprovalStatus(
  record: PhvaAdvancedResponsibilitiesDocument,
): string {
  const metaRow = (record.responsibilities ?? []).find(
    (entry: ResponsibilityAssignmentEntry) => entry.title === '__META__',
  );
  if (!metaRow) return 'DRAFT';
  try {
    const meta = JSON.parse(metaRow.category) as ResponsibilitiesMeta;
    return meta.approvalStatus ?? 'DRAFT';
  } catch {
    return 'DRAFT';
  }
}

@Injectable()
export class ResponsibilitiesRule implements StandardRule {
  constructor(private readonly phvaAdvancedService: PhvaAdvancedService) {}

  supports(code: string): boolean {
    return code === RESPONSIBILITIES_STANDARD_CODE;
  }

  getModule(): string {
    return MODULE_SOURCE;
  }

  async evaluate(context: StandardRuleContext): Promise<AutoEvaluationResult> {
    let record: PhvaAdvancedResponsibilitiesDocument;
    try {
      record = await this.phvaAdvancedService.findResponsibilitiesByCompany(
        new Types.ObjectId(context.companyId),
      );
    } catch {
      return buildRuleResult({
        code: RESPONSIBILITIES_STANDARD_CODE,
        outcomes: [
          {
            requirement: 'Gestión avanzada de Responsabilidades iniciada',
            satisfied: false,
            missingInformation:
              'La gestión avanzada de Responsabilidades en SG-SST (1.1.2) aún no ha sido iniciada. Registra la matriz de responsabilidades para poder evaluar el estándar.',
          },
        ],
      });
    }

    const entries = (record.responsibilities ?? []).filter(
      (entry: ResponsibilityAssignmentEntry) => entry.title !== '__META__',
    );
    const active = entries.filter((entry) => entry.active);
    const unassigned = active.filter((entry) => !entry.employeeId);
    // Condición EXACTA de pendingSignatures del módulo (updateResponsibilities):
    // requiresSignature && !signature?.signedAt (la aceptación se evidencia
    // por la fecha de firma; no se inventa un requisito adicional).
    const pendingSignatures = active.filter(
      (entry) => entry.requiresSignature && !entry.signature?.signedAt,
    );
    const missingCoverage = REQUIRED_ROLE_COVERAGE.filter(
      (role) => !active.some((entry) => entry.role === role),
    );

    const outcomes: RuleOutcome[] = [];

    // ── Requisito: al menos una responsabilidad activa registrada ───────────
    if (active.length > 0) {
      outcomes.push({
        requirement: 'Responsabilidades activas registradas',
        satisfied: true,
        evidence: `${active.length} responsabilidad(es) activa(s) en la matriz.`,
      });
    } else if (entries.length > 0) {
      // Hay filas pero ninguna activa: el módulo fue diligenciado y quedó sin
      // cobertura → incumplimiento demostrable (equivalente al alerta
      // 'Cargo sin responsabilidades activas.' del módulo).
      outcomes.push({
        requirement: 'Responsabilidades activas registradas',
        satisfied: false,
        finding: {
          title: 'Sin responsabilidades activas',
          description:
            'La matriz de responsabilidades no tiene ninguna responsabilidad activa: ningún cargo cuenta con responsabilidades vigentes.',
          source: MODULE_SOURCE,
        },
      });
    } else {
      outcomes.push({
        requirement: 'Responsabilidades activas registradas',
        satisfied: false,
        missingInformation:
          'No hay responsabilidades registradas en la gestión avanzada de 1.1.2. Registra la matriz de responsabilidades por cargo.',
      });
    }

    // ── Requisito: sin responsabilidades activas sin usuario asignado ───────
    if (active.length > 0 && unassigned.length === 0) {
      outcomes.push({
        requirement: 'Cada responsabilidad activa tiene usuario asignado',
        satisfied: true,
        evidence: 'Todas las responsabilidades activas tienen usuario asignado.',
      });
    } else if (unassigned.length > 0) {
      const titles = unassigned
        .map((entry) => entry.title)
        .slice(0, 5)
        .join(', ');
      outcomes.push({
        requirement: 'Cada responsabilidad activa tiene usuario asignado',
        satisfied: false,
        missingInformation: `Hay ${unassigned.length} responsabilidad(es) activa(s) sin usuario asignado: ${titles}. Asigna el responsable de cada responsabilidad.`,
      });
    } else {
      outcomes.push({
        requirement: 'Cada responsabilidad activa tiene usuario asignado',
        satisfied: null,
        evidence: 'No evaluable: no hay responsabilidades activas en la matriz.',
      });
    }

    // ── Requisito: sin firmas pendientes (aceptación por firma) ────────────
    if (active.length > 0 && pendingSignatures.length === 0) {
      const requiringSignature = active.filter((entry) => entry.requiresSignature).length;
      outcomes.push({
        requirement: 'Firmas de aceptación registradas para las responsabilidades que lo requieren',
        satisfied: true,
        ...(requiringSignature > 0
          ? { evidence: `${requiringSignature} responsabilidad(es) con firma de aceptación registrada.` }
          : { evidence: 'Ninguna responsabilidad activa requiere firma.' }),
      });
    } else if (pendingSignatures.length > 0) {
      const titles = pendingSignatures
        .map((entry) => entry.title)
        .slice(0, 5)
        .join(', ');
      outcomes.push({
        requirement: 'Firmas de aceptación registradas para las responsabilidades que lo requieren',
        satisfied: false,
        missingInformation: `Hay ${pendingSignatures.length} responsabilidad(es) con firma de aceptación pendiente: ${titles}. Gestiona la aceptación y firma de los asignados.`,
      });
    } else {
      outcomes.push({
        requirement: 'Firmas de aceptación registradas para las responsabilidades que lo requieren',
        satisfied: null,
        evidence: 'No evaluable: no hay responsabilidades activas en la matriz.',
      });
    }

    // ── Requisito: cobertura de responsabilidades por rol ───────────────────
    if (active.length > 0 && missingCoverage.length === 0) {
      outcomes.push({
        requirement: 'Cobertura de responsabilidades activas para dirección, responsable SST y trabajadores',
        satisfied: true,
        evidence: 'Cobertura completa para MANAGER, ADMIN y MEMBER.',
      });
    } else if (missingCoverage.length > 0 && entries.length > 0 && active.length > 0) {
      outcomes.push({
        requirement: 'Cobertura de responsabilidades activas para dirección, responsable SST y trabajadores',
        satisfied: false,
        missingInformation: `No hay responsabilidades activas para el rol(es): ${missingCoverage.join(', ')}. Completa la cobertura por cargo.`,
      });
    } else if (entries.length === 0) {
      // Sin matriz registrada: la cobertura no es evaluable de forma separada.
      outcomes.push({
        requirement: 'Cobertura de responsabilidades activas para dirección, responsable SST y trabajadores',
        satisfied: false,
        missingInformation:
          'No hay responsabilidades registradas en la gestión avanzada de 1.1.2. Registra la matriz de responsabilidades por cargo.',
      });
    } else {
      outcomes.push({
        requirement: 'Cobertura de responsabilidades activas para dirección, responsable SST y trabajadores',
        satisfied: null,
        evidence: 'No evaluable: no hay responsabilidades activas en la matriz.',
      });
    }

    // ── Requisito: ciclo de aprobación del módulo completado ────────────────
    const approvalStatus = readMetaApprovalStatus(record);
    if (approvalStatus === 'APPROVED' || approvalStatus === 'APPROVED_AND_SIGNED') {
      outcomes.push({
        requirement: 'Matriz de responsabilidades aprobada por el manager',
        satisfied: true,
        evidence: `Estado de aprobación del módulo: ${approvalStatus}.`,
      });
    } else if (approvalStatus === 'REJECTED') {
      outcomes.push({
        requirement: 'Matriz de responsabilidades aprobada por el manager',
        satisfied: false,
        finding: {
          title: 'Matriz de responsabilidades rechazada',
          description:
            'El último ciclo de aprobación de la matriz de responsabilidades fue rechazado. Corrige las observaciones y reenvía a aprobación.',
          source: MODULE_SOURCE,
        },
      });
    } else if (entries.length === 0) {
      outcomes.push({
        requirement: 'Matriz de responsabilidades aprobada por el manager',
        satisfied: false,
        missingInformation:
          'No hay responsabilidades registradas en la gestión avanzada de 1.1.2. Registra la matriz de responsabilidades por cargo.',
      });
    } else if (approvalStatus === 'DRAFT' || approvalStatus === 'PENDING_APPROVAL') {
      outcomes.push({
        requirement: 'Matriz de responsabilidades aprobada por el manager',
        satisfied: false,
        missingInformation:
          approvalStatus === 'PENDING_APPROVAL'
            ? 'La matriz de responsabilidades está pendiente de aprobación por el manager. Espera la decisión del ciclo de aprobación.'
            : 'La matriz de responsabilidades no ha sido enviada a aprobación. Envía la matriz al flujo de aprobación del manager.',
      });
    } else {
      // Estado desconocido: nunca se asume aprobado (equivalencia explícita
      // del Approval Workflow: valor inesperado → no aprobado).
      outcomes.push({
        requirement: 'Matriz de responsabilidades aprobada por el manager',
        satisfied: null,
        evidence: `Estado de aprobación del módulo no reconocido (${approvalStatus}); no se asume aprobación.`,
        missingInformation:
          'El estado de aprobación de la matriz de responsabilidades no es reconocido por el motor. Revisa el ciclo de aprobación del módulo.',
      });
    }

    return buildRuleResult({ code: RESPONSIBILITIES_STANDARD_CODE, outcomes });
  }
}
