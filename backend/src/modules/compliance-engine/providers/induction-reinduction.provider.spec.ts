import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { InductionReinductionProvider } from './induction-reinduction.provider';
import { InductionStatus } from '../../risks/schemas/sst-induction.schema';

const VALID_COMPANY_ID = '507f1f77bcf86cd799439011';

function createMockInduction(overrides: Record<string, any> = {}) {
  return {
    _id: new Types.ObjectId(),
    companyId: new Types.ObjectId(VALID_COMPANY_ID),
    type: 'INDUCTION',
    employee: new Types.ObjectId(),
    date: new Date(),
    responsible: 'Admin SST',
    topics: 'Riesgos generales y específicos',
    status: InductionStatus.COMPLETED,
    observations: '',
    ...overrides,
  };
}

function createMockEmployee(overrides: Record<string, any> = {}) {
  return {
    _id: new Types.ObjectId(),
    companyId: new Types.ObjectId(VALID_COMPANY_ID),
    isActive: true,
    ...overrides,
  };
}

function createProvider(inductions: any[], employees: any[] = []) {
  return new InductionReinductionProvider(
    { find: (_c: any) => ({ exec: () => Promise.resolve(inductions) }) } as any,
    { find: (_c: any) => ({ exec: () => Promise.resolve(employees) }) } as any,
  );
}

describe('InductionReinductionProvider (1.2.2)', () => {
  it('returns 0% NO_DATA when no inductions exist', async () => {
    const provider = createProvider([]);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.percentage, 0);
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.phases?.plan, 0);
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].id, 'induction-no-data');
    assert.equal(result.findings[0].priority, 'HIGH');
  });

  it('returns 100% when all inductions complete with full coverage and content', async () => {
    const employees = [createMockEmployee(), createMockEmployee()];
    const inductions = employees.map((e) =>
      createMockInduction({ employee: e._id, status: InductionStatus.COMPLETED, topics: 'Contenido completo' }),
    );
    const provider = createProvider(inductions, employees);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(result.percentage, 100);
    assert.equal(result.status, 'TARGET_MET');
    assert.equal(result.phases?.plan, 100);
  });

  it('returns partial score when inductions are incomplete', async () => {
    const employees = [createMockEmployee(), createMockEmployee()];
    const inductions = [
      createMockInduction({ employee: employees[0]._id, status: InductionStatus.COMPLETED, topics: 'Riesgos' }),
      createMockInduction({ employee: employees[1]._id, status: InductionStatus.PENDING, topics: '' }),
    ];
    const provider = createProvider(inductions, employees);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    assert.ok(result.percentage > 0 && result.percentage < 100);
    assert.equal(result.status, 'TARGET_NOT_MET');
    assert.ok(result.findings.length > 0);
  });

  it('flags missing worker coverage', async () => {
    const employees = [createMockEmployee(), createMockEmployee(), createMockEmployee()];
    const inductions = [
      createMockInduction({ employee: employees[0]._id, status: InductionStatus.COMPLETED, topics: 'Contenido' }),
    ];
    const provider = createProvider(inductions, employees);
    const result = await provider.getCompliance(VALID_COMPANY_ID);
    const coverageFinding = result.findings.find((f) => f.id === 'induction-incomplete-coverage');
    assert.ok(coverageFinding, 'should flag incomplete coverage');
    assert.equal(coverageFinding!.priority, 'HIGH');
  });

  it('isolation: only queries data for the given companyId', async () => {
    let queriedCompanyId: any = null;
    const fakeInductionModel = {
      find: (query: any) => { queriedCompanyId = query.companyId; return { exec: () => Promise.resolve([]) }; },
    };
    const fakeEmployeeModel = {
      find: (_q: any) => ({ exec: () => Promise.resolve([]) }),
    };
    const provider = new InductionReinductionProvider(fakeInductionModel as any, fakeEmployeeModel as any);
    await provider.getCompliance(VALID_COMPANY_ID);
    assert.equal(queriedCompanyId.toString(), VALID_COMPANY_ID);
  });
});
