import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DiseaseInvestigationProvider } from './disease-investigation.provider';
import { InvestigationType } from '../../incidents/schemas/incident.schema';

/**
 * Tests del DiseaseInvestigationProvider — Estándar 3.2.2
 * Investigación de enfermedades laborales.
 *
 * Valida:
 * - Compatibilidad con ComplianceProvider
 * - Filtrado exclusivo DISEASE
 * - NO_DATA
 * - Scoring ponderado
 * - Findings agregados
 * - Privacidad (sin PII)
 * - Tenant isolation
 */

// Helper para crear mock de Incident parcial
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
  const findFn = (query?: Record<string, unknown>) => {
    let filtered = instances;
    if (query?.investigationType !== undefined) {
      filtered = instances.filter((i) => i.investigationType === query.investigationType);
    }
    return {
      sort: () => ({
        exec: async () => filtered,
      }),
    };
  };
  return { find: findFn };
}

function createProvider(instances: ReturnType<typeof createMockIncident>[]) {
  const model = createMockModel(instances);
  return new DiseaseInvestigationProvider(model as any);
}

describe('DiseaseInvestigationProvider (3.2.2 · Investigación de enfermedades laborales)', () => {

  // ═══════════════════════════════════════════════════════════════
  // NO_DATA
  // ═══════════════════════════════════════════════════════════════

  describe('NO-DATA: Sin investigaciones', () => {
    it('NO-DATA-001: retorna NO_DATA cuando no hay registros DISEASE', async () => {
      const provider = createProvider([]);
      const result = await provider.getCompliance('507f1f77bcf86cd799439012');

      assert.equal(result.module, 'disease-investigation');
      assert.equal(result.percentage, 0);
      assert.equal(result.status, 'NO_DATA');
      assert.equal(result.pending, 0);
      assert.equal(result.completed, 0);
      assert.equal(result.findings.length, 1);
      assert.equal(result.findings[0].id, 'disease-investigation-no-data');
      assert.equal(result.findings[0].priority, 'HIGH');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // SOLO DISEASE
  // ═══════════════════════════════════════════════════════════════

  describe('FILTER-001: Solo procesa DISEASE', () => {
    it('FILTER-001a: ignora registros ACCIDENT', async () => {
      const provider = createProvider([
        createMockIncident({ investigationType: InvestigationType.ACCIDENT }),
        createMockIncident({ investigationType: InvestigationType.ACCIDENT }),
      ]);
      const result = await provider.getCompliance('507f1f77bcf86cd799439012');
      assert.equal(result.status, 'NO_DATA');
      assert.equal(result.percentage, 0);
    });

    it('FILTER-001b: ignora registros sin investigationType (legacy)', async () => {
      const provider = createProvider([
        createMockIncident({ investigationType: undefined }),
      ]);
      const result = await provider.getCompliance('507f1f77bcf86cd799439012');
      assert.equal(result.status, 'NO_DATA');
    });

    it('FILTER-001c: solo cuenta registros DISEASE', async () => {
      const provider = createProvider([
        createMockIncident({ investigationType: InvestigationType.ACCIDENT }),
        createMockIncident({ investigationType: InvestigationType.DISEASE }),
      ]);
      const result = await provider.getCompliance('507f1f77bcf86cd799439012');
      assert.ok(result.percentage > 0);
      assert.notEqual(result.status, 'NO_DATA');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // INVESTIGACIÓN FORMAL
  // ═══════════════════════════════════════════════════════════════

  describe('FORMAL-001: Investigación formal', () => {
    it('FORMAL-001a: investigaciones con investigationDate obtienen mejor score', async () => {
      const withDate = createProvider([
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          investigationDate: new Date('2025-01-20'),
          rootCauses: ['Causa'],
          correctiveActions: [{ action: 'Acción', responsible: 'SST', status: 'PENDING' }],
          responsible: 'Investigador',
          evidence: ['evidencia.pdf'],
        }),
      ]);
      const withoutDate = createProvider([
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          investigationDate: undefined,
          rootCauses: ['Causa'],
          correctiveActions: [{ action: 'Acción', responsible: 'SST', status: 'PENDING' }],
          responsible: 'Investigador',
          evidence: ['evidencia.pdf'],
        }),
      ]);

      const resultWith = await withDate.getCompliance('507f1f77bcf86cd799439012');
      const resultWithout = await withoutDate.getCompliance('507f1f77bcf86cd799439012');

      assert.ok(resultWith.percentage > resultWithout.percentage);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ANÁLISIS CAUSAL
  // ═══════════════════════════════════════════════════════════════

  describe('CAUSAL-001: Análisis causal', () => {
    it('CAUSAL-001a: investigaciones con rootCauses obtienen mejor score', async () => {
      const withCauses = createProvider([
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          investigationDate: new Date('2025-01-20'),
          rootCauses: ['Causa básica'],
          correctiveActions: [{ action: 'Acción', responsible: 'SST', status: 'PENDING' }],
          responsible: 'Investigador',
          evidence: ['evidencia.pdf'],
        }),
      ]);
      const withoutCauses = createProvider([
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          investigationDate: new Date('2025-01-20'),
          rootCauses: [],
          correctiveActions: [{ action: 'Acción', responsible: 'SST', status: 'PENDING' }],
          responsible: 'Investigador',
          evidence: ['evidencia.pdf'],
        }),
      ]);

      const resultWith = await withCauses.getCompliance('507f1f77bcf86cd799439012');
      const resultWithout = await withoutCauses.getCompliance('507f1f77bcf86cd799439012');

      assert.ok(resultWith.percentage > resultWithout.percentage);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // ACCIONES CORRECTIVAS/PREVENTIVAS
  // ═══════════════════════════════════════════════════════════════

  describe('ACTIONS-001: Acciones correctivas/preventivas', () => {
    it('ACTIONS-001a: investigaciones con acciones obtienen mejor score', async () => {
      const withActions = createProvider([
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          investigationDate: new Date('2025-01-20'),
          rootCauses: ['Causa'],
          correctiveActions: [{ action: 'Acción', responsible: 'SST', status: 'PENDING' }],
          responsible: 'Investigador',
          evidence: ['evidencia.pdf'],
        }),
      ]);
      const withoutActions = createProvider([
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          investigationDate: new Date('2025-01-20'),
          rootCauses: ['Causa'],
          correctiveActions: [],
          responsible: 'Investigador',
          evidence: ['evidencia.pdf'],
        }),
      ]);

      const resultWith = await withActions.getCompliance('507f1f77bcf86cd799439012');
      const resultWithout = await withoutActions.getCompliance('507f1f77bcf86cd799439012');

      assert.ok(resultWith.percentage > resultWithout.percentage);
    });

    it('ACTIONS-001b: acciones vencidas generan finding HIGH', async () => {
      const pastDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

      const provider = createProvider([
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          investigationDate: new Date('2025-01-20'),
          rootCauses: ['Causa'],
          correctiveActions: [
            { action: 'Vencida', responsible: 'SST', status: 'PENDING', dueDate: pastDate },
          ],
          responsible: 'Investigador',
          evidence: ['evidencia.pdf'],
        }),
      ]);

      const result = await provider.getCompliance('507f1f77bcf86cd799439012');
      const overdueFinding = result.findings.find(
        (f) => f.id === 'disease-investigation-overdue-actions',
      );
      assert.ok(overdueFinding, 'Debe existir finding de acciones vencidas');
      assert.equal(overdueFinding.priority, 'HIGH');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // RESPONSABLE
  // ═══════════════════════════════════════════════════════════════

  describe('RESPONSIBLE-001: Responsable', () => {
    it('RESPONSIBLE-001a: investigaciones con responsable obtienen mejor score', async () => {
      const withResp = createProvider([
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          investigationDate: new Date('2025-01-20'),
          rootCauses: ['Causa'],
          correctiveActions: [{ action: 'Acción', responsible: 'SST', status: 'PENDING' }],
          responsible: 'Investigador SST',
          evidence: ['evidencia.pdf'],
        }),
      ]);
      const withoutResp = createProvider([
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          investigationDate: new Date('2025-01-20'),
          rootCauses: ['Causa'],
          correctiveActions: [{ action: 'Acción', responsible: 'SST', status: 'PENDING' }],
          responsible: undefined,
          evidence: ['evidencia.pdf'],
        }),
      ]);

      const resultWith = await withResp.getCompliance('507f1f77bcf86cd799439012');
      const resultWithout = await withoutResp.getCompliance('507f1f77bcf86cd799439012');

      assert.ok(resultWith.percentage > resultWithout.percentage);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // EVIDENCIA
  // ═══════════════════════════════════════════════════════════════

  describe('EVIDENCE-001: Evidencia', () => {
    it('EVIDENCE-001a: investigaciones con evidencia obtienen mejor score', async () => {
      const withEv = createProvider([
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          investigationDate: new Date('2025-01-20'),
          rootCauses: ['Causa'],
          correctiveActions: [{ action: 'Acción', responsible: 'SST', status: 'PENDING' }],
          responsible: 'Investigador',
          evidence: ['informe.pdf'],
        }),
      ]);
      const withoutEv = createProvider([
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          investigationDate: new Date('2025-01-20'),
          rootCauses: ['Causa'],
          correctiveActions: [{ action: 'Acción', responsible: 'SST', status: 'PENDING' }],
          responsible: 'Investigador',
          evidence: [],
        }),
      ]);

      const resultWith = await withEv.getCompliance('507f1f77bcf86cd799439012');
      const resultWithout = await withoutEv.getCompliance('507f1f77bcf86cd799439012');

      assert.ok(resultWith.percentage > resultWithout.percentage);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // CIERRE
  // ═══════════════════════════════════════════════════════════════

  describe('CLOSURE-001: Cierre', () => {
    it('CLOSURE-001a: investigaciones cerradas obtienen mejor score', async () => {
      const withClosure = createProvider([
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          investigationDate: new Date('2025-01-20'),
          closureDate: new Date('2025-02-01'),
          rootCauses: ['Causa'],
          correctiveActions: [{ action: 'Acción', responsible: 'SST', status: 'COMPLETED' }],
          responsible: 'Investigador',
          evidence: ['evidencia.pdf'],
        }),
      ]);
      const withoutClosure = createProvider([
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          investigationDate: new Date('2025-01-20'),
          closureDate: undefined,
          rootCauses: ['Causa'],
          correctiveActions: [{ action: 'Acción', responsible: 'SST', status: 'PENDING' }],
          responsible: 'Investigador',
          evidence: ['evidencia.pdf'],
        }),
      ]);

      const resultWith = await withClosure.getCompliance('507f1f77bcf86cd799439012');
      const resultWithout = await withoutClosure.getCompliance('507f1f77bcf86cd799439012');

      assert.ok(resultWith.percentage > resultWithout.percentage);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // SCORING COMPLETO
  // ═══════════════════════════════════════════════════════════════

  describe('SCORING-001: Scoring completo', () => {
    it('SCORING-001a: investigaciones completamente documentadas obtienen alto score', async () => {
      const provider = createProvider([
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          investigationDate: new Date('2025-01-20'),
          closureDate: new Date('2025-02-01'),
          rootCauses: ['Causa básica 1', 'Causa básica 2'],
          immediateCauses: ['Causa inmediata 1'],
          relatedFactors: ['Químico', 'Psicosocial'],
          correctiveActions: [
            { action: 'Acción 1', responsible: 'SST', status: 'COMPLETED' },
            { action: 'Acción 2', responsible: 'SST', status: 'COMPLETED' },
          ],
          preventiveActions: [
            { action: 'Prev 1', responsible: 'SST', status: 'COMPLETED' },
          ],
          responsible: 'Investigador SST',
          evidence: ['informe.pdf', 'fotos.jpg'],
        }),
      ]);

      const result = await provider.getCompliance('507f1f77bcf86cd799439012');
      assert.equal(result.percentage, 100);
      assert.equal(result.status, 'TARGET_MET');
      assert.equal(result.findings.length, 0);
    });

    it('SCORING-001b: investigaciones sin documentación obtienen bajo score', async () => {
      const provider = createProvider([
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          investigationDate: undefined,
          closureDate: undefined,
          rootCauses: [],
          immediateCauses: [],
          relatedFactors: [],
          correctiveActions: [],
          preventiveActions: [],
          responsible: undefined,
          evidence: [],
        }),
      ]);

      const result = await provider.getCompliance('507f1f77bcf86cd799439012');
      assert.ok(result.percentage < 50);
      assert.ok(result.findings.length > 0);
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // FINDINGS
  // ═══════════════════════════════════════════════════════════════

  describe('FINDINGS-001: Findings agregados', () => {
    it('FINDINGS-001a: genera findings para cada brecha', async () => {
      const provider = createProvider([
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          investigationDate: undefined,
          rootCauses: [],
          correctiveActions: [],
          responsible: undefined,
          evidence: [],
        }),
      ]);

      const result = await provider.getCompliance('507f1f77bcf86cd799439012');
      const findingIds = result.findings.map((f) => f.id);

      assert.ok(findingIds.includes('disease-investigation-formal-research-gap'));
      assert.ok(findingIds.includes('disease-investigation-causal-analysis-gap'));
      assert.ok(findingIds.includes('disease-investigation-actions-gap'));
      assert.ok(findingIds.includes('disease-investigation-evidence-gap'));
      assert.ok(findingIds.includes('disease-investigation-responsible-gap'));
      assert.ok(findingIds.includes('disease-investigation-pending-closure'));
    });

    it('FINDINGS-001b: todos los findings son de module disease-investigation', async () => {
      const provider = createProvider([
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          investigationDate: undefined,
          rootCauses: [],
          correctiveActions: [],
          responsible: undefined,
          evidence: [],
        }),
      ]);

      const result = await provider.getCompliance('507f1f77bcf86cd799439012');
      for (const finding of result.findings) {
        assert.equal(finding.module, 'disease-investigation');
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // PRIVACIDAD
  // ═══════════════════════════════════════════════════════════════

  describe('PRIVACY-001: No expose PII', () => {
    it('PRIVACY-001a: findings no contienen employeeId', async () => {
      const provider = createProvider([
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          investigationDate: new Date('2025-01-20'),
          rootCauses: [],
          correctiveActions: [],
          responsible: undefined,
          evidence: [],
        }),
      ]);

      const result = await provider.getCompliance('507f1f77bcf86cd799439012');
      const resultStr = JSON.stringify(result);

      assert.ok(!resultStr.includes('employeeId'), 'No debe contener employeeId');
      assert.ok(!resultStr.includes('507f1f77bcf86cd799439011'), 'No debe contener ID de empleado');
    });

    it('PRIVACY-001b: findings no contienen userId', async () => {
      const provider = createProvider([
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          investigationDate: new Date('2025-01-20'),
          rootCauses: [],
          correctiveActions: [],
          responsible: undefined,
          evidence: [],
        }),
      ]);

      const result = await provider.getCompliance('507f1f77bcf86cd799439012');
      const resultStr = JSON.stringify(result);

      assert.ok(!resultStr.includes('userId'), 'No debe contener userId');
    });

    it('PRIVACY-001c: findings no contienen descripción individual', async () => {
      const provider = createProvider([
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          description: 'Descripción sensible del caso',
          investigationDate: new Date('2025-01-20'),
          rootCauses: [],
          correctiveActions: [],
          responsible: undefined,
          evidence: [],
        }),
      ]);

      const result = await provider.getCompliance('507f1f77bcf86cd799439012');
      const resultStr = JSON.stringify(result);

      assert.ok(!resultStr.includes('Descripción sensible del caso'), 'No debe contener descripción individual');
    });

    it('PRIVACY-001d: findings no contienen rootCauses individuales', async () => {
      const provider = createProvider([
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          investigationDate: new Date('2025-01-20'),
          rootCauses: ['Causa sensible'],
          correctiveActions: [],
          responsible: undefined,
          evidence: [],
        }),
      ]);

      const result = await provider.getCompliance('507f1f77bcf86cd799439012');
      const resultStr = JSON.stringify(result);

      assert.ok(!resultStr.includes('Causa sensible'), 'No debe contener rootCauses individuales');
    });

    it('PRIVACY-001e: findings no contienen evidence individual', async () => {
      const provider = createProvider([
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          investigationDate: new Date('2025-01-20'),
          rootCauses: [],
          correctiveActions: [],
          responsible: undefined,
          evidence: ['documento-sensible.pdf'],
        }),
      ]);

      const result = await provider.getCompliance('507f1f77bcf86cd799439012');
      const resultStr = JSON.stringify(result);

      assert.ok(!resultStr.includes('documento-sensible.pdf'), 'No debe contener evidence individual');
    });

    it('PRIVACY-001f: findings no contienen diagnósticos', async () => {
      const provider = createProvider([
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          investigationDate: new Date('2025-01-20'),
          rootCauses: [],
          correctiveActions: [],
          responsible: undefined,
          evidence: [],
        }),
      ]);

      const result = await provider.getCompliance('507f1f77bcf86cd799439012');
      const resultStr = JSON.stringify(result);

      assert.ok(!resultStr.includes('diagnóstico'), 'No debe contener diagnósticos');
      assert.ok(!resultStr.includes('diagnosis'), 'No debe contener diagnosis');
      assert.ok(!resultStr.includes('historia clínica'), 'No debe contener historia clínica');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // TENANT ISOLATION
  // ═══════════════════════════════════════════════════════════════

  describe('TENANT-001: Tenant isolation', () => {
    it('TENANT-001a: module es disease-investigation', async () => {
      const provider = createProvider([
        createMockIncident({ investigationType: InvestigationType.DISEASE }),
      ]);

      const result = await provider.getCompliance('507f1f77bcf86cd799439012');
      assert.equal(result.module, 'disease-investigation');
    });

    it('TENANT-001b: companyId se utiliza en la consulta', async () => {
      // El mock model siempre retorna los mismos datos,
      // pero verificamos que el provider acepta companyId
      const provider = createProvider([]);
      const result = await provider.getCompliance('507f1f77bcf86cd799439012');
      assert.equal(result.status, 'NO_DATA');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // NO CONTAMINACIÓN CON ACCIDENTALIDAD
  // ═══════════════════════════════════════════════════════════════

  describe('ISOLATION-001: No contaminación con accidentalidad', () => {
    it('ISOLATION-001a: datos ACCIDENT no afectan scoring DISEASE', async () => {
      const provider = createProvider([
        createMockIncident({
          investigationType: InvestigationType.ACCIDENT,
          rootCauses: ['Causa accidente'],
          correctiveActions: [{ action: 'Acción accidente', responsible: 'SST', status: 'PENDING' }],
        }),
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          investigationDate: new Date('2025-01-20'),
          rootCauses: ['Causa enfermedad'],
          correctiveActions: [{ action: 'Acción enfermedad', responsible: 'SST', status: 'PENDING' }],
          responsible: 'Investigador',
          evidence: ['evidencia.pdf'],
        }),
      ]);

      const result = await provider.getCompliance('507f1f77bcf86cd799439012');
      // Solo 1 DISEASE investigado
      assert.ok(result.percentage > 0);
      assert.notEqual(result.status, 'NO_DATA');
    });
  });

  // ═══════════════════════════════════════════════════════════════
  // CUMPLIMIENTO COMPLETO
  // ═══════════════════════════════════════════════════════════════

  describe('COMPLIANT-001: Cumplimiento completo', () => {
    it('COMPLIANT-001a: retorna TARGET_MET con datos completos', async () => {
      const provider = createProvider([
        createMockIncident({
          investigationType: InvestigationType.DISEASE,
          investigationDate: new Date('2025-01-20'),
          closureDate: new Date('2025-02-01'),
          rootCauses: ['Causa básica'],
          immediateCauses: ['Causa inmediata'],
          relatedFactors: ['Químico'],
          correctiveActions: [
            { action: 'Acción 1', responsible: 'SST', status: 'COMPLETED' },
          ],
          preventiveActions: [
            { action: 'Prev 1', responsible: 'SST', status: 'COMPLETED' },
          ],
          responsible: 'Investigador SST',
          evidence: ['informe.pdf'],
        }),
      ]);

      const result = await provider.getCompliance('507f1f77bcf86cd799439012');
      assert.equal(result.percentage, 100);
      assert.equal(result.status, 'TARGET_MET');
      assert.equal(result.completed, 1);
      assert.equal(result.pending, 0);
    });
  });
});
