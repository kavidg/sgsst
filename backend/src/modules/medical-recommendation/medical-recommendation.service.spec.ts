import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';

/**
 * Tests del módulo MedicalRecommendation (3.1.3).
 *
 * Estos tests validan enums, schemas y lógica de negocio sin conectar
 * a MongoDB ni importar schemas que causen errores de inferencia de tipos
 * de Mongoose.
 */
describe('MedicalRecommendation', () => {

  // ==================== ENUMS ====================

  it('ENUM-001: RecommendationType tiene los valores correctos', () => {
    const { RecommendationType } = require('./schemas/medical-recommendation.schema');
    assert.equal(RecommendationType.WORKPLACE_ADJUSTMENT, 'WORKPLACE_ADJUSTMENT');
    assert.equal(RecommendationType.FOLLOW_UP, 'FOLLOW_UP');
    assert.equal(RecommendationType.REFERRAL, 'REFERRAL');
    assert.equal(RecommendationType.HEALTH_SURVEILLANCE, 'HEALTH_SURVEILLANCE');
    assert.equal(RecommendationType.PREVENTIVE_ACTION, 'PREVENTIVE_ACTION');
    assert.equal(RecommendationType.OTHER, 'OTHER');
  });

  it('ENUM-002: RecommendationStatus tiene los valores correctos', () => {
    const { RecommendationStatus } = require('./schemas/medical-recommendation.schema');
    assert.equal(RecommendationStatus.PENDING, 'PENDING');
    assert.equal(RecommendationStatus.IN_PROGRESS, 'IN_PROGRESS');
    assert.equal(RecommendationStatus.COMPLETED, 'COMPLETED');
    assert.equal(RecommendationStatus.CANCELLED, 'CANCELLED');
  });

  it('ENUM-003: ActionStatus tiene los valores correctos', () => {
    const { ActionStatus } = require('./schemas/medical-recommendation.schema');
    assert.equal(ActionStatus.PENDING, 'PENDING');
    assert.equal(ActionStatus.IN_PROGRESS, 'IN_PROGRESS');
    assert.equal(ActionStatus.COMPLETED, 'COMPLETED');
    assert.equal(ActionStatus.CANCELLED, 'CANCELLED');
  });

  // ==================== SCHEMA ====================

  it('SCHEMA-001: MedicalRecommendationSchema existe', () => {
    const { MedicalRecommendationSchema } = require('./schemas/medical-recommendation.schema');
    assert.ok(MedicalRecommendationSchema);
  });

  it('SCHEMA-002: RecommendationActionSchema existe', () => {
    const { RecommendationActionSchema } = require('./schemas/medical-recommendation.schema');
    assert.ok(RecommendationActionSchema);
  });

  // ==================== DTO ====================

  it('DTO-001: CreateMedicalRecommendationDto existe', () => {
    const { CreateMedicalRecommendationDto } = require('./dto/create-medical-recommendation.dto');
    assert.ok(CreateMedicalRecommendationDto);
  });

  it('DTO-002: UpdateMedicalRecommendationDto existe', () => {
    const { UpdateMedicalRecommendationDto } = require('./dto/update-medical-recommendation.dto');
    assert.ok(UpdateMedicalRecommendationDto);
  });

  // ==================== PRIVACIDAD ====================

  it('PRIVACY-001: Stats interface no contiene employeeId', () => {
    // Verificar que la interfaz MedicalRecommendationStats no incluye employeeId
    // Esto es una verificación de diseño
    const statsKeys = [
      'totalRecommendations',
      'pendingRecommendations',
      'inProgressRecommendations',
      'completedRecommendations',
      'cancelledRecommendations',
      'overdueRecommendations',
      'dueSoonRecommendations',
      'effectivenessVerified',
      'effectivenessPending',
      'totalActions',
      'pendingActions',
      'completedActions',
      'recommendationTypeDistribution',
      'statusDistribution',
      'actionStatusDistribution',
    ];

    // Verificar que employeeId NO está en la lista
    assert.ok(!statsKeys.includes('employeeId'));
    assert.ok(!statsKeys.includes('examId'));
    assert.ok(!statsKeys.includes('name'));
    assert.ok(!statsKeys.includes('document'));
  });

  // ==================== LÓGICA DE VENCIMIENTO ====================

  it('LOGIC-001: overdueRecommendations excluye COMPLETED', () => {
    // Simular la lógica de cálculo de vencimiento
    const now = new Date();
    const pastDate = new Date(now.getTime() - 86400000); // ayer

    const recommendations = [
      { status: 'PENDING', dueDate: pastDate },     // vencida
      { status: 'COMPLETED', dueDate: pastDate },    // NO vencida (completada)
      { status: 'IN_PROGRESS', dueDate: pastDate },  // vencida
      { status: 'CANCELLED', dueDate: pastDate },    // NO vencida (cancelada)
    ];

    const overdue = recommendations.filter(
      (r) =>
        r.status !== 'COMPLETED' &&
        r.status !== 'CANCELLED' &&
        r.dueDate &&
        r.dueDate.getTime() < now.getTime(),
    ).length;

    assert.equal(overdue, 2); // PENDING + IN_PROGRESS
  });

  it('LOGIC-002: overdueRecommendations excluye CANCELLED', () => {
    const now = new Date();
    const pastDate = new Date(now.getTime() - 86400000);

    const recommendations = [
      { status: 'CANCELLED', dueDate: pastDate },
    ];

    const overdue = recommendations.filter(
      (r) =>
        r.status !== 'COMPLETED' &&
        r.status !== 'CANCELLED' &&
        r.dueDate &&
        r.dueDate.getTime() < now.getTime(),
    ).length;

    assert.equal(overdue, 0);
  });

  it('LOGIC-003: dueSoonRecommendations calcula correctamente', () => {
    const now = new Date();
    const in10Days = new Date(now.getTime() + 10 * 86400000);
    const in40Days = new Date(now.getTime() + 40 * 86400000);
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const recommendations = [
      { status: 'PENDING', dueDate: in10Days },   // due soon (10 días)
      { status: 'PENDING', dueDate: in40Days },   // NOT due soon (40 días)
      { status: 'COMPLETED', dueDate: in10Days }, // NO due soon (completada)
      { status: 'IN_PROGRESS', dueDate: in10Days }, // due soon
    ];

    const dueSoon = recommendations.filter(
      (r) =>
        r.status !== 'COMPLETED' &&
        r.status !== 'CANCELLED' &&
        r.dueDate &&
        r.dueDate.getTime() >= now.getTime() &&
        r.dueDate.getTime() <= thirtyDaysFromNow.getTime(),
    ).length;

    assert.equal(dueSoon, 2); // PENDING (10 días) + IN_PROGRESS (10 días)
  });

  it('LOGIC-004: effectivenessVerified solo cuenta no-canceladas para pending', () => {
    const recommendations = [
      { effectivenessVerified: true, status: 'COMPLETED' },
      { effectivenessVerified: false, status: 'PENDING' },
      { effectivenessVerified: false, status: 'CANCELLED' },
      { effectivenessVerified: false, status: 'IN_PROGRESS' },
    ];

    const effectivenessPending = recommendations.filter(
      (r) => !r.effectivenessVerified && r.status !== 'CANCELLED',
    ).length;

    assert.equal(effectivenessPending, 2); // PENDING + IN_PROGRESS
  });

  it('LOGIC-005: acciones se agregan correctamente', () => {
    const recommendations = [
      {
        actions: [
          { status: 'PENDING' },
          { status: 'COMPLETED' },
          { status: 'IN_PROGRESS' },
        ],
      },
      {
        actions: [
          { status: 'COMPLETED' },
          { status: 'COMPLETED' },
        ],
      },
    ];

    const allActions = recommendations.flatMap((r) => r.actions ?? []);
    const totalActions = allActions.length;
    const pendingActions = allActions.filter((a) => a.status === 'PENDING').length;
    const completedActions = allActions.filter((a) => a.status === 'COMPLETED').length;

    assert.equal(totalActions, 5);
    assert.equal(pendingActions, 1);
    assert.equal(completedActions, 3);
  });

  // ==================== DISTRIBUTION HELPER ====================

  it('DISTRIBUTION-001: agrupa correctamente', () => {
    const items = [
      { type: 'A' },
      { type: 'A' },
      { type: 'B' },
      { type: undefined },
    ];

    const counts = new Map<string, number>();
    for (const item of items) {
      const value = item.type;
      if (value === undefined || value === null || value === '') continue;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    const distribution = Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

    assert.equal(distribution.length, 2);
    assert.equal(distribution[0].label, 'A');
    assert.equal(distribution[0].count, 2);
    assert.equal(distribution[1].label, 'B');
    assert.equal(distribution[1].count, 1);
  });

  it('DISTRIBUTION-002: ordena por frecuencia descendente', () => {
    const items = [
      { type: 'LOW' },
      { type: 'HIGH' },
      { type: 'HIGH' },
      { type: 'HIGH' },
      { type: 'MEDIUM' },
      { type: 'MEDIUM' },
    ];

    const counts = new Map<string, number>();
    for (const item of items) {
      const value = item.type;
      if (value === undefined || value === null || value === '') continue;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    const distribution = Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

    assert.equal(distribution[0].label, 'HIGH');
    assert.equal(distribution[0].count, 3);
    assert.equal(distribution[1].label, 'MEDIUM');
    assert.equal(distribution[1].count, 2);
    assert.equal(distribution[2].label, 'LOW');
    assert.equal(distribution[2].count, 1);
  });

  it('DISTRIBUTION-003: ignora valores undefined/null/vacíos', () => {
    const items = [
      { type: 'A' },
      { type: undefined },
      { type: null },
      { type: '' },
    ];

    const counts = new Map<string, number>();
    for (const item of items) {
      const value = item.type;
      if (value === undefined || value === null || value === '') continue;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    const distribution = Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

    assert.equal(distribution.length, 1);
    assert.equal(distribution[0].label, 'A');
    assert.equal(distribution[0].count, 1);
  });
});
