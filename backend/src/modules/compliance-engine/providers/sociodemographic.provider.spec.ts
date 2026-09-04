import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

/**
 * Tests para BLOQUE 3.1.1-D — SociodemographicProvider (3.1.1 · Perfil sociodemográfico).
 *
 * Valida que el provider genera resultados de cumplimiento correctos
 * para el dominio de Perfil Sociodemográfico, incluyendo tenant isolation,
 * manejo de NO_DATA, scoring 25/25/25/25, y compatibilidad con ProviderComplianceResult.
 */

// ==================== MOCK HELPERS ====================

function mockFind(result: unknown) {
  const q: any = {};
  q.sort = () => q;
  q.populate = () => q;
  q.exec = () => Promise.resolve(result);
  return q;
}

function createMockModel(employees: unknown[] = []) {
  const m: any = {};
  m.find = (_q?: any) => mockFind(employees);
  return m;
}

// ==================== CONSTANTS ====================

const COMPANY_A = '6a1efb525fff84649b532541';
const COMPANY_B = '6b2efb525fff84649b532542';

// ==================== IMPORTS ====================

import { SociodemographicProvider } from './sociodemographic.provider';

// ==================== HELPERS ====================

function buildEmployee(overrides: Record<string, unknown> = {}) {
  return {
    _id: '65a000000000000000000001',
    name: 'Test Employee',
    document: '12345',
    position: 'Analista',
    area: 'SST',
    contractType: 'Indefinido',
    status: 'Activo',
    companyId: COMPANY_A,
    birthDate: undefined,
    gender: undefined,
    maritalStatus: undefined,
    educationLevel: undefined,
    ...overrides,
  };
}

// ==================== TESTS ====================

describe('SociodemographicProvider (3.1.1 · Perfil sociodemográfico)', () => {

  describe('SOCIO-001: Sin empleados → NO_DATA', () => {
    it('returns NO_DATA when no employees exist', async () => {
      const provider = new SociodemographicProvider(createMockModel([]));

      const result = await provider.getCompliance(COMPANY_A);

      assert.equal(result.module, 'sociodemographic');
      assert.equal(result.status, 'NO_DATA');
      assert.equal(result.percentage, 0);
      assert.ok(result.findings.length > 0, 'Should have at least one finding');
      const noDataFinding = result.findings.find((f: any) => f.id === 'socio-no-data');
      assert.ok(noDataFinding, 'Should have socio-no-data finding');
      assert.equal(result.pending, 0);
      assert.equal(result.completed, 0);
    });
  });

  describe('SOCIO-002: Perfil completo → 100%', () => {
    it('returns 100% when all employees have complete profiles', async () => {
      const employees = [
        buildEmployee({ birthDate: new Date('1990-05-15'), gender: 'MASCULINO', maritalStatus: 'SOLTERO', educationLevel: 'PROFESIONAL' }),
        buildEmployee({ birthDate: new Date('1985-08-20'), gender: 'FEMENINO', maritalStatus: 'CASADO', educationLevel: 'POSGRADO' }),
      ];
      const provider = new SociodemographicProvider(createMockModel(employees));

      const result = await provider.getCompliance(COMPANY_A);

      assert.equal(result.module, 'sociodemographic');
      assert.equal(result.percentage, 100);
      assert.equal(result.status, 'TARGET_MET');
      assert.equal(result.findings.length, 0, 'Should have no findings for complete profiles');
      assert.equal(result.completed, 2);
      assert.equal(result.pending, 0);
    });
  });

  describe('SOCIO-003: Falta birthDate', () => {
    it('generates socio-missing-age finding and reduces percentage', async () => {
      const employees = [
        buildEmployee({ birthDate: new Date('1990-05-15'), gender: 'MASCULINO', maritalStatus: 'SOLTERO', educationLevel: 'PROFESIONAL' }),
        buildEmployee({ gender: 'FEMENINO', maritalStatus: 'CASADO', educationLevel: 'TECNICO' }), // sin birthDate
      ];
      const provider = new SociodemographicProvider(createMockModel(employees));

      const result = await provider.getCompliance(COMPANY_A);

      assert.ok(result.percentage < 100, 'Percentage should be less than 100');
      const finding = result.findings.find((f: any) => f.id === 'socio-missing-age');
      assert.ok(finding, 'Should have socio-missing-age finding');
      assert.ok(finding!.title.includes('1'), 'Finding should mention 1 employee');
    });
  });

  describe('SOCIO-004: Falta gender', () => {
    it('generates socio-missing-gender finding', async () => {
      const employees = [
        buildEmployee({ birthDate: new Date('1990-05-15'), maritalStatus: 'SOLTERO', educationLevel: 'PROFESIONAL' }), // sin gender
        buildEmployee({ birthDate: new Date('1985-08-20'), gender: 'FEMENINO', maritalStatus: 'CASADO', educationLevel: 'POSGRADO' }),
      ];
      const provider = new SociodemographicProvider(createMockModel(employees));

      const result = await provider.getCompliance(COMPANY_A);

      const finding = result.findings.find((f: any) => f.id === 'socio-missing-gender');
      assert.ok(finding, 'Should have socio-missing-gender finding');
    });
  });

  describe('SOCIO-005: Falta educationLevel', () => {
    it('generates socio-missing-education finding', async () => {
      const employees = [
        buildEmployee({ birthDate: new Date('1990-05-15'), gender: 'MASCULINO', maritalStatus: 'SOLTERO' }), // sin educationLevel
        buildEmployee({ birthDate: new Date('1985-08-20'), gender: 'FEMENINO', maritalStatus: 'CASADO', educationLevel: 'POSGRADO' }),
      ];
      const provider = new SociodemographicProvider(createMockModel(employees));

      const result = await provider.getCompliance(COMPANY_A);

      const finding = result.findings.find((f: any) => f.id === 'socio-missing-education');
      assert.ok(finding, 'Should have socio-missing-education finding');
    });
  });

  describe('SOCIO-006: Falta maritalStatus', () => {
    it('generates socio-missing-marital finding with LOW priority', async () => {
      const employees = [
        buildEmployee({ birthDate: new Date('1990-05-15'), gender: 'MASCULINO', educationLevel: 'PROFESIONAL' }), // sin maritalStatus
        buildEmployee({ birthDate: new Date('1985-08-20'), gender: 'FEMENINO', maritalStatus: 'CASADO', educationLevel: 'POSGRADO' }),
      ];
      const provider = new SociodemographicProvider(createMockModel(employees));

      const result = await provider.getCompliance(COMPANY_A);

      const finding = result.findings.find((f: any) => f.id === 'socio-missing-marital');
      assert.ok(finding, 'Should have socio-missing-marital finding');
      assert.equal(finding!.priority, 'LOW', 'Marital finding should be LOW priority');
    });
  });

  describe('SOCIO-007: Perfil parcial — scoring ponderado correcto', () => {
    it('calculates weighted score correctly with mixed data', async () => {
      // 4 employees:
      // Emp1: all 4 fields → contributes 25+25+25+25 = 100
      // Emp2: birthDate + gender only → contributes 25+25+0+0 = 50
      // Emp3: educationLevel only → contributes 0+0+25+0 = 25
      // Emp4: no fields → contributes 0
      // Average per criterion:
      //   birthDate: 2/4 = 50% → 50*25/100 = 12.5
      //   gender: 2/4 = 50% → 50*25/100 = 12.5
      //   education: 2/4 = 50% → 50*25/100 = 12.5
      //   marital: 1/4 = 25% → 25*25/100 = 6.25
      // Total: 12.5 + 12.5 + 12.5 + 6.25 = 43.75 → 44
      const employees = [
        buildEmployee({ birthDate: new Date('1990-05-15'), gender: 'MASCULINO', maritalStatus: 'SOLTERO', educationLevel: 'PROFESIONAL' }),
        buildEmployee({ birthDate: new Date('1985-08-20'), gender: 'FEMENINO' }),
        buildEmployee({ educationLevel: 'TECNICO' }),
        buildEmployee({}),
      ];
      const provider = new SociodemographicProvider(createMockModel(employees));

      const result = await provider.getCompliance(COMPANY_A);

      assert.equal(result.percentage, 44, 'Should calculate weighted percentage correctly');
      assert.equal(result.status, 'TARGET_NOT_MET');
      assert.ok(result.findings.length >= 2, 'Should have multiple findings');
    });
  });

  describe('SOCIO-008: Tenant isolation', () => {
    it('only counts employees from the queried company', async () => {
      const employeesCompanyA = [
        buildEmployee({ companyId: COMPANY_A, birthDate: new Date('1990-05-15'), gender: 'MASCULINO', maritalStatus: 'SOLTERO', educationLevel: 'PROFESIONAL' }),
        buildEmployee({ companyId: COMPANY_A, birthDate: new Date('1985-08-20'), gender: 'FEMENINO', maritalStatus: 'CASADO', educationLevel: 'POSGRADO' }),
      ];

      // Model always returns only company A employees (simulating backend filtering)
      const provider = new SociodemographicProvider(createMockModel(employeesCompanyA));

      const result = await provider.getCompliance(COMPANY_A);

      assert.equal(result.module, 'sociodemographic');
      assert.equal(result.completed, 2, 'Should only count company A employees');
      assert.equal(result.pending, 0);
      assert.equal(result.percentage, 100);
    });
  });

  describe('SOCIO-009: Datos agregados — no PII', () => {
    it('does not return individual employee data', async () => {
      const employees = [
        buildEmployee({ birthDate: new Date('1990-05-15'), gender: 'MASCULINO', maritalStatus: 'SOLTERO', educationLevel: 'PROFESIONAL' }),
      ];
      const provider = new SociodemographicProvider(createMockModel(employees));

      const result = await provider.getCompliance(COMPANY_A);

      // ProviderComplianceResult should not contain PII
      const resultStr = JSON.stringify(result);
      assert.ok(!resultStr.includes('Test Employee'), 'Should not contain employee name');
      assert.ok(!resultStr.includes('12345'), 'Should not contain employee document');
      assert.ok(!resultStr.includes('1990-05-15'), 'Should not contain individual birthDate');
    });
  });

  describe('SOCIO-010: Finding priorities', () => {
    it('assigns correct priority levels to findings', async () => {
      const employees = [
        buildEmployee({}), // sin todos los campos
      ];
      const provider = new SociodemographicProvider(createMockModel(employees));

      const result = await provider.getCompliance(COMPANY_A);

      const ageFinding = result.findings.find((f: any) => f.id === 'socio-missing-age');
      const genderFinding = result.findings.find((f: any) => f.id === 'socio-missing-gender');
      const educationFinding = result.findings.find((f: any) => f.id === 'socio-missing-education');
      const maritalFinding = result.findings.find((f: any) => f.id === 'socio-missing-marital');

      assert.ok(ageFinding, 'Should have age finding');
      assert.ok(genderFinding, 'Should have gender finding');
      assert.ok(educationFinding, 'Should have education finding');
      assert.ok(maritalFinding, 'Should have marital finding');

      assert.equal(ageFinding!.priority, 'MEDIUM');
      assert.equal(genderFinding!.priority, 'MEDIUM');
      assert.equal(educationFinding!.priority, 'MEDIUM');
      assert.equal(maritalFinding!.priority, 'LOW');
    });
  });

  describe('SOCIO-011: phases contribution', () => {
    it('contributes to HACER phase', async () => {
      const employees = [
        buildEmployee({ birthDate: new Date('1990-05-15'), gender: 'MASCULINO', maritalStatus: 'SOLTERO', educationLevel: 'PROFESIONAL' }),
      ];
      const provider = new SociodemographicProvider(createMockModel(employees));

      const result = await provider.getCompliance(COMPANY_A);

      assert.ok(result.phases, 'Should have phases');
      assert.equal((result.phases as any).do, 100, 'Should contribute 100 to DO phase');
    });
  });
});
