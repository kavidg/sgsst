import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { EmergencyManagementProvider } from './emergency-management.provider';
import { SstEmergenciesDocument } from '../../phva-advanced/schemas/phva-advanced-emergencies.schema';

/**
 * Tests del EmergencyManagementProvider — Estándar 4.4.1
 * Gestión de emergencias.
 */

const VALID_COMPANY_ID = '507f1f77bcf86cd799439011';

function createMockEmergencies(overrides: Partial<{
  plan: any;
  brigades: any[];
  equipment: any[];
  drills: any[];
  evacuationRoutes: any[];
}> = {}): Partial<SstEmergenciesDocument> {
  return {
    _id: new Types.ObjectId(),
    companyId: new Types.ObjectId(VALID_COMPANY_ID),
    plan: {
      planName: 'Plan de Emergencias',
      version: '1.0',
      effectiveDate: new Date('2026-01-01'),
      expirationDate: new Date('2027-01-01'),
      approvedBy: 'Gerente',
    },
    brigades: [{ brigadeId: '1', name: 'Brigada A', type: 'Evacuación', leader: 'Líder', members: ['A', 'B'] }],
    equipment: [{ equipmentId: '1', name: 'Extintor', type: 'Prevención', status: 'OPERATIVO' }],
    drills: [{ drillId: '1', name: 'Simulacro A', type: 'Evacuación', date: new Date(), status: 'Ejecutado' }],
    evacuationRoutes: [{ routeId: '1', name: 'Ruta A', floor: '1', active: true }],
    ...overrides,
  } as Partial<SstEmergenciesDocument>;
}

function buildModel(records: any[]) {
  return {
    find: (_query: any) => ({
      exec: () => Promise.resolve(records),
    }),
  };
}

function createProvider(records: any[]) {
  return new EmergencyManagementProvider(buildModel(records) as any);
}

describe('EmergencyManagementProvider (4.4.1)', () => {
  describe('NO_DATA', () => {
    it('returns 0% when no emergency records exist', async () => {
      const provider = createProvider([]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.equal(result.percentage, 0);
      assert.equal(result.status, 'NO_DATA');
      assert.equal(result.findings.length, 1);
      assert.equal(result.findings[0].id, 'emergency-management-no-data');
      assert.equal(result.phases?.do, 0);
    });
  });

  describe('Tenant Isolation', () => {
    it('returns NO_DATA when model has no records', async () => {
      const provider = createProvider([]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.equal(result.percentage, 0);
      assert.equal(result.status, 'NO_DATA');
    });

    it('returns data when model has records', async () => {
      const provider = createProvider([createMockEmergencies()]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.percentage >= 0);
      assert.notEqual(result.status, 'NO_DATA');
    });
  });

  describe('Compliance Calculation', () => {
    it('100% when everything is complete', async () => {
      const provider = createProvider([createMockEmergencies()]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.equal(result.percentage, 100);
      assert.equal(result.status, 'TARGET_MET');
    });

    it('no plan generates HIGH finding', async () => {
      const records = [createMockEmergencies({ plan: {} as any })];
      const provider = createProvider(records);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.findings.some(f => f.id === 'emergency-management-no-plan'));
    });

    it('expired plan generates HIGH finding', async () => {
      const records = [createMockEmergencies({
        plan: {
          planName: 'Plan',
          expirationDate: new Date('2020-01-01'),
        } as any,
      })];
      const provider = createProvider(records);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.findings.some(f => f.id === 'emergency-management-expired'));
    });

    it('no brigades generates HIGH finding', async () => {
      const records = [createMockEmergencies({ brigades: [] })];
      const provider = createProvider(records);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.findings.some(f => f.id === 'emergency-management-no-brigades'));
    });

    it('no drills generates MEDIUM finding', async () => {
      const records = [createMockEmergencies({ drills: [] })];
      const provider = createProvider(records);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.findings.some(f => f.id === 'emergency-management-no-drills'));
    });

    it('pending drills generates MEDIUM finding', async () => {
      const records = [createMockEmergencies({
        drills: [
          { drillId: '1', name: 'Sim A', type: 'Evac', date: new Date(), status: 'Ejecutado' },
          { drillId: '2', name: 'Sim B', type: 'Evac', date: new Date(), status: 'Programado' },
        ],
      })];
      const provider = createProvider(records);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.findings.some(f => f.id === 'emergency-management-pending-drills'));
    });

    it('phase = do (HACER)', async () => {
      const provider = createProvider([createMockEmergencies()]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.phases?.do !== undefined);
      assert.equal(result.phases?.check, undefined);
      assert.equal(result.phases?.plan, undefined);
    });
  });
});
