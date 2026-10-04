import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { InspectionComplianceProvider } from './inspection-compliance.provider';
import { InspectionActivityDocument } from '../../inspections/schemas/inspection-activity.schema';

/**
 * Regresiones de NORMALIZACIÓN de status — Estándar 4.2.4.
 * Fórmula 25/30/25/20, fase do y tenant isolation intactos.
 */

const VALID_COMPANY_ID = '507f1f77bcf86cd799439011';

function createMockInspection(overrides: Partial<{
  status: string;
  plannedDate: Date;
  responsible: string;
}> = {}): Partial<InspectionActivityDocument> {
  return {
    _id: new Types.ObjectId(),
    companyId: new Types.ObjectId(VALID_COMPANY_ID),
    status: 'completada',
    plannedDate: new Date(),
    responsible: 'Inspector A',
    ...overrides,
  };
}

function buildModel(records: any[]) {
  return {
    find: (_query: any) => ({
      exec: () => Promise.resolve(records),
    }),
  };
}

function createProvider(records: any[]) {
  return new InspectionComplianceProvider(buildModel(records) as any);
}

describe('InspectionComplianceProvider (4.2.4) — normalización de status', () => {
  const CASES_COUNT = [
    { status: 'COMPLETED', expected: true },
    { status: 'completed', expected: true },
    { status: 'ejecutada', expected: true },
    { status: 'finalizada', expected: true },
    { status: 'completada', expected: true },
    { status: 'PENDING', expected: false },
    { status: 'pendiente', expected: false },
  ];

  for (const { status, expected } of CASES_COUNT) {
    it(`status "${status}" ${expected ? 'cuenta' : 'NO cuenta'} como completada`, async () => {
      const provider = createProvider([
        createMockInspection({ status, responsible: 'A' }),
      ]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      const counted = result.completed === 1;
      assert.equal(counted, expected);
    });
  }

  it('fórmula intacta: 1 de 2 completadas, ambas a tiempo, con responsable → 85', async () => {
    const provider = createProvider([
      createMockInspection({ status: 'completada', responsible: 'A' }),
      createMockInspection({ status: 'pendiente', responsible: 'B' }),
    ]);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    // 25 + 0.5*30 (completadas) + 1*25 (a tiempo: la pendiente aún no vence)
    //   + 1*20 (responsables) = 85
    assert.equal(result.percentage, 85);
  });

  it('fase do intacta tras la normalización', async () => {
    const provider = createProvider([createMockInspection()]);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.ok(result.phases?.do !== undefined);
    assert.equal(result.phases?.check, undefined);
  });

  it('tenant isolation intacta: sin registros → NO_DATA', async () => {
    const provider = createProvider([]);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.phases?.do, 0);
  });
});
