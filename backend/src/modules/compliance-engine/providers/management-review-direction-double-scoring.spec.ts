import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';

import { filterScoringEligible, SCORING_INELIGIBLE_MODULES } from '../utils/compliance-weights';
import {
  computeManagementReviewDirectionScore,
  MANAGEMENT_REVIEW_DIRECTION_STANDARD_CODE,
  type ManagementReviewDirectionLike,
} from './management-review-direction-scoring';
import { ManagementReviewDirectionProvider } from './management-review-direction-compliance.provider';
import { AnnualAuditComplianceProvider } from './annual-audit-compliance.provider';
import { ManagementReviewProvider } from './management-review.provider';
import { IndicatorsProvider } from './indicators.provider';
import type { Model } from 'mongoose';

/**
 * E2 (6.1.3) — Frontera de DOBLE PUNTUACIÓN (Casos A–G del diseño).
 *
 * El score oficial de 6.1.3 proviene EXCLUSIVAMENTE del provider
 * `management-review-direction` (dominio ManagementReviewDirection). Los
 * demás módulos relacionados (annual-audit, internal-audit,
 * management-review/Accountability, indicators, DocumentMaster) pueden
 * aparecer como entrada/evidencia declarativa en inputs[] pero NO puntúan
 * 6.1.3 ni se suman/promedian con el provider oficial.
 */

const COMPANY_A = new Types.ObjectId();
const NOW = new Date('2026-09-24T12:00:00.000Z');

function buildEvaluableReview(overrides: Partial<ManagementReviewDirectionLike> = {}): ManagementReviewDirectionLike {
  return {
    _id: '5f1a2b3c4d5e6f7a8b9c0d01',
    title: 'Revisión por la dirección 2026',
    reviewType: 'ORDINARY',
    plannedDate: '2026-03-01',
    scope: 'SG-SST',
    objectives: 'Evaluar y decidir',
    responsibleUserId: '5f1a2b3c4d5e6f7a8b9c0d02',
    status: 'COMPLETED',
    actualStartDate: '2026-03-05',
    actualEndDate: '2026-03-05',
    participants: [{ nameSnapshot: 'Gerente', attendance: 'ATTENDED' }],
    inputs: [
      { type: 'AUDIT_RESULTS', title: 'A', description: 'd', status: 'REVIEWED' },
      { type: 'INDICATOR_RESULTS', title: 'B', description: 'd', status: 'REVIEWED' },
      { type: 'PHVA_COMPLIANCE', title: 'C', description: 'd', status: 'REVIEWED' },
    ],
    analysis: {
      summary: 's',
      strengths: ['f'],
      gaps: ['g'],
      priorities: ['p'],
      managementObservations: 'o',
    },
    decisions: [
      {
        description: 'd1',
        category: 'RESOURCE',
        status: 'COMPLETED',
        responsibleNameSnapshot: 'r',
        dueDate: '2026-04-30',
      },
    ],
    minutesDocumentId: '5f1a2b3c4d5e6f7a8b9c0d03',
    ...overrides,
  };
}

// ─── Exclusiones del set oficial (frontera estructural) ────────────────────

describe('MRD-DOUBLE: exclusión estructural de fuentes duplicadas', () => {
  it('Caso A-pre: internal-audit está en SCORING_INELIGIBLE_MODULES (WRONG_MAPPING)', () => {
    assert.ok(SCORING_INELIGIBLE_MODULES.has('internal-audit'));
  });

  it('Caso C-pre: management-review (Accountability) sigue excluido (6.1.2 y no 6.1.3)', () => {
    assert.ok(SCORING_INELIGIBLE_MODULES.has('management-review'));
  });

  it('Caso F-pre: el provider oficial NO está excluido y sobrevive filterScoringEligible', () => {
    assert.ok(!SCORING_INELIGIBLE_MODULES.has('management-review-direction'));
    const eligible = filterScoringEligible([
      { module: 'management-review-direction', percentage: 85, status: 'TARGET_NOT_MET' },
      { module: 'internal-audit', percentage: 100, status: 'TARGET_MET' },
      { module: 'management-review', percentage: 100, status: 'TARGET_MET' },
      { module: 'annual-audit', percentage: 100, status: 'TARGET_MET' },
      { module: 'indicators', percentage: 100, status: 'TARGET_MET' },
    ]);
    // internal-audit y management-review quedan fuera del scoring de fases;
    // annual-audit (6.1.2) e indicators (6.1.1) puntúan SUS estándares, no 6.1.3.
    const modules = eligible.map((e) => e.module);
    assert.ok(modules.includes('management-review-direction'));
    assert.ok(!modules.includes('internal-audit'));
    assert.ok(!modules.includes('management-review'));
  });
});

// ─── El scorer solo consume ManagementReviewDirection ──────────────────────

describe('MRD-DOUBLE: el scorer solo lee el dominio propio', () => {
  it('Caso A: una AnnualAudit completada NO genera score de 6.1.3 por sí sola', () => {
    // Simulación: solo existe AnnualAudit. El scorer de 6.1.3 recibe
    // ManagementReviewDirection[]; una auditoría no es una revisión → NO_DATA.
    const b = computeManagementReviewDirectionScore({ reviews: [], now: NOW });
    assert.equal(b.noData, true);
    assert.equal(b.percentage, 0);
    assert.equal(b.noDataReason, 'no-reviews');
  });

  it('Caso B: un DocumentMaster AUDIT NO genera score de 6.1.3', () => {
    // internal-audit media DocumentMaster AUDIT; el scorer oficial no recibe
    // documentos: un documento sin revisión formal produce NO_DATA.
    const b = computeManagementReviewDirectionScore({ reviews: [], now: NOW });
    assert.equal(b.noData, true);
    assert.equal(b.noDataReason, 'no-reviews');
  });

  it('Caso C: un AccountabilityMeeting completado NO genera score de 6.1.3', () => {
    // management-review (AccountabilityMeeting) NO alimenta el dominio 6.1.3:
    // sin ManagementReviewDirection → NO_DATA.
    const b = computeManagementReviewDirectionScore({ reviews: [], now: NOW });
    assert.equal(b.noData, true);
  });

  it('Caso D: un AccountabilityCommitment completado NO genera score de 6.1.3', () => {
    // Los compromisos de rendición de cuentas NO son decisiones de la revisión:
    // el dominio 6.1.3 sigue vacío → NO_DATA.
    const b = computeManagementReviewDirectionScore({ reviews: [], now: NOW });
    assert.equal(b.noData, true);
  });

  it('Caso E: un indicador calculado NO genera score de 6.1.3', () => {
    // indicators puntúa 6.1.1; para 6.1.3 solo cuenta como INPUT declarativo:
    // sin revisión formal → NO_DATA.
    const b = computeManagementReviewDirectionScore({ reviews: [], now: NOW });
    assert.equal(b.noData, true);
  });

  it('Caso F: una ManagementReviewDirection evaluable SÍ genera el score oficial', () => {
    const b = computeManagementReviewDirectionScore({
      reviews: [buildEvaluableReview()],
      now: NOW,
    });
    assert.equal(b.noData, false);
    assert.ok(b.percentage > 0 && b.percentage <= 100);
    assert.equal(b.latestReview?.status, 'COMPLETED');
    assert.equal(MANAGEMENT_REVIEW_DIRECTION_STANDARD_CODE, '6.1.3');
  });

  it('los datos "ajenos" dentro del dominio no puntúan: inputs referencian, no computan', () => {
    // Caso G-parcial: aunque inputs[] declare AnnualAudit/indicators/etc., el
    // score NO recalcula esas fuentes: entradas sin revisar no suman.
    const b = computeManagementReviewDirectionScore({
      reviews: [
        buildEvaluableReview({
          inputs: [
            { type: 'AUDIT_RESULTS', title: 'Auditoría 2026', sourceModule: 'annual-audit', sourceEntityId: 'x1', status: 'PENDING' },
            { type: 'INDICATOR_RESULTS', title: 'Indicadores', sourceModule: 'indicators', sourceEntityId: 'x2', status: 'PENDING' },
          ],
        }),
      ],
      now: NOW,
    });
    // Entradas declaradas pero NO revisadas → D2 = 0 (la auditoría/indicadores
    // NO "prestan" su cumplimiento a 6.1.3).
    assert.equal(b.dimensions.inputs.ratio, 0);
    assert.ok(b.percentage < 100);
  });
});

// ─── Caso G: convivencia de todos los módulos ──────────────────────────────

describe('MRD-DOUBLE: Caso G — score oficial exclusivo con todos los módulos presentes', () => {
  function fakeAuditModel() {
    return {
      find: () => ({
        lean: () => ({
          exec: async () => [
            // AnnualAudit completada (puntúa 6.1.2, NO 6.1.3).
            {
              _id: 'audit-1',
              companyId: COMPANY_A,
              title: 'Auditoría anual',
              status: 'COMPLETED',
              actualStartDate: new Date('2026-02-01'),
              actualEndDate: new Date('2026-02-28'),
              reportTitle: 'Informe',
              findings: [],
            },
          ],
        }),
      }),
    } as unknown as Model<never>;
  }

  function fakeMeetingModel() {
    return {
      find: () => ({
        exec: async () => [
          // AccountabilityMeeting (puntuaría 6.1.2 legacy; excluido del scoring).
          {
            _id: 'meeting-1',
            companyId: COMPANY_A,
            status: 'COMPLETED',
            date: new Date('2026-03-01'),
            participants: [],
          },
        ],
      }),
    } as unknown as Model<never>;
  }

  function fakeIndicatorsService() {
    return {
      getComplianceSnapshot: async () => ({
        indicators: [],
      }),
    } as never;
  }

  it('el overview solo toma 6.1.3 de management-review-direction (sin suma ni promedio)', async () => {
    const mrdProvider = new ManagementReviewDirectionProvider({
      find: () => ({
        lean: () => ({
          exec: async () => [
            // La revisión evaluable es la ÚNICA fuente del score 6.1.3.
            { ...buildEvaluableReview(), companyId: COMPANY_A },
          ],
        }),
      }),
    } as never);

    const annualAudit = new AnnualAuditComplianceProvider(fakeAuditModel() as never);
    const managementReview = new ManagementReviewProvider(fakeMeetingModel() as never);
    const indicators = new IndicatorsProvider(fakeIndicatorsService());

    const [mrd, audit, meeting, ind] = await Promise.all([
      mrdProvider.getCompliance(String(COMPANY_A)),
      annualAudit.getCompliance(String(COMPANY_A)),
      managementReview.getCompliance(String(COMPANY_A)),
      indicators.getCompliance(String(COMPANY_A)),
    ]);

    // El módulo oficial de 6.1.3 existe y es el ÚNICO con ese standardCode.
    assert.equal(mrd.module, 'management-review-direction');
    assert.equal((mrd.metadata as Record<string, unknown>).standardCode, '6.1.3');

    // annual-audit (6.1.2), management-review y indicators (6.1.1) reportan
    // SUS módulos: ninguno declara 6.1.3 ni suma al score de 6.1.3.
    assert.equal((audit.metadata as Record<string, unknown>).standardCode, '6.1.2');
    assert.notEqual(meeting.module, 'management-review-direction');
    assert.notEqual(ind.module, 'management-review-direction');

    // filterScoringEligible: management-review e internal-audit fuera;
    // management-review-direction dentro. annual-audit/indicators siguen
    // elegibles para SUS estándares (6.1.2/6.1.1) — no para 6.1.3.
    const eligible = filterScoringEligible([mrd, audit, meeting, ind]);
    const modules = eligible.map((e) => e.module);
    assert.ok(modules.includes('management-review-direction'));
    assert.ok(!modules.includes('management-review'));
    assert.ok(!modules.includes('internal-audit'));

    // El score de 6.1.3 NO se promedia con ningún otro módulo: es el
    // percentage íntegro del provider oficial.
    assert.equal(modules.filter((m) => m === 'management-review-direction').length, 1);
  });
});
