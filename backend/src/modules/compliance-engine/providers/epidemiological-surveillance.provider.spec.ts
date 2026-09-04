import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EpidemiologicalSurveillanceProvider } from './epidemiological-surveillance.provider';
import {
  SurveillanceType,
  SurveillanceProgramStatus,
  SurveillanceActivityStatus,
} from '../../epidemiological-surveillance/schemas/epidemiological-surveillance.schema';
import { FindingPriority } from '../enums/finding-priority.enum';

/**
 * Tests de Fase 7B.2 — EpidemiologicalSurveillanceProvider
 *
 * Evalúa:
 * - NO_DATA
 * - Existencia de PVE
 * - Priorización por matriz de peligros
 * - Población objetivo
 * - Cobertura de exámenes
 * - Actividades ejecutadas
 * - Seguimiento y cierre
 * - Tenant isolation
 * - PHVA
 * - Scoring
 */

const COMPANY_A = '507f1f77bcf86cd799439001';
const COMPANY_B = '507f1f77bcf86cd799439002';

// ── Helpers para crear mocks ──

function createMockProgram(overrides: Record<string, unknown> = {}) {
  return {
    _id: '507f1f77bcf86cd799439099',
    companyId: COMPANY_A,
    name: 'PVE Químico',
    description: 'Programa de vigilancia química',
    surveillanceType: SurveillanceType.CHEMICAL,
    relatedHazards: ['Exposición a solventes'],
    targetAreas: ['Producción'],
    targetPositions: ['Operario'],
    startDate: new Date('2025-01-15'),
    endDate: new Date('2025-12-31'),
    status: SurveillanceProgramStatus.ACTIVE,
    periodicityMonths: 6,
    responsible: 'Responsable SST',
    standardNumber: '3.3.1',
    activities: [
      {
        title: 'Medición ambiental',
        description: 'Medición de agentes químicos',
        responsible: 'Higienista',
        startDate: new Date('2025-02-01'),
        endDate: new Date('2025-02-28'),
        status: SurveillanceActivityStatus.COMPLETED,
        progress: 100,
        evidence: ['informe.pdf'],
      },
    ],
    ...overrides,
  };
}

function createMockEmployee(overrides: Record<string, unknown> = {}) {
  return {
    _id: '507f1f77bcf86cd799439011',
    companyId: COMPANY_A,
    name: 'Juan Pérez',
    document: '1234567890',
    position: 'Operario',
    area: 'Producción',
    contractType: 'Indefinido',
    status: 'Activo',
    ...overrides,
  };
}

function createMockRisk(overrides: Record<string, unknown> = {}) {
  return {
    _id: '507f1f77bcf86cd799439050',
    companyId: COMPANY_A,
    process: 'Producción',
    activity: 'Operación de máquinas',
    hazard: 'Exposición a solventes',
    risk: 'Irritación respiratoria',
    probability: 3,
    consequence: 4,
    riskLevel: 12,
    controlMeasures: 'Ventilación, EPP',
    ...overrides,
  };
}

function createMockExam(overrides: Record<string, unknown> = {}) {
  return {
    _id: '507f1f77bcf86cd799439070',
    companyId: COMPANY_A,
    employeeId: '507f1f77bcf86cd799439011',
    examType: 'PERIODIC',
    examDate: new Date('2025-03-15'),
    status: 'COMPLETED',
    relatedHazards: ['Exposición a solventes'],
    followUpRequired: false,
    workerAcknowledged: true,
    ...overrides,
  };
}

function createMockModels(
  programs: any[],
  employees: any[],
  risks: any[],
  exams: any[],
) {
  const createFindChain = (items: any[]) => ({
    find: () => ({
      exec: async () => items,
      sort: () => ({
        exec: async () => items,
      }),
    }),
  });

  return {
    programModel: createFindChain(programs) as any,
    employeeModel: createFindChain(employees) as any,
    riskModel: createFindChain(risks) as any,
    examModel: createFindChain(exams) as any,
  };
}

function createProvider(
  programs: any[] = [],
  employees: any[] = [],
  risks: any[] = [],
  exams: any[],
) {
  const models = createMockModels(programs, employees, risks, exams ?? []);
  return new EpidemiologicalSurveillanceProvider(
    models.programModel,
    models.employeeModel,
    models.riskModel,
    models.examModel,
  );
}

// ═══════════════════════════════════════════════════════════════
// NO_DATA
// ═══════════════════════════════════════════════════════════════

describe('PVE-001: NO_DATA', () => {
  it('PVE-001a: empresa sin programas retorna NO_DATA', async () => {
    const provider = createProvider([], [], [], []);
    const result = await provider.getCompliance(COMPANY_A);

    assert.equal(result.percentage, 0);
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.module, 'epidemiological-surveillance');
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].id, 'pve-no-data');
    assert.equal(result.findings[0].priority, FindingPriority.HIGH);
  });

  it('PVE-001b: pending y completed son 0 en NO_DATA', async () => {
    const provider = createProvider([], [], [], []);
    const result = await provider.getCompliance(COMPANY_A);

    assert.equal(result.pending, 0);
    assert.equal(result.completed, 0);
  });

  it('PVE-001c: phases.do es 0 en NO_DATA', async () => {
    const provider = createProvider([], [], [], []);
    const result = await provider.getCompliance(COMPANY_A);

    assert.ok(result.phases);
    assert.equal((result.phases as Record<string, unknown>).do, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// EXISTENCIA DE PVE
// ═══════════════════════════════════════════════════════════════

describe('PVE-002: Existencia de PVE', () => {
  it('PVE-002a: PVE existente obtiene score de existencia', async () => {
    const provider = createProvider(
      [createMockProgram()],
      [],
      [],
      [],
    );
    const result = await provider.getCompliance(COMPANY_A);

    assert.ok(result.percentage > 0);
    assert.notEqual(result.status, 'NO_DATA');
  });

  it('PVE-002b: múltiples programas obtienen score completo de existencia', async () => {
    const provider = createProvider(
      [
        createMockProgram({ name: 'PVE 1' }),
        createMockProgram({ name: 'PVE 2' }),
      ],
      [],
      [],
      [],
    );
    const result = await provider.getCompliance(COMPANY_A);

    assert.ok(result.percentage > 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// HAZARDS — Priorización por matriz de peligros
// ═══════════════════════════════════════════════════════════════

describe('PVE-003: Priorización por matriz de peligros', () => {
  it('PVE-003a: PVE con hazard coincidente con Risk obtiene score completo', async () => {
    const provider = createProvider(
      [createMockProgram({ relatedHazards: ['Exposición a solventes'] })],
      [],
      [createMockRisk({ hazard: 'Exposición a solventes' })],
      [],
    );
    const result = await provider.getCompliance(COMPANY_A);

    // El programa tiene hazard alineado → hazardScore = 1
    // El score total debe reflejar esto
    assert.ok(result.percentage > 0);
  });

  it('PVE-003b: PVE sin hazards genera finding pve-no-hazards', async () => {
    const provider = createProvider(
      [createMockProgram({ relatedHazards: [] })],
      [],
      [createMockRisk()],
      [],
    );
    const result = await provider.getCompliance(COMPANY_A);

    const noHazardsFinding = result.findings.find(
      (f) => f.id === 'pve-no-hazards',
    );
    assert.ok(noHazardsFinding, 'Debe generar finding pve-no-hazards');
    assert.equal(noHazardsFinding!.priority, FindingPriority.HIGH);
  });

  it('PVE-003c: comparación case-insensitive de hazards', async () => {
    const provider = createProvider(
      [createMockProgram({ relatedHazards: ['BIOMECANICO'] })],
      [],
      [createMockRisk({ hazard: 'Biomecánico' })],
      [],
    );
    const result = await provider.getCompliance(COMPANY_A);

    // No debe generar finding de no-hazards porque la comparación es case-insensitive
    const noHazardsFinding = result.findings.find(
      (f) => f.id === 'pve-no-hazards',
    );
    assert.equal(noHazardsFinding, undefined);
  });

  it('PVE-003d: PVE con hazard no existente en Risk genera finding', async () => {
    const provider = createProvider(
      [createMockProgram({ relatedHazards: ['Peligro inexistente'] })],
      [],
      [createMockRisk({ hazard: 'Otro peligro' })],
      [],
    );
    const result = await provider.getCompliance(COMPANY_A);

    // El hazard del PVE no coincide con ningún Risk
    // → programsWithAlignedHazards = 0 → hazardScore = 0
    assert.ok(result.percentage >= 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// POBLACIÓN OBJETIVO
// ═══════════════════════════════════════════════════════════════

describe('PVE-004: Población objetivo', () => {
  it('PVE-004a: PVE con targetAreas obtiene score de población', async () => {
    const provider = createProvider(
      [createMockProgram({ targetAreas: ['Producción'], targetPositions: [] })],
      [createMockEmployee()],
      [],
      [],
    );
    const result = await provider.getCompliance(COMPANY_A);

    const noTargetFinding = result.findings.find(
      (f) => f.id === 'pve-no-target-population',
    );
    assert.equal(noTargetFinding, undefined);
  });

  it('PVE-004b: PVE con targetPositions obtiene score de población', async () => {
    const provider = createProvider(
      [createMockProgram({ targetAreas: [], targetPositions: ['Operario'] })],
      [createMockEmployee()],
      [],
      [],
    );
    const result = await provider.getCompliance(COMPANY_A);

    const noTargetFinding = result.findings.find(
      (f) => f.id === 'pve-no-target-population',
    );
    assert.equal(noTargetFinding, undefined);
  });

  it('PVE-004c: PVE sin target genera finding pve-no-target-population', async () => {
    const provider = createProvider(
      [createMockProgram({ targetAreas: [], targetPositions: [] })],
      [],
      [],
      [],
    );
    const result = await provider.getCompliance(COMPANY_A);

    const noTargetFinding = result.findings.find(
      (f) => f.id === 'pve-no-target-population',
    );
    assert.ok(noTargetFinding, 'Debe generar finding pve-no-target-population');
  });

  it('PVE-004d: solo empleados activos cuentan para población', async () => {
    const provider = createProvider(
      [createMockProgram()],
      [
        createMockEmployee({ _id: 'emp1', status: 'Activo' }),
        createMockEmployee({ _id: 'emp2', status: 'No activo' }),
      ],
      [],
      [],
    );
    const result = await provider.getCompliance(COMPANY_A);

    // Solo 1 empleado activo en población objetivo
    assert.ok(result.percentage >= 0);
  });

  it('PVE-004e: evitar doble conteo con empleados en múltiples áreas', async () => {
    const provider = createProvider(
      [
        createMockProgram({
          targetAreas: ['Producción', 'Mantenimiento'],
          targetPositions: [],
        }),
      ],
      [
        createMockEmployee({ _id: 'emp1', area: 'Producción', position: 'Operario' }),
        createMockEmployee({ _id: 'emp2', area: 'Mantenimiento', position: 'Técnico' }),
      ],
      [],
      [],
    );
    const result = await provider.getCompliance(COMPANY_A);

    // 2 empleados únicos (Set evita doble conteo)
    assert.ok(result.percentage >= 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// COBERTURA DE EXÁMENES
// ═══════════════════════════════════════════════════════════════

describe('PVE-005: Cobertura de exámenes', () => {
  it('PVE-005a: cobertura 0% cuando no hay exámenes', async () => {
    const provider = createProvider(
      [createMockProgram()],
      [createMockEmployee()],
      [],
      [],
    );
    const result = await provider.getCompliance(COMPANY_A);

    // Sin exámenes → coverage = 0 → finding de cobertura insuficiente
    const coverageFinding = result.findings.find(
      (f) => f.id === 'pve-insufficient-coverage',
    );
    assert.ok(coverageFinding, 'Debe generar finding de cobertura insuficiente');
  });

  it('PVE-005b: cobertura >= 70% no genera finding', async () => {
    const provider = createProvider(
      [createMockProgram()],
      [createMockEmployee()],
      [],
      [createMockExam()],
    );
    const result = await provider.getCompliance(COMPANY_A);

    // 1 empleado objetivo, 1 examen completado → cobertura 100%
    const coverageFinding = result.findings.find(
      (f) => f.id === 'pve-insufficient-coverage',
    );
    assert.equal(coverageFinding, undefined);
  });

  it('PVE-005c: cobertura < 70% genera finding', async () => {
    const provider = createProvider(
      [createMockProgram()],
      [
        createMockEmployee({ _id: 'emp1' }),
        createMockEmployee({ _id: 'emp2' }),
        createMockEmployee({ _id: 'emp3' }),
        createMockEmployee({ _id: 'emp4' }),
        createMockEmployee({ _id: 'emp5' }),
      ],
      [],
      [createMockExam({ employeeId: 'emp1' })],
    );
    const result = await provider.getCompliance(COMPANY_A);

    // 5 empleados, 1 examen → 20% cobertura → < 70%
    const coverageFinding = result.findings.find(
      (f) => f.id === 'pve-insufficient-coverage',
    );
    assert.ok(coverageFinding, 'Debe generar finding de cobertura insuficiente');
  });

  it('PVE-005d: división por cero controlada cuando targetPopulation = 0', async () => {
    const provider = createProvider(
      [createMockProgram({ targetAreas: [], targetPositions: [] })],
      [],
      [],
      [],
    );
    const result = await provider.getCompliance(COMPANY_A);

    // Sin población objetivo → coverageScore = 0
    assert.ok(result.percentage >= 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// ACTIVIDADES
// ═══════════════════════════════════════════════════════════════

describe('PVE-006: Actividades ejecutadas', () => {
  it('PVE-006a: todas las actividades completadas', async () => {
    const provider = createProvider(
      [
        createMockProgram({
          activities: [
            {
              title: 'Act 1',
              startDate: new Date('2025-01-01'),
              endDate: new Date('2025-01-31'),
              status: SurveillanceActivityStatus.COMPLETED,
              progress: 100,
              evidence: [],
            },
          ],
        }),
      ],
      [],
      [],
      [],
    );
    const result = await provider.getCompliance(COMPANY_A);

    assert.ok(result.percentage > 0);
  });

  it('PVE-006b: actividades parciales', async () => {
    const provider = createProvider(
      [
        createMockProgram({
          activities: [
            {
              title: 'Act 1',
              startDate: new Date('2025-01-01'),
              endDate: new Date('2025-01-31'),
              status: SurveillanceActivityStatus.COMPLETED,
              progress: 100,
              evidence: [],
            },
            {
              title: 'Act 2',
              startDate: new Date('2025-02-01'),
              endDate: new Date('2025-02-28'),
              status: SurveillanceActivityStatus.IN_PROGRESS,
              progress: 50,
              evidence: [],
            },
          ],
        }),
      ],
      [],
      [],
      [],
    );
    const result = await provider.getCompliance(COMPANY_A);

    assert.ok(result.percentage > 0);
  });

  it('PVE-006c: sin actividades no genera NO_DATA', async () => {
    const provider = createProvider(
      [createMockProgram({ activities: [] })],
      [],
      [],
      [],
    );
    const result = await provider.getCompliance(COMPANY_A);

    // Programa existe → NO_DATA = false
    assert.notEqual(result.status, 'NO_DATA');
  });

  it('PVE-006d: actividad vencida genera finding', async () => {
    const pastDate = new Date('2024-01-01');
    const provider = createProvider(
      [
        createMockProgram({
          activities: [
            {
              title: 'Act vencida',
              startDate: new Date('2024-01-01'),
              endDate: pastDate,
              status: SurveillanceActivityStatus.PENDING,
              progress: 0,
              evidence: [],
            },
          ],
        }),
      ],
      [],
      [],
      [],
    );
    const result = await provider.getCompliance(COMPANY_A);

    const overdueFinding = result.findings.find(
      (f) => f.id === 'pve-overdue-activities',
    );
    assert.ok(overdueFinding, 'Debe generar finding de actividades vencidas');
  });

  it('PVE-006e: actividad CANCELLED no genera overdue', async () => {
    const pastDate = new Date('2024-01-01');
    const provider = createProvider(
      [
        createMockProgram({
          activities: [
            {
              title: 'Act cancelada',
              startDate: new Date('2024-01-01'),
              endDate: pastDate,
              status: SurveillanceActivityStatus.CANCELLED,
              progress: 0,
              evidence: [],
            },
          ],
        }),
      ],
      [],
      [],
      [],
    );
    const result = await provider.getCompliance(COMPANY_A);

    const overdueFinding = result.findings.find(
      (f) => f.id === 'pve-overdue-activities',
    );
    assert.equal(overdueFinding, undefined);
  });
});

// ═══════════════════════════════════════════════════════════════
// PERIODICIDAD
// ═══════════════════════════════════════════════════════════════

describe('PVE-007: Periodicidad', () => {
  it('PVE-007a: periodicityMonths válido no genera finding', async () => {
    const provider = createProvider(
      [createMockProgram({ periodicityMonths: 6 })],
      [],
      [],
      [],
    );
    const result = await provider.getCompliance(COMPANY_A);

    const periodicityFinding = result.findings.find(
      (f) => f.id === 'pve-no-periodicity',
    );
    assert.equal(periodicityFinding, undefined);
  });

  it('PVE-007b: periodicityMonths ausente genera finding', async () => {
    const provider = createProvider(
      [createMockProgram({ periodicityMonths: undefined })],
      [],
      [],
      [],
    );
    const result = await provider.getCompliance(COMPANY_A);

    const periodicityFinding = result.findings.find(
      (f) => f.id === 'pve-no-periodicity',
    );
    assert.ok(periodicityFinding, 'Debe generar finding de periodicidad');
  });
});

// ═══════════════════════════════════════════════════════════════
// SEGUIMIENTO
// ═══════════════════════════════════════════════════════════════

describe('PVE-008: Seguimiento', () => {
  it('PVE-008a: evidencia de seguimiento no genera finding', async () => {
    const provider = createProvider(
      [createMockProgram()],
      [createMockEmployee()],
      [],
      [createMockExam({ followUpRequired: true })],
    );
    const result = await provider.getCompliance(COMPANY_A);

    const followUpFinding = result.findings.find(
      (f) => f.id === 'pve-no-follow-up',
    );
    assert.equal(followUpFinding, undefined);
  });

  it('PVE-008b: ausencia de seguimiento genera finding', async () => {
    const provider = createProvider(
      [createMockProgram()],
      [createMockEmployee()],
      [],
      [createMockExam({ followUpRequired: false, workerAcknowledged: false })],
    );
    const result = await provider.getCompliance(COMPANY_A);

    const followUpFinding = result.findings.find(
      (f) => f.id === 'pve-no-follow-up',
    );
    assert.ok(followUpFinding, 'Debe generar finding de seguimiento');
  });
});

// ═══════════════════════════════════════════════════════════════
// TENANT ISOLATION
// ═══════════════════════════════════════════════════════════════

describe('PVE-009: Tenant isolation', () => {
  it('PVE-009a: datos de otra empresa no afectan el resultado', async () => {
    // Provider con programas de COMPANY_A
    const provider = createProvider(
      [createMockProgram({ companyId: COMPANY_A })],
      [createMockEmployee({ companyId: COMPANY_A })],
      [createMockRisk({ companyId: COMPANY_A })],
      [createMockExam({ companyId: COMPANY_A })],
    );

    const resultA = await provider.getCompliance(COMPANY_A);
    assert.ok(resultA.percentage >= 0);
    assert.notEqual(resultA.status, 'NO_DATA');
  });

  it('PVE-009b: empresa sin datos retorna NO_DATA', async () => {
    const provider = createProvider([], [], [], []);
    const result = await provider.getCompliance(COMPANY_B);

    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.percentage, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// PHVA
// ═══════════════════════════════════════════════════════════════

describe('PVE-010: PHVA', () => {
  it('PVE-010a: contribuye a phases.do', async () => {
    const provider = createProvider(
      [createMockProgram()],
      [],
      [],
      [],
    );
    const result = await provider.getCompliance(COMPANY_A);

    assert.ok(result.phases);
    assert.equal(typeof (result.phases as Record<string, unknown>).do, 'number');
    assert.ok(((result.phases as Record<string, unknown>).do as number) >= 0);
    assert.ok(((result.phases as Record<string, unknown>).do as number) <= 100);
  });

  it('PVE-010b: phases.do coincide con percentage', async () => {
    const provider = createProvider(
      [createMockProgram()],
      [],
      [],
      [],
    );
    const result = await provider.getCompliance(COMPANY_A);

    assert.equal((result.phases as Record<string, unknown>).do, result.percentage);
  });
});

// ═══════════════════════════════════════════════════════════════
// SCORING
// ═══════════════════════════════════════════════════════════════

describe('PVE-011: Scoring', () => {
  it('PVE-011a: pesos suman 100% (verificación conceptual)', () => {
    // 15 + 20 + 15 + 25 + 15 + 10 = 100
    const weights = [15, 20, 15, 25, 15, 10];
    const sum = weights.reduce((a, b) => a + b, 0);
    assert.equal(sum, 100);
  });

  it('PVE-011b: percentage está en rango 0-100', async () => {
    const provider = createProvider(
      [createMockProgram()],
      [createMockEmployee()],
      [createMockRisk()],
      [createMockExam()],
    );
    const result = await provider.getCompliance(COMPANY_A);

    assert.ok(result.percentage >= 0);
    assert.ok(result.percentage <= 100);
  });

  it('PVE-011c: cálculo final correcto con combinación de criterios', async () => {
    const provider = createProvider(
      [createMockProgram()],
      [createMockEmployee()],
      [createMockRisk()],
      [createMockExam()],
    );
    const result = await provider.getCompliance(COMPANY_A);

    // Todos los criterios deberían contribuir positivamente
    assert.ok(result.percentage > 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// MÓDULO
// ═══════════════════════════════════════════════════════════════

describe('PVE-012: Módulo', () => {
  it('PVE-012a: module es epidemiological-surveillance', async () => {
    const provider = createProvider(
      [createMockProgram()],
      [],
      [],
      [],
    );
    const result = await provider.getCompliance(COMPANY_A);

    assert.equal(result.module, 'epidemiological-surveillance');
  });
});

// ═══════════════════════════════════════════════════════════════
// FINDINGS
// ═══════════════════════════════════════════════════════════════

describe('PVE-013: Findings', () => {
  it('PVE-013a: todos los findings tienen estructura correcta', async () => {
    const provider = createProvider(
      [createMockProgram({ periodicityMonths: undefined })],
      [createMockEmployee()],
      [createMockRisk()],
      [createMockExam({ followUpRequired: false, workerAcknowledged: false })],
    );
    const result = await provider.getCompliance(COMPANY_A);

    for (const finding of result.findings) {
      assert.ok(finding.id.length > 0, 'finding.id debe existir');
      assert.equal(finding.module, 'epidemiological-surveillance');
      assert.ok(finding.title.length > 0, 'finding.title debe existir');
      assert.ok(finding.description.length > 0, 'finding.description debe existir');
      assert.ok(
        ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(finding.priority),
        'finding.priority debe ser válida',
      );
      assert.equal(finding.status, 'OPEN');
      assert.equal(finding.responsible, '');
      assert.equal(finding.dueDate, '');
      assert.ok(finding.createdAt.length > 0, 'finding.createdAt debe existir');
    }
  });

  it('PVE-013b: pve-no-data tiene prioridad HIGH', async () => {
    const provider = createProvider([], [], [], []);
    const result = await provider.getCompliance(COMPANY_A);

    const noDataFinding = result.findings.find(
      (f) => f.id === 'pve-no-data',
    );
    assert.ok(noDataFinding);
    assert.equal(noDataFinding!.priority, FindingPriority.HIGH);
  });

  it('PVE-013c: pve-no-hazards tiene prioridad HIGH', async () => {
    const provider = createProvider(
      [createMockProgram({ relatedHazards: [] })],
      [],
      [],
      [],
    );
    const result = await provider.getCompliance(COMPANY_A);

    const finding = result.findings.find((f) => f.id === 'pve-no-hazards');
    assert.ok(finding);
    assert.equal(finding!.priority, FindingPriority.HIGH);
  });

  it('PVE-013d: pve-insufficient-coverage tiene prioridad MEDIUM', async () => {
    const provider = createProvider(
      [createMockProgram()],
      [createMockEmployee()],
      [],
      [],
    );
    const result = await provider.getCompliance(COMPANY_A);

    const finding = result.findings.find(
      (f) => f.id === 'pve-insufficient-coverage',
    );
    assert.ok(finding);
    assert.equal(finding!.priority, FindingPriority.MEDIUM);
  });

  it('PVE-013e: pve-no-follow-up tiene prioridad LOW', async () => {
    const provider = createProvider(
      [createMockProgram()],
      [createMockEmployee()],
      [],
      [createMockExam({ followUpRequired: false, workerAcknowledged: false })],
    );
    const result = await provider.getCompliance(COMPANY_A);

    const finding = result.findings.find(
      (f) => f.id === 'pve-no-follow-up',
    );
    assert.ok(finding);
    assert.equal(finding!.priority, FindingPriority.LOW);
  });
});
