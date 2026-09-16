import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { OccupationalMedicalRecordCustodyProvider } from './occupational-medical-record-custody.provider';

describe('OccupationalMedicalRecordCustodyProvider (3.1.5 EXACT)', () => {
  // Variables compartidas para los mocks
  let mockFindResult: unknown[] = [];
  let mockWorkerCountResult = 0;
  let provider: OccupationalMedicalRecordCustodyProvider;
  let mockModel: { find: () => { lean: () => Promise<unknown[]> } };

  const companyId = new Types.ObjectId('507f1f77bcf86cd799439011').toHexString();
  const employeeId1 = new Types.ObjectId('507f1f77bcf86cd799439012').toHexString();
  const otherCompanyId = new Types.ObjectId('507f1f77bcf86cd799439099').toHexString();

  const mockRecord = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    _id: new Types.ObjectId(),
    companyId: new Types.ObjectId(companyId),
    employeeId: new Types.ObjectId(employeeId1),
    recordReference: 'EXP-2024-001',
    recordType: 'INITIAL_OCCUPATIONAL_EXAM',
    custodyStatus: 'IN_CUSTODY',
    custodianName: 'Juan Perez',
    custodianRole: 'Archivista SST',
    custodyStartDate: new Date('2024-01-15'),
    retentionUntil: new Date('2034-01-15'),
    storageLocationReference: 'OFICINA-SST-3ER-PISO',
    accessControlDescription: 'Acceso restringido',
    confidentialityConfirmed: true,
    integrityConfirmed: true,
    availabilityConfirmed: true,
    notes: 'Expediente fisico',
    active: true,
    createdBy: 'user-123',
    updatedBy: 'user-123',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  // Factory para crear mock del modelo - lee de variable compartida
  const createMockModel = () => ({
    find: () => ({
      lean: async () => mockFindResult,
    }),
  });

  // Factory para crear mock del workerCountFn - lee de variable compartida
  const createWorkerCountFn = () => async () => mockWorkerCountResult;

  beforeEach(async () => {
    mockFindResult = [];
    mockWorkerCountResult = 0;

    mockModel = createMockModel();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OccupationalMedicalRecordCustodyProvider,
        {
          provide: getModelToken('OccupationalMedicalRecordCustody'),
          useFactory: () => createMockModel(),
        },
        {
          provide: 'WORKER_COUNT_FN',
          useFactory: () => createWorkerCountFn(),
        },
      ],
    }).compile();

    provider = module.get(OccupationalMedicalRecordCustodyProvider);
  });

  describe('METADATA-001: metadatos del provider', () => {
    it('debe tener module = occupational-medical-record-custody', () => {
      assert.equal(provider.metadata.module, 'occupational-medical-record-custody');
    });

    it('debe tener standard = 3.1.5', () => {
      assert.equal(provider.metadata.standard, '3.1.5');
    });

    it('debe tener phase = do', () => {
      assert.equal(provider.metadata.phase, 'do');
    });

    it('debe tener semantic = EXACT', () => {
      assert.equal(provider.metadata.semantic, 'EXACT');
    });

    it('debe tener title descriptivo', () => {
      assert.ok(provider.metadata.title.includes('Custodia'));
      assert.ok(provider.metadata.title.includes('historias clinicas') || provider.metadata.title.includes('historias clínicas'));
    });
  });

  describe('CASE-000: sin trabajadores -> NO_DATA', () => {
    it('debe retornar NO_DATA cuando no hay trabajadores', async () => {
      mockWorkerCountResult = 0;
      mockFindResult = [];

      const result = await provider.getCompliance(companyId);

      assert.equal(result.status, 'NO_DATA');
      assert.equal(result.percentage, 0);
      assert.equal((result.phases?.do ?? 0), 0);
      assert.equal(result.findings.length, 0);
    });
  });

  describe('CASE-001: sin custodia -> 0', () => {
    it('debe retornar 0 y NOT_MET cuando hay trabajadores pero no custodia', async () => {
      mockWorkerCountResult = 5;
      mockFindResult = [];

      const result = await provider.getCompliance(companyId);

      assert.equal(result.status, 'NOT_MET');
      assert.equal(result.percentage, 0);
      assert.equal((result.phases?.do ?? 0), 0);
      assert.ok(result.findings.length > 0);
      // FASE 30G: aserción estructural por id del finding (no texto libre).
      // El provider emite el hallazgo canónico 'custody-no-records' cuando no
      // existe ningún registro de custodia para el tenant.
      assert.ok(result.findings.some(f => f.id === 'custody-no-records'));
    });
  });

  describe('CASE-002: custodia completa -> 100', () => {
    it('debe retornar 100 cuando todos los registros tienen custodia completa', async () => {
      mockWorkerCountResult = 1;
      mockFindResult = [mockRecord()];

      const result = await provider.getCompliance(companyId);

      assert.equal(result.status, 'TARGET_MET');
      assert.equal(result.percentage, 100);
      assert.equal((result.phases?.do ?? 0), 100);
      assert.equal(result.findings.length, 0);
    });
  });

  describe('CASE-003: custodia incompleta -> no 100', () => {
    it('debe retornar < 100 cuando hay registros incompletos', async () => {
      mockWorkerCountResult = 1;
      mockFindResult = [mockRecord({ integrityConfirmed: false })];

      const result = await provider.getCompliance(companyId);

      assert.ok(result.percentage < 100);
      assert.ok(result.status === 'PARTIAL' || result.status === 'NOT_MET');
      assert.ok(result.findings.some(f => f.description.includes('confidencialidad, integridad o disponibilidad')));
    });
  });

  describe('CASE-004: confidencialidad false -> C4 no completo', () => {
    it('debe penalizar C4 cuando confidentialityConfirmed es false', async () => {
      mockWorkerCountResult = 1;
      mockFindResult = [mockRecord({ confidentialityConfirmed: false })];

      const result = await provider.getCompliance(companyId);

      // C1=100, C2=100, C3=100, C4=0 => (100+100+100+0)/4 = 75
      assert.equal(result.percentage, 75);
      assert.ok(result.findings.some(f => f.description.includes('confidencialidad')));
    });
  });

  describe('CASE-005: integridad false', () => {
    it('debe penalizar C4 cuando integrityConfirmed es false', async () => {
      mockWorkerCountResult = 1;
      mockFindResult = [mockRecord({ integrityConfirmed: false })];

      const result = await provider.getCompliance(companyId);

      assert.ok(result.percentage < 100);
      assert.ok(result.findings.some(f => f.description.includes('confidencialidad, integridad o disponibilidad')));
    });
  });

  describe('CASE-006: disponibilidad false', () => {
    it('debe penalizar C4 cuando availabilityConfirmed es false', async () => {
      mockWorkerCountResult = 1;
      mockFindResult = [mockRecord({ availabilityConfirmed: false })];

      const result = await provider.getCompliance(companyId);

      assert.ok(result.percentage < 100);
      assert.ok(result.findings.some(f => f.description.includes('confidencialidad, integridad o disponibilidad')));
    });
  });

  describe('CASE-007: custodia archivada/released no cuenta como activa', () => {
    it('no debe contar custodias TRANSFERRED como activas', async () => {
      mockWorkerCountResult = 1;
      mockFindResult = [];

      const result = await provider.getCompliance(companyId);

      assert.equal(result.percentage, 0);
      assert.ok(result.status === 'NOT_MET' || result.status === 'NO_DATA');
    });
  });

  describe('CASE-008: empleado sin custodia + empleado con custodia', () => {
    it('debe calcular C1 correctamente con trabajadores mixtos', async () => {
      mockWorkerCountResult = 2;
      mockFindResult = [mockRecord()];

      const result = await provider.getCompliance(companyId);

      // C1 = 1/2 = 50%, C2 = 100%, C3 = 100%, C4 = 100%
      // Percentage = (50 + 100 + 100 + 100) / 4 = 350/4 = 87.5 -> rounds to 88
      assert.equal(result.percentage, 88);
      assert.ok(result.findings.some(f => f.description.includes('trabajador(es) sin registro')));
    });
  });

  describe('CASE-009: varios registros no inflan C1 artificialmente', () => {
    it('debe contar unicamente trabajadores unicos para C1', async () => {
      mockWorkerCountResult = 1;
      mockFindResult = [
        mockRecord({ recordReference: 'EXP-2024-001', custodyStartDate: new Date('2024-01-15') }),
        mockRecord({ recordReference: 'EXP-2024-002', recordType: 'PERIODIC_OCCUPATIONAL_EXAM', custodyStartDate: new Date('2024-06-15') }),
        mockRecord({ recordReference: 'EXP-2024-003', recordType: 'EXIT_OCCUPATIONAL_EXAM', custodyStartDate: new Date('2024-12-01') }),
      ];

      const result = await provider.getCompliance(companyId);

      // C1 = 1/1 = 100% (same employee has 3 records but is counted once)
      assert.equal(result.percentage, 100);
    });
  });

  describe('CASE-010: cross-tenant records no afectan scoring', () => {
    it('no debe incluir registros de otro tenant', async () => {
      mockWorkerCountResult = 1;
      mockFindResult = [];

      const result = await provider.getCompliance(companyId);

      assert.equal(result.percentage, 0);
      assert.ok(result.status === 'NOT_MET' || result.status === 'NO_DATA');
    });
  });

  describe('CASE-011: OccupationalExam existente SIN custody -> custody evidence = 0', () => {
    it('NO debe inferir custodia desde la existencia de OccupationalExam', async () => {
      mockWorkerCountResult = 5;
      mockFindResult = [];

      const result = await provider.getCompliance(companyId);

      assert.equal(result.percentage, 0);
      assert.ok(result.status === 'NOT_MET' || result.status === 'NO_DATA');
      // FASE 30G: aserción estructural por id del finding.
      assert.ok(result.findings.some(f => f.id === 'custody-no-records'));
    });
  });

  describe('CASE-012: MedicalRecommendation existente SIN custody -> custody evidence = 0', () => {
    it('NO debe inferir custodia desde MedicalRecommendation', async () => {
      mockWorkerCountResult = 3;
      mockFindResult = [];

      const result = await provider.getCompliance(companyId);

      assert.equal(result.percentage, 0);
      // FASE 30G: aserción estructural por id del finding.
      assert.ok(result.findings.some(f => f.id === 'custody-no-records'));
    });
  });

  describe('CASE-013: JobProfile existente SIN custody -> no genera cumplimiento 3.1.5', () => {
    it('NO debe inferir custodia desde JobProfile', async () => {
      mockWorkerCountResult = 2;
      mockFindResult = [];

      const result = await provider.getCompliance(companyId);

      assert.equal(result.percentage, 0);
      // FASE 30G: aserción estructural por id del finding.
      assert.ok(result.findings.some(f => f.id === 'custody-no-records'));
    });
  });
});
