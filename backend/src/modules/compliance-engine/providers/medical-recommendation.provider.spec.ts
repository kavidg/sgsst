import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { MedicalRecommendationProvider } from './medical-recommendation.provider';
import {
  RecommendationType,
  RecommendationStatus,
  ActionStatus,
} from '../../medical-recommendation/schemas/medical-recommendation.schema';
import { Types } from 'mongoose';

/**
 * Tests del MedicalRecommendationProvider (3.1.3).
 */
describe('MedicalRecommendationProvider', () => {
  const companyId = new Types.ObjectId();
  const companyIdString = companyId.toString();

  function createMockModel(docs: any[] = []) {
    return {
      find: mock.fn(() => ({
        exec: mock.fn(() => Promise.resolve(docs)),
      })),
    } as any;
  }

  // ==================== METADATA ====================

  it('METADATA-001: module es medical-recommendation', async () => {
    const model = createMockModel([]);
    const provider = new MedicalRecommendationProvider(model);
    const result = await provider.getCompliance(companyIdString);
    assert.equal(result.module, 'medical-recommendation');
  });

  it('METADATA-002: supports 3.1.3 via module name', async () => {
    const model = createMockModel([]);
    const provider = new MedicalRecommendationProvider(model);
    const result = await provider.getCompliance(companyIdString);
    assert.equal(result.module, 'medical-recommendation');
  });

  // ==================== NO_DATA ====================

  it('NO_DATA-001: retorna NO_DATA cuando no hay recomendaciones', async () => {
    const model = createMockModel([]);
    const provider = new MedicalRecommendationProvider(model);
    const result = await provider.getCompliance(companyIdString);

    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.percentage, 0);
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].id, 'recommendation-no-data');
  });

  it('NO_DATA-002: NO_DATA incluye finding de prioridad HIGH', async () => {
    const model = createMockModel([]);
    const provider = new MedicalRecommendationProvider(model);
    const result = await provider.getCompliance(companyIdString);

    assert.equal(result.findings[0].priority, 'HIGH');
  });

  // ==================== ALTO CUMPLIMIENTO ====================

  it('HIGH-001: 100% cuando todas las recomendaciones están completadas, acciones completadas y efectividad verificada', async () => {
    const model = createMockModel([
      {
        status: RecommendationStatus.COMPLETED,
        effectivenessVerified: true,
        dueDate: new Date('2030-01-01'),
        actions: [
          { status: ActionStatus.COMPLETED },
          { status: ActionStatus.COMPLETED },
        ],
      },
      {
        status: RecommendationStatus.COMPLETED,
        effectivenessVerified: true,
        dueDate: new Date('2030-01-01'),
        actions: [
          { status: ActionStatus.COMPLETED },
        ],
      },
    ]);
    const provider = new MedicalRecommendationProvider(model);
    const result = await provider.getCompliance(companyIdString);

    assert.equal(result.percentage, 100);
    assert.equal(result.status, 'TARGET_MET');
  });

  // ==================== VENCIDOS REDUCEN CUMPLIMIENTO ====================

  it('OVERDUE-001: reduce cumplimiento cuando hay recomendaciones vencidas', async () => {
    const pastDate = new Date('2020-01-01');
    const model = createMockModel([
      {
        status: RecommendationStatus.PENDING,
        effectivenessVerified: false,
        dueDate: pastDate,
        actions: [],
      },
      {
        status: RecommendationStatus.COMPLETED,
        effectivenessVerified: true,
        dueDate: new Date('2030-01-01'),
        actions: [{ status: ActionStatus.COMPLETED }],
      },
    ]);
    const provider = new MedicalRecommendationProvider(model);
    const result = await provider.getCompliance(companyIdString);

    // La recomendación vencida reduce el score
    assert.ok(result.percentage < 100);
    // Debe haber finding de vencidas
    const overdueFinding = result.findings.find((f) => f.id === 'recommendation-overdue');
    assert.ok(overdueFinding);
  });

  // ==================== ACCIONES PENDIENTES REDUCEN CUMPLIMIENTO ====================

  it('ACTIONS-001: reduce cumplimiento cuando hay acciones pendientes', async () => {
    const model = createMockModel([
      {
        status: RecommendationStatus.IN_PROGRESS,
        effectivenessVerified: false,
        dueDate: new Date('2030-01-01'),
        actions: [
          { status: ActionStatus.PENDING },
          { status: ActionStatus.PENDING },
        ],
      },
    ]);
    const provider = new MedicalRecommendationProvider(model);
    const result = await provider.getCompliance(companyIdString);

    assert.ok(result.percentage < 100);
    const actionsFinding = result.findings.find((f) => f.id === 'recommendation-actions-pending');
    assert.ok(actionsFinding);
  });

  // ==================== EFECTIVIDAD PENDIENTE REDUCE CUMPLIMIENTO ====================

  it('EFFECTIVENESS-001: reduce cumplimiento cuando la efectividad está pendiente', async () => {
    const model = createMockModel([
      {
        status: RecommendationStatus.COMPLETED,
        effectivenessVerified: false,
        dueDate: new Date('2030-01-01'),
        actions: [{ status: ActionStatus.COMPLETED }],
      },
    ]);
    const provider = new MedicalRecommendationProvider(model);
    const result = await provider.getCompliance(companyIdString);

    // Completada pero sin efectividad verificada → no es 100%
    assert.ok(result.percentage < 100);
    const effectivenessFinding = result.findings.find(
      (f) => f.id === 'recommendation-effectiveness-pending',
    );
    assert.ok(effectivenessFinding);
  });

  // ==================== CANCELLED SE EXCLUYE ====================

  it('CANCELLED-001: recomendaciones canceladas no afectan cumplimiento', async () => {
    const model = createMockModel([
      {
        status: RecommendationStatus.CANCELLED,
        effectivenessVerified: false,
        dueDate: new Date('2020-01-01'),
        actions: [],
      },
    ]);
    const provider = new MedicalRecommendationProvider(model);
    const result = await provider.getCompliance(companyIdString);

    // Solo canceladas →.score = 100 (no hay nada que evaluar)
    assert.equal(result.percentage, 100);
  });

  // ==================== DISTRIBUCIÓN POR TIPOS ====================

  it('DISTRIBUTION-001: distribución por tipos no rompe la evaluación', async () => {
    const model = createMockModel([
      {
        status: RecommendationStatus.COMPLETED,
        effectivenessVerified: true,
        dueDate: new Date('2030-01-01'),
        recommendationType: RecommendationType.WORKPLACE_ADJUSTMENT,
        actions: [{ status: ActionStatus.COMPLETED }],
      },
      {
        status: RecommendationStatus.COMPLETED,
        effectivenessVerified: true,
        dueDate: new Date('2030-01-01'),
        recommendationType: RecommendationType.FOLLOW_UP,
        actions: [{ status: ActionStatus.COMPLETED }],
      },
      {
        status: RecommendationStatus.IN_PROGRESS,
        effectivenessVerified: false,
        dueDate: new Date('2030-06-01'),
        recommendationType: RecommendationType.REFERRAL,
        actions: [{ status: ActionStatus.IN_PROGRESS }],
      },
    ]);
    const provider = new MedicalRecommendationProvider(model);
    const result = await provider.getCompliance(companyIdString);

    assert.ok(result.percentage > 0);
    assert.ok(result.percentage <= 100);
  });

  // ==================== PRIVACIDAD ====================

  it('PRIVACY-001: findings no contienen employeeId', async () => {
    const model = createMockModel([
      {
        status: RecommendationStatus.PENDING,
        effectivenessVerified: false,
        dueDate: new Date('2020-01-01'),
        actions: [],
      },
    ]);
    const provider = new MedicalRecommendationProvider(model);
    const result = await provider.getCompliance(companyIdString);

    for (const finding of result.findings) {
      assert.ok(!finding.title.includes('employeeId'));
      assert.ok(!finding.description.includes('employeeId'));
    }
  });

  it('PRIVACY-002: findings no contienen nombres ni documentos', async () => {
    const model = createMockModel([
      {
        status: RecommendationStatus.PENDING,
        effectivenessVerified: false,
        dueDate: new Date('2020-01-01'),
        actions: [],
      },
    ]);
    const provider = new MedicalRecommendationProvider(model);
    const result = await provider.getCompliance(companyIdString);

    for (const finding of result.findings) {
      assert.ok(!finding.title.includes('nombre'));
      assert.ok(!finding.title.includes('documento'));
      assert.ok(!finding.description.includes('nombre'));
      assert.ok(!finding.description.includes('documento'));
    }
  });

  // ==================== TENANT ISOLATION ====================

  it('TENANT-001: solo consulta recomendaciones de la empresa especificada', async () => {
    const model = createMockModel([]);
    const provider = new MedicalRecommendationProvider(model);
    await provider.getCompliance(companyIdString);

    // Verificar que find fue llamado con el companyId correcto
    assert.equal(model.find.mock.callCount(), 1);
    const callArg = model.find.mock.calls[0].arguments[0];
    assert.equal(String(callArg.companyId), companyIdString);
  });

  // ==================== PENDING / COMPLETED ====================

  it('COUNTS-001: pending y completed se calculan correctamente', async () => {
    const model = createMockModel([
      { status: RecommendationStatus.COMPLETED, effectivenessVerified: true, dueDate: new Date('2030-01-01'), actions: [] },
      { status: RecommendationStatus.COMPLETED, effectivenessVerified: true, dueDate: new Date('2030-01-01'), actions: [] },
      { status: RecommendationStatus.PENDING, effectivenessVerified: false, dueDate: new Date('2030-01-01'), actions: [] },
      { status: RecommendationStatus.IN_PROGRESS, effectivenessVerified: false, dueDate: new Date('2030-01-01'), actions: [] },
    ]);
    const provider = new MedicalRecommendationProvider(model);
    const result = await provider.getCompliance(companyIdString);

    assert.equal(result.completed, 2);
    assert.equal(result.pending, 2);
  });

  // ==================== PHASES ====================

  it('PHASES-001: phases.do contiene el porcentaje calculado', async () => {
    const model = createMockModel([
      {
        status: RecommendationStatus.COMPLETED,
        effectivenessVerified: true,
        dueDate: new Date('2030-01-01'),
        actions: [{ status: ActionStatus.COMPLETED }],
      },
    ]);
    const provider = new MedicalRecommendationProvider(model);
    const result = await provider.getCompliance(companyIdString);

    assert.ok((result.phases as Record<string, unknown>)?.do !== undefined, 'Should have phases.do');
    assert.equal((result.phases as Record<string, unknown>)?.do, result.percentage);
  });
});
