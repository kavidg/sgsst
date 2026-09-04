import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CaseInterventionProvider } from './case-intervention.provider';

/**
 * Tests del CaseInterventionProvider — Estándar 3.3.3
 * Intervención y seguimiento de casos.
 *
 * Valida:
 * - NO_DATA
 * - Intervención
 * - Acciones completadas
 * - Acciones vencidas
 * - Cierre
 * - Seguimiento
 * - Métricas
 * - Tenant isolation
 * - Privacidad
 * - PHVA
 * - Escenarios mixtos
 */

const VALID_COMPANY_ID = '507f1f77bcf86cd799439011';

function createMockIncidentModel(data: any[]) {
  return {
    find: () => ({
      sort: () => ({
        exec: async () => data,
      }),
    }),
  } as any;
}

describe('CaseInterventionProvider', () => {
  describe('NO_DATA', () => {
    it('returns NO_DATA when no cases exist', async () => {
      const provider = new CaseInterventionProvider(createMockIncidentModel([]));
      const result = await provider.getCompliance(VALID_COMPANY_ID);

      assert.equal(result.status, 'NO_DATA');
      assert.equal(result.percentage, 0);
      assert.equal(result.findings.length, 1);
      assert.equal(result.findings[0].id, 'case-intervention-no-data');
    });

    it('phases.do is 0 for NO_DATA', async () => {
      const provider = new CaseInterventionProvider(createMockIncidentModel([]));
      const result = await provider.getCompliance(VALID_COMPANY_ID);

      assert.deepEqual(result.phases, { do: 0 });
    });
  });

  describe('Intervention', () => {
    it('counts cases with corrective actions as intervened', async () => {
      const cases = [
        {
          correctiveActions: [{ action: 'Fix', status: 'COMPLETED' }],
          preventiveActions: [],
          closureDate: new Date(),
        },
      ];
      const provider = new CaseInterventionProvider(createMockIncidentModel(cases));
      const result = await provider.getCompliance(VALID_COMPANY_ID);

      assert.notEqual(result.status, 'NO_DATA');
      const finding = result.findings.find(f => f.id === 'case-intervention-no-intervention');
      assert.equal(finding, undefined);
    });

    it('counts cases with preventive actions as intervened', async () => {
      const cases = [
        {
          correctiveActions: [],
          preventiveActions: [{ action: 'Prevent', status: 'PENDING' }],
          closureDate: null,
        },
      ];
      const provider = new CaseInterventionProvider(createMockIncidentModel(cases));
      const result = await provider.getCompliance(VALID_COMPANY_ID);

      assert.notEqual(result.status, 'NO_DATA');
      const finding = result.findings.find(f => f.id === 'case-intervention-no-intervention');
      assert.equal(finding, undefined);
    });

    it('generates no-intervention finding for cases without actions', async () => {
      const cases = [
        {
          correctiveActions: [],
          preventiveActions: [],
          closureDate: null,
        },
      ];
      const provider = new CaseInterventionProvider(createMockIncidentModel(cases));
      const result = await provider.getCompliance(VALID_COMPANY_ID);

      const finding = result.findings.find(f => f.id === 'case-intervention-no-intervention');
      assert.ok(finding);
    });
  });

  describe('Actions Completion', () => {
    it('calculates correct completion metrics', async () => {
      const cases = [
        {
          correctiveActions: [
            { action: 'A1', status: 'COMPLETED', completedDate: new Date() },
            { action: 'A2', status: 'PENDING', dueDate: new Date('2099-12-31') },
          ],
          preventiveActions: [],
          closureDate: new Date(),
        },
      ];
      const provider = new CaseInterventionProvider(createMockIncidentModel(cases));
      const result = await provider.getCompliance(VALID_COMPANY_ID);

      assert.equal(result.completed, 1);
      assert.equal(result.pending, 1);
    });

    it('handles zero actions gracefully', async () => {
      const cases = [
        {
          correctiveActions: [],
          preventiveActions: [],
          closureDate: null,
        },
      ];
      const provider = new CaseInterventionProvider(createMockIncidentModel(cases));
      const result = await provider.getCompliance(VALID_COMPANY_ID);

      assert.equal(result.completed, 0);
      assert.equal(result.pending, 0);
    });
  });

  describe('Overdue Actions', () => {
    it('detects overdue actions', async () => {
      const pastDate = new Date('2020-01-01');
      const cases = [
        {
          correctiveActions: [
            { action: 'Overdue', status: 'PENDING', dueDate: pastDate },
          ],
          preventiveActions: [],
          closureDate: null,
        },
      ];
      const provider = new CaseInterventionProvider(createMockIncidentModel(cases));
      const result = await provider.getCompliance(VALID_COMPANY_ID);

      assert.equal(result.overdue, 1);
      const finding = result.findings.find(f => f.id === 'case-intervention-overdue-actions');
      assert.ok(finding);
    });

    it('does not count completed actions as overdue', async () => {
      const pastDate = new Date('2020-01-01');
      const cases = [
        {
          correctiveActions: [
            { action: 'Done', status: 'COMPLETED', dueDate: pastDate, completedDate: new Date() },
          ],
          preventiveActions: [],
          closureDate: new Date(),
        },
      ];
      const provider = new CaseInterventionProvider(createMockIncidentModel(cases));
      const result = await provider.getCompliance(VALID_COMPANY_ID);

      assert.equal(result.overdue, 0);
      const finding = result.findings.find(f => f.id === 'case-intervention-overdue-actions');
      assert.equal(finding, undefined);
    });
  });

  describe('Closure', () => {
    it('detects cases without closure', async () => {
      const cases = [
        {
          correctiveActions: [{ action: 'A1', status: 'COMPLETED', completedDate: new Date() }],
          preventiveActions: [],
          closureDate: null,
        },
      ];
      const provider = new CaseInterventionProvider(createMockIncidentModel(cases));
      const result = await provider.getCompliance(VALID_COMPANY_ID);

      const finding = result.findings.find(f => f.id === 'case-intervention-no-closure');
      assert.ok(finding);
    });

    it('does not generate closure finding when all cases are closed', async () => {
      const cases = [
        {
          correctiveActions: [{ action: 'A1', status: 'COMPLETED', completedDate: new Date() }],
          preventiveActions: [],
          closureDate: new Date(),
        },
      ];
      const provider = new CaseInterventionProvider(createMockIncidentModel(cases));
      const result = await provider.getCompliance(VALID_COMPANY_ID);

      const finding = result.findings.find(f => f.id === 'case-intervention-no-closure');
      assert.equal(finding, undefined);
    });
  });

  describe('Follow-up', () => {
    it('detects cases without follow-up', async () => {
      const cases = [
        {
          correctiveActions: [{ action: 'A1', status: 'PENDING', dueDate: new Date('2099-12-31') }],
          preventiveActions: [],
          closureDate: null,
        },
      ];
      const provider = new CaseInterventionProvider(createMockIncidentModel(cases));
      const result = await provider.getCompliance(VALID_COMPANY_ID);

      const finding = result.findings.find(f => f.id === 'case-intervention-no-follow-up');
      assert.ok(finding);
    });

    it('does not generate follow-up finding when actions are completed with date', async () => {
      const cases = [
        {
          correctiveActions: [{ action: 'A1', status: 'COMPLETED', completedDate: new Date() }],
          preventiveActions: [],
          closureDate: new Date(),
        },
      ];
      const provider = new CaseInterventionProvider(createMockIncidentModel(cases));
      const result = await provider.getCompliance(VALID_COMPANY_ID);

      const finding = result.findings.find(f => f.id === 'case-intervention-no-follow-up');
      assert.equal(finding, undefined);
    });
  });

  describe('Tenant Isolation', () => {
    it('filters by companyId', async () => {
      let calledWith: any = null;
      const model = {
        find: (query: any) => {
          calledWith = query;
          return {
            sort: () => ({
              exec: async () => [],
            }),
          };
        },
      } as any;
      const provider = new CaseInterventionProvider(model);

      await provider.getCompliance(VALID_COMPANY_ID);

      assert.ok(calledWith);
      assert.ok(calledWith.companyId);
    });
  });

  describe('Privacy', () => {
    it('does not expose employeeId in results', async () => {
      const cases = [
        {
          correctiveActions: [],
          preventiveActions: [],
          closureDate: null,
        },
      ];
      const provider = new CaseInterventionProvider(createMockIncidentModel(cases));
      const result = await provider.getCompliance(VALID_COMPANY_ID);

      const resultString = JSON.stringify(result);
      assert.equal(resultString.includes('employeeId'), false);
      assert.equal(resultString.includes('userId'), false);
    });
  });

  describe('PHVA', () => {
    it('contributes to hacer phase', async () => {
      const cases = [
        {
          correctiveActions: [{ action: 'A1', status: 'COMPLETED', completedDate: new Date() }],
          preventiveActions: [],
          closureDate: new Date(),
        },
      ];
      const provider = new CaseInterventionProvider(createMockIncidentModel(cases));
      const result = await provider.getCompliance(VALID_COMPANY_ID);

      assert.ok(result.phases);
      assert.ok('do' in result.phases);
      assert.equal(typeof result.phases.do, 'number');
    });
  });

  describe('Comprehensive Scenario', () => {
    it('calculates correct percentage with mixed data', async () => {
      const pastDate = new Date('2020-01-01');
      const futureDate = new Date('2099-12-31');
      const cases = [
        {
          correctiveActions: [
            { action: 'A1', status: 'COMPLETED', completedDate: new Date() },
            { action: 'A2', status: 'PENDING', dueDate: futureDate },
          ],
          preventiveActions: [
            { action: 'P1', status: 'COMPLETED', completedDate: new Date() },
          ],
          closureDate: new Date(),
        },
        {
          correctiveActions: [
            { action: 'A3', status: 'PENDING', dueDate: pastDate },
          ],
          preventiveActions: [],
          closureDate: null,
        },
      ];
      const provider = new CaseInterventionProvider(createMockIncidentModel(cases));
      const result = await provider.getCompliance(VALID_COMPANY_ID);

      assert.ok(result.percentage > 0);
      assert.ok(result.percentage <= 100);
      assert.notEqual(result.status, 'NO_DATA');
      assert.equal(result.completed, 2);
      assert.equal(result.overdue, 1);
    });
  });

  describe('Protection against division by zero', () => {
    it('returns valid percentage when no actions exist', async () => {
      const cases = [
        {
          correctiveActions: [],
          preventiveActions: [],
          closureDate: null,
        },
      ];
      const provider = new CaseInterventionProvider(createMockIncidentModel(cases));
      const result = await provider.getCompliance(VALID_COMPANY_ID);

      assert.ok(Number.isFinite(result.percentage));
      assert.ok(result.percentage >= 0);
      assert.ok(result.percentage <= 100);
    });
  });
});
