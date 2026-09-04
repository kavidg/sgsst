import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { IncidentsService, DiseaseInvestigationStats } from './incidents.service';
import { InvestigationType } from './schemas/incident.schema';

/**
 * Tests de Fase 2 — Estadísticas de Investigación de Enfermedades Laborales (3.2.2).
 *
 * Valida getDiseaseInvestigationStats() con mocks del model de Mongoose.
 */

// Helper para crear un mock de Incident parcial
function createMockIncident(overrides: Record<string, unknown> = {}) {
  return {
    _id: '507f1f77bcf86cd799439099',
    companyId: '507f1f77bcf86cd799439012',
    employeeId: '507f1f77bcf86cd799439011',
    type: 'Enfermedad laboral',
    date: new Date('2025-01-15'),
    description: 'Reporte enfermedad',
    severity: 'Media',
    status: 'Abierto',
    investigationType: InvestigationType.DISEASE,
    rootCauses: [],
    immediateCauses: [],
    relatedFactors: [],
    correctiveActions: [],
    preventiveActions: [],
    responsible: undefined,
    investigationDate: undefined,
    closureDate: undefined,
    evidence: [],
    ...overrides,
  };
}

function createMockModel(instances: ReturnType<typeof createMockIncident>[]) {
  const chain = {
    sort: () => chain,
    exec: async () => instances,
    find: () => chain,
  };
  return {
    find: () => chain,
  };
}

function createService(instances: ReturnType<typeof createMockIncident>[]) {
  const model = createMockModel(instances);
  const autoCommService = { generateCommunication: async () => {} };
  return new IncidentsService(model as any, autoCommService as any);
}

describe('Incidents Phase 2 — DiseaseInvestigationStats (3.2.2)', () => {

  // ═══════════════════════════════════════════════════════════════
  // EMPRESA SIN INVESTIGACIONES DISEASE
  // ═══════════════════════════════════════════════════════════════

  describe('STATS-001: Empresa sin investigaciones DISEASE', () => {
    it('STATS-001a: retorna stats con ceros cuando no hay registros', async () => {
      const service = createService([]);
      const stats = await service.getDiseaseInvestigationStats('507f1f77bcf86cd799439012' as any);

      assert.equal(stats.totalInvestigations, 0);
      assert.equal(stats.pendingInvestigations, 0);
      assert.equal(stats.closedInvestigations, 0);
      assert.equal(stats.investigationsWithFormalResearch, 0);
      assert.equal(stats.investigationsWithoutFormalResearch, 0);
      assert.equal(stats.investigationsWithRootCauses, 0);
      assert.equal(stats.investigationsWithImmediateCauses, 0);
      assert.equal(stats.investigationsWithRelatedFactors, 0);
      assert.equal(stats.investigationsWithCorrectiveActions, 0);
      assert.equal(stats.investigationsWithPreventiveActions, 0);
      assert.equal(stats.investigationsWithEvidence, 0);
      assert.equal(stats.investigationsWithResponsible, 0);
      assert.equal(stats.openCorrectiveActions, 0);
      assert.equal(stats.overdueCorrectiveActions, 0);
      assert.equal(stats.completedCorrectiveActions, 0);
      assert.equal(stats.openPreventiveActions, 0);
      assert.equal(stats.overduePreventiveActions, 0);
      assert.equal(stats.completedPreventiveActions, 0);
      assert.equal(stats.averageClosureDays, 0);
      assert.deepEqual(stats.monthlyTrend, []);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // EMPRESA CON INVESTIGACIONES DISEASE
  // ═══════════════════════════════════════════════════════════════

  describe('STATS-002: Empresa con investigaciones DISEASE', () => {
    it('STATS-002a: cuenta total correctamente', async () => {
      const service = createService([
        createMockIncident({ investigationType: InvestigationType.DISEASE }),
        createMockIncident({ investigationType: InvestigationType.DISEASE }),
        createMockIncident({ investigationType: InvestigationType.DISEASE }),
      ]);

      const stats = await service.getDiseaseInvestigationStats('507f1f77bcf86cd799439012' as any);
      assert.equal(stats.totalInvestigations, 3);
    });

    it('STATS-002b: investigaciones pendientes vs cerradas', async () => {
      const service = createService([
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          closureDate: new Date('2025-02-01'),
        }),
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          closureDate: undefined,
        }),
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          closureDate: new Date('2025-03-01'),
        }),
      ]);

      const stats = await service.getDiseaseInvestigationStats('507f1f77bcf86cd799439012' as any);
      assert.equal(stats.totalInvestigations, 3);
      assert.equal(stats.closedInvestigations, 2);
      assert.equal(stats.pendingInvestigations, 1);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // IGNORAR ACCIDENT
  // ═══════════════════════════════════════════════════════════════

  describe('STATS-003: Ignorar registros ACCIDENT', () => {
    it('STATS-003a: solo cuenta registros DISEASE', async () => {
      const service = createService([
        createMockIncident({ investigationType: InvestigationType.ACCIDENT }),
        createMockIncident({ investigationType: InvestigationType.ACCIDENT }),
        createMockIncident({ investigationType: InvestigationType.DISEASE }),
      ]);

      const stats = await service.getDiseaseInvestigationStats('507f1f77bcf86cd799439012' as any);
      assert.equal(stats.totalInvestigations, 1);
    });

    it('STATS-003b: ignora registros sin investigationType (legacy)', async () => {
      const service = createService([
        createMockIncident({ investigationType: undefined }),
        createMockIncident({ investigationType: InvestigationType.DISEASE }),
      ]);

      const stats = await service.getDiseaseInvestigationStats('507f1f77bcf86cd799439012' as any);
      assert.equal(stats.totalInvestigations, 1);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // INVESTIGACIÓN FORMAL
  // ═══════════════════════════════════════════════════════════════

  describe('STATS-004: Investigación formal', () => {
    it('STATS-004a: investigaciones con y sin investigationDate', async () => {
      const service = createService([
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          investigationDate: new Date('2025-01-20'),
        }),
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          investigationDate: undefined,
        }),
      ]);

      const stats = await service.getDiseaseInvestigationStats('507f1f77bcf86cd799439012' as any);
      assert.equal(stats.investigationsWithFormalResearch, 1);
      assert.equal(stats.investigationsWithoutFormalResearch, 1);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // CALIDAD DE INVESTIGACIÓN
  // ═══════════════════════════════════════════════════════════════

  describe('STATS-005: Calidad de investigación', () => {
    it('STATS-005a: cuenta investigaciones con causas', async () => {
      const service = createService([
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          rootCauses: ['Causa 1', 'Causa 2'],
          immediateCauses: ['Inmediata 1'],
          relatedFactors: ['Factor 1'],
        }),
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          rootCauses: [],
          immediateCauses: [],
          relatedFactors: [],
        }),
      ]);

      const stats = await service.getDiseaseInvestigationStats('507f1f77bcf86cd799439012' as any);
      assert.equal(stats.investigationsWithRootCauses, 1);
      assert.equal(stats.investigationsWithImmediateCauses, 1);
      assert.equal(stats.investigationsWithRelatedFactors, 1);
    });

    it('STATS-005b: cuenta investigaciones con acciones', async () => {
      const service = createService([
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          correctiveActions: [
            { action: 'Acción 1', responsible: 'SST', status: 'PENDING' },
          ],
          preventiveActions: [
            { action: 'Prev 1', responsible: 'SST', status: 'PENDING' },
          ],
        }),
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          correctiveActions: [],
          preventiveActions: [],
        }),
      ]);

      const stats = await service.getDiseaseInvestigationStats('507f1f77bcf86cd799439012' as any);
      assert.equal(stats.investigationsWithCorrectiveActions, 1);
      assert.equal(stats.investigationsWithPreventiveActions, 1);
    });

    it('STATS-005c: cuenta investigaciones con evidencia y responsable', async () => {
      const service = createService([
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          evidence: ['informe.pdf'],
          responsible: 'Investigador SST',
        }),
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          evidence: [],
          responsible: undefined,
        }),
      ]);

      const stats = await service.getDiseaseInvestigationStats('507f1f77bcf86cd799439012' as any);
      assert.equal(stats.investigationsWithEvidence, 1);
      assert.equal(stats.investigationsWithResponsible, 1);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ACCIONES CORRECTIVAS Y PREVENTIVAS
  // ═══════════════════════════════════════════════════════════════

  describe('STATS-006: Acciones correctivas y preventivas', () => {
    it('STATS-006a: acciones abiertas, vencidas y completadas', async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 días atrás
      const futureDate = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000); // 10 días adelante

      const service = createService([
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          correctiveActions: [
            { action: 'Abierta', responsible: 'SST', status: 'PENDING', dueDate: futureDate },
            { action: 'Vencida', responsible: 'SST', status: 'IN_PROGRESS', dueDate: pastDate },
            { action: 'Completada', responsible: 'SST', status: 'COMPLETED', dueDate: pastDate, completedDate: pastDate },
          ],
          preventiveActions: [
            { action: 'Prev abierta', responsible: 'SST', status: 'PENDING', dueDate: futureDate },
            { action: 'Prev vencida', responsible: 'SST', status: 'IN_PROGRESS', dueDate: pastDate },
            { action: 'Prev completada', responsible: 'SST', status: 'COMPLETED', dueDate: pastDate, completedDate: pastDate },
          ],
        }),
      ]);

      const stats = await service.getDiseaseInvestigationStats('507f1f77bcf86cd799439012' as any);

      // Correctivas
      assert.equal(stats.openCorrectiveActions, 2); // PENDING + IN_PROGRESS
      assert.equal(stats.overdueCorrectiveActions, 1); // solo la vencida
      assert.equal(stats.completedCorrectiveActions, 1);

      // Preventivas
      assert.equal(stats.openPreventiveActions, 2);
      assert.equal(stats.overduePreventiveActions, 1);
      assert.equal(stats.completedPreventiveActions, 1);
    });

    it('STATS-006b: acción completada aunque dueDate pasó no cuenta como vencida', async () => {
      const now = new Date();
      const pastDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

      const service = createService([
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          correctiveActions: [
            { action: 'Completada tarde', responsible: 'SST', status: 'COMPLETED', dueDate: pastDate, completedDate: pastDate },
          ],
        }),
      ]);

      const stats = await service.getDiseaseInvestigationStats('507f1f77bcf86cd799439012' as any);
      assert.equal(stats.completedCorrectiveActions, 1);
      assert.equal(stats.overdueCorrectiveActions, 0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // TIEMPO PROMEDIO DE CIERRE
  // ═══════════════════════════════════════════════════════════════

  describe('STATS-007: Tiempo promedio de cierre', () => {
    it('STATS-007a: calcula promedio correctamente', async () => {
      const service = createService([
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          investigationDate: new Date('2025-01-01'),
          closureDate: new Date('2025-01-11'), // 10 días
        }),
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          investigationDate: new Date('2025-02-01'),
          closureDate: new Date('2025-02-21'), // 20 días
        }),
      ]);

      const stats = await service.getDiseaseInvestigationStats('507f1f77bcf86cd799439012' as any);
      assert.equal(stats.averageClosureDays, 15); // (10 + 20) / 2
    });

    it('STATS-007b: retorna 0 cuando no hay investigaciones cerradas con fechas', async () => {
      const service = createService([
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          investigationDate: undefined,
          closureDate: undefined,
        }),
      ]);

      const stats = await service.getDiseaseInvestigationStats('507f1f77bcf86cd799439012' as any);
      assert.equal(stats.averageClosureDays, 0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // TENDENCIA MENSUAL
  // ═══════════════════════════════════════════════════════════════

  describe('STATS-008: Tendencia mensual', () => {
    it('STATS-008a: agrupa por mes correctamente', async () => {
      const service = createService([
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          investigationDate: new Date('2025-01-15'),
        }),
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          investigationDate: new Date('2025-01-20'),
        }),
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          investigationDate: new Date('2025-02-10'),
        }),
      ]);

      const stats = await service.getDiseaseInvestigationStats('507f1f77bcf86cd799439012' as any);
      assert.equal(stats.monthlyTrend.length, 2);
      assert.equal(stats.monthlyTrend[0].month, '2025-01');
      assert.equal(stats.monthlyTrend[0].count, 2);
      assert.equal(stats.monthlyTrend[1].month, '2025-02');
      assert.equal(stats.monthlyTrend[1].count, 1);
    });

    it('STATS-008b: usa date como fallback cuando no hay investigationDate', async () => {
      const service = createService([
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          investigationDate: undefined,
          date: new Date('2025-03-05'),
        }),
      ]);

      const stats = await service.getDiseaseInvestigationStats('507f1f77bcf86cd799439012' as any);
      assert.equal(stats.monthlyTrend.length, 1);
      assert.equal(stats.monthlyTrend[0].month, '2025-03');
      assert.equal(stats.monthlyTrend[0].count, 1);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // NO EXPOSE DATOS INDIVIDUALES
  // ═══════════════════════════════════════════════════════════════

  describe('STATS-009: No expose datos individuales', () => {
    it('STATS-009a: resultado no contiene employeeId', async () => {
      const service = createService([
        createMockIncident({ investigationType: InvestigationType.DISEASE }),
      ]);

      const stats = await service.getDiseaseInvestigationStats('507f1f77bcf86cd799439012' as any);
      const statsStr = JSON.stringify(stats);
      assert.ok(!statsStr.includes('employeeId'), 'No debe contener employeeId');
      assert.ok(!statsStr.includes('507f1f77bcf86cd799439011'), 'No debe contener IDs de empleado');
    });

    it('STATS-009b: resultado no contiene nombres', async () => {
      const service = createService([
        createMockIncident({ investigationType: InvestigationType.DISEASE }),
      ]);

      const stats = await service.getDiseaseInvestigationStats('507f1f77bcf86cd799439012' as any);
      const statsStr = JSON.stringify(stats);
      assert.ok(!statsStr.includes('nombre'), 'No debe contener nombres');
      assert.ok(!statsStr.includes('name'), 'No debe contener name');
    });

    it('STATS-009c: resultado no contiene descripciones individuales', async () => {
      const service = createService([
        createMockIncident({ investigationType: InvestigationType.DISEASE }),
      ]);

      const stats = await service.getDiseaseInvestigationStats('507f1f77bcf86cd799439012' as any);
      const statsStr = JSON.stringify(stats);
      assert.ok(!statsStr.includes('description'), 'No debe contener description');
      assert.ok(!statsStr.includes('Reporte enfermedad'), 'No debe contener descripción individual');
    });

    it('STATS-009d: resultado no contiene rootCauses individuales', async () => {
      const service = createService([
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          rootCauses: ['Causa sensible'],
        }),
      ]);

      const stats = await service.getDiseaseInvestigationStats('507f1f77bcf86cd799439012' as any);
      const statsStr = JSON.stringify(stats);
      assert.ok(!statsStr.includes('Causa sensible'), 'No debe contener rootCauses individuales');
    });

    it('STATS-009e: resultado no contiene evidence individual', async () => {
      const service = createService([
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          evidence: ['documento-sensible.pdf'],
        }),
      ]);

      const stats = await service.getDiseaseInvestigationStats('507f1f77bcf86cd799439012' as any);
      const statsStr = JSON.stringify(stats);
      assert.ok(!statsStr.includes('documento-sensible.pdf'), 'No debe contener evidence individual');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // NO MEZCLAR ACCIDENTALIDAD CON ENFERMEDAD
  // ═══════════════════════════════════════════════════════════════

  describe('STATS-010: No mezclar accidentalidad con enfermedad', () => {
    it('STATS-010a: investigaciones ACCIDENT no afectan estadísticas DISEASE', async () => {
      const service = createService([
        createMockIncident({
          investigationType: InvestigationType.ACCIDENT,
          rootCauses: ['Causa accidente'],
          correctiveActions: [
            { action: 'Acción accidente', responsible: 'SST', status: 'PENDING' },
          ],
        }),
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          rootCauses: ['Causa enfermedad'],
          correctiveActions: [
            { action: 'Acción enfermedad', responsible: 'SST', status: 'PENDING' },
          ],
        }),
      ]);

      const stats = await service.getDiseaseInvestigationStats('507f1f77bcf86cd799439012' as any);
      assert.equal(stats.totalInvestigations, 1);
      assert.equal(stats.investigationsWithRootCauses, 1);
      assert.equal(stats.openCorrectiveActions, 1);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // COMPATIBILIDAD CON DOCUMENTOS ANTIGUOS
  // ═══════════════════════════════════════════════════════════════

  describe('STATS-011: Compatibilidad con documentos antiguos', () => {
    it('STATS-011a: documentos sin campos de investigación no rompen stats', async () => {
      // Simula un documento antiguo sin campos de investigación
      const legacyDocument = {
        _id: '507f1f77bcf86cd799439099',
        companyId: '507f1f77bcf86cd799439012',
        employeeId: '507f1f77bcf86cd799439011',
        type: 'Accidente',
        date: new Date('2024-06-15'),
        description: 'Accidente legacy',
        severity: 'Alta',
        status: 'Cerrado',
        // Sin investigationType, rootCauses, etc.
      };

      const service = createService([legacyDocument as any]);
      const stats = await service.getDiseaseInvestigationStats('507f1f77bcf86cd799439012' as any);

      // Legacy sin investigationType no es DISEASE → totalInvestigations = 0
      assert.equal(stats.totalInvestigations, 0);
      assert.equal(stats.pendingInvestigations, 0);
      assert.equal(stats.closedInvestigations, 0);
      assert.equal(stats.averageClosureDays, 0);
      assert.deepEqual(stats.monthlyTrend, []);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // INTERFAZ DiseaseInvestigationStats
  // ═══════════════════════════════════════════════════════════════

  describe('INTERFACE-001: DiseaseInvestigationStats', () => {
    it('INTERFACE-001a: interfaz tiene todos los campos requeridos', () => {
      const stats: DiseaseInvestigationStats = {
        totalInvestigations: 0,
        pendingInvestigations: 0,
        closedInvestigations: 0,
        investigationsWithFormalResearch: 0,
        investigationsWithoutFormalResearch: 0,
        investigationsWithRootCauses: 0,
        investigationsWithImmediateCauses: 0,
        investigationsWithRelatedFactors: 0,
        investigationsWithCorrectiveActions: 0,
        investigationsWithPreventiveActions: 0,
        investigationsWithEvidence: 0,
        investigationsWithResponsible: 0,
        openCorrectiveActions: 0,
        overdueCorrectiveActions: 0,
        completedCorrectiveActions: 0,
        openPreventiveActions: 0,
        overduePreventiveActions: 0,
        completedPreventiveActions: 0,
        averageClosureDays: 0,
        monthlyTrend: [],
      };

      assert.equal(typeof stats.totalInvestigations, 'number');
      assert.equal(typeof stats.pendingInvestigations, 'number');
      assert.equal(typeof stats.closedInvestigations, 'number');
      assert.equal(typeof stats.averageClosureDays, 'number');
      assert.ok(Array.isArray(stats.monthlyTrend));
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // TENANT ISOLATION
  // ═══════════════════════════════════════════════════════════════

  describe('TENANT-001: Tenant isolation en stats', () => {
    it('TENANT-001a: método recibe companyId como Types.ObjectId', async () => {
      const companyId = '507f1f77bcf86cd799439012';
      const service = createService([]);

      // El método debe aceptar Types.ObjectId como parámetro
      const stats = await service.getDiseaseInvestigationStats(companyId as any);
      assert.ok(stats);
      assert.equal(typeof stats.totalInvestigations, 'number');
    });
  });
});
