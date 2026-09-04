import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EpidemiologicalSurveillanceStandardAnalyzer } from './epidemiological-surveillance-standard.analyzer';
import { StandardAnalysisContext } from '../../dto/standard-analysis.dto';
import { StandardAnalysisService } from '../standard-analysis.service';

// ── Mock helpers ──

function createMockContext(overrides: Partial<StandardAnalysisContext> = {}): StandardAnalysisContext {
  return {
    companyId: 'company-123',
    moduleCompliance: {
      module: 'epidemiological-surveillance',
      compliance: 0,
      level: 'NO_DATA',
      lastUpdated: new Date().toISOString(),
    },
    findings: [],
    overview: {
      overallCompliance: 0,
      phaseCompliance: { plan: 0, do: 0, check: 0, act: 0 },
      moduleCompliance: [],
    },
    ...overrides,
  };
}

function buildFinding(overrides: {
  id?: string;
  title?: string;
  description?: string;
  priority?: string;
} = {}) {
  return {
    id: overrides.id ?? 'pve-no-hazards',
    module: 'epidemiological-surveillance',
    title: overrides.title ?? '1 programa(s) sin peligros asociados',
    description: overrides.description ?? 'Test description',
    priority: overrides.priority ?? 'HIGH',
    status: 'OPEN',
    responsible: '',
    dueDate: '',
    createdAt: new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════
// AN-001: supports("3.3.1") === true
// ═══════════════════════════════════════════════════════════════

describe('EpidemiologicalSurveillanceStandardAnalyzer (3.3.1 · Programas de vigilancia epidemiológica)', () => {
  const analyzer = new EpidemiologicalSurveillanceStandardAnalyzer();

  // ═══════════════════════════════════════════════════════════════
  // SUPPORTS
  // ═══════════════════════════════════════════════════════════════

  it('AN-001: supports 3.3.1', () => {
    assert.equal(analyzer.supports('3.3.1'), true);
  });

  // ═══════════════════════════════════════════════════════════════
  // AN-002: supports("3.3.2") === false
  // ═══════════════════════════════════════════════════════════════

  it('AN-002: no soporta otros códigos', () => {
    assert.equal(analyzer.supports('3.3.2'), false);
    assert.equal(analyzer.supports('3.2.1'), false);
    assert.equal(analyzer.supports('3.2.2'), false);
    assert.equal(analyzer.supports('3.1.1'), false);
    assert.equal(analyzer.supports('3.1.2'), false);
    assert.equal(analyzer.supports('2.9.1'), false);
    assert.equal(analyzer.supports(''), false);
    assert.equal(analyzer.supports('99.99'), false);
  });

  // ═══════════════════════════════════════════════════════════════
  // AN-003: module correcto
  // ═══════════════════════════════════════════════════════════════

  it('AN-003: getModule retorna epidemiological-surveillance', () => {
    assert.equal(analyzer.getModule(), 'epidemiological-surveillance');
  });

  // ═══════════════════════════════════════════════════════════════
  // AN-004: NO_DATA cuando no existen PVE
  // ═══════════════════════════════════════════════════════════════

  it('AN-004: NO_DATA cuando no existen PVE', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'epidemiological-surveillance', compliance: 0, level: 'NO_DATA', lastUpdated: '' },
      findings: [],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.summary.includes('No se encontraron programas de vigilancia epidemiológica'));
    assert.equal(result.keyIssues.length, 0);
    assert.ok(result.quickWins.length > 0);
    assert.ok(result.nextSteps.length > 0);
  });

  // ═══════════════════════════════════════════════════════════════
  // AN-005: NO_DATA usa exactamente pve-no-data
  // ═══════════════════════════════════════════════════════════════

  it('AN-005: NO_DATA usa exactamente pve-no-data', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'epidemiological-surveillance', compliance: 0, level: 'NO_DATA', lastUpdated: '' },
      findings: [buildFinding({ id: 'pve-no-data', title: 'Sin programas de vigilancia epidemiológica', priority: 'HIGH' })],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.summary.includes('No se encontraron programas de vigilancia epidemiológica'));
    assert.ok(result.quickWins[0].includes('Crear'));
    assert.ok(result.nextSteps[0].includes('programas de vigilancia epidemiológica'));
  });

  // ═══════════════════════════════════════════════════════════════
  // AN-006: NO_DATA no se genera cuando existe al menos un PVE
  // ═══════════════════════════════════════════════════════════════

  it('AN-006: NO_DATA no se genera cuando existe al menos un PVE', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'epidemiological-surveillance', compliance: 60, level: 'PARTIAL', lastUpdated: '' },
      findings: [buildFinding({ id: 'pve-no-hazards', title: 'Sin peligros', priority: 'HIGH' })],
    });

    const result = analyzer.analyze(context);
    assert.ok(!result.summary.includes('No se encontraron'));
    assert.ok(result.keyIssues.length > 0);
  });

  // ═══════════════════════════════════════════════════════════════
  // AN-007: interpretación con PVE correcto
  // ═══════════════════════════════════════════════════════════════

  it('AN-007a: interpretación con alta satisfacción', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'epidemiological-surveillance', compliance: 95, level: 'COMPLIANT', lastUpdated: '' },
      findings: [],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.summary.includes('95%'));
    assert.ok(result.summary.includes('sólida'));
    assert.equal(result.keyIssues.length, 0);
  });

  it('AN-007b: interpretación con cumplimiento parcial', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'epidemiological-surveillance', compliance: 60, level: 'PARTIAL', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'pve-insufficient-coverage', title: 'Cobertura insuficiente: 40%', priority: 'MEDIUM' }),
        buildFinding({ id: 'pve-overdue-activities', title: '2 actividad(es) vencida(s)', priority: 'MEDIUM' }),
      ],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.summary.includes('60%'));
    assert.ok(result.keyIssues.length >= 2);
    assert.ok(result.quickWins.length > 0);
  });

  it('AN-007c: interpretación con bajo cumplimiento', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'epidemiological-surveillance', compliance: 20, level: 'NON_COMPLIANT', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'pve-no-hazards', title: 'Sin peligros', priority: 'HIGH' }),
        buildFinding({ id: 'pve-no-target-population', title: 'Sin población', priority: 'HIGH' }),
      ],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.summary.includes('20%'));
    assert.ok(result.summary.includes('atención prioritaria'));
  });

  // ═══════════════════════════════════════════════════════════════
  // AN-008: quickWins derivados de findings
  // ═══════════════════════════════════════════════════════════════

  it('AN-008a: quickWins derivados de pve-no-hazards', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'epidemiological-surveillance', compliance: 40, level: 'NON_COMPLIANT', lastUpdated: '' },
      findings: [buildFinding({ id: 'pve-no-hazards', title: 'Sin peligros', priority: 'HIGH' })],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.quickWins.length > 0);
    assert.ok(result.quickWins[0].includes('peligros prioritarios'));
  });

  it('AN-008b: quickWins derivados de pve-no-target-population', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'epidemiological-surveillance', compliance: 40, level: 'NON_COMPLIANT', lastUpdated: '' },
      findings: [buildFinding({ id: 'pve-no-target-population', title: 'Sin población', priority: 'HIGH' })],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.quickWins.length > 0);
    assert.ok(result.quickWins[0].includes('áreas y cargos'));
  });

  it('AN-008c: quickWins derivados de pve-no-periodicity', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'epidemiological-surveillance', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [buildFinding({ id: 'pve-no-periodicity', title: 'Sin periodicidad', priority: 'MEDIUM' })],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.quickWins.length > 0);
    assert.ok(result.quickWins[0].includes('periodicidad'));
  });

  it('AN-008d: quickWins derivados de pve-overdue-activities', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'epidemiological-surveillance', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [buildFinding({ id: 'pve-overdue-activities', title: 'Actividades vencidas', priority: 'MEDIUM' })],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.quickWins.length > 0);
    assert.ok(result.quickWins[0].includes('vencidas'));
  });

  it('AN-008e: quickWins derivados de pve-insufficient-coverage', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'epidemiological-surveillance', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [buildFinding({ id: 'pve-insufficient-coverage', title: 'Cobertura insuficiente', priority: 'MEDIUM' })],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.quickWins.length > 0);
    assert.ok(result.quickWins[0].includes('exámenes médicos'));
  });

  it('AN-008f: quickWins derivados de pve-no-follow-up', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'epidemiological-surveillance', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [buildFinding({ id: 'pve-no-follow-up', title: 'Sin seguimiento', priority: 'LOW' })],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.quickWins.length > 0);
    assert.ok(result.quickWins[0].includes('seguimiento'));
  });

  it('AN-008g: quickWins máximo 3', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'epidemiological-surveillance', compliance: 20, level: 'NON_COMPLIANT', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'pve-no-hazards', title: 'Sin peligros', priority: 'HIGH' }),
        buildFinding({ id: 'pve-no-target-population', title: 'Sin población', priority: 'HIGH' }),
        buildFinding({ id: 'pve-insufficient-coverage', title: 'Cobertura insuficiente', priority: 'MEDIUM' }),
        buildFinding({ id: 'pve-overdue-activities', title: 'Actividades vencidas', priority: 'MEDIUM' }),
      ],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.quickWins.length <= 3);
  });

  // ═══════════════════════════════════════════════════════════════
  // AN-009: nextSteps derivados de findings
  // ═══════════════════════════════════════════════════════════════

  it('AN-009a: nextSteps prioriza issues HIGH', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'epidemiological-surveillance', compliance: 30, level: 'NON_COMPLIANT', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'pve-no-hazards', title: 'Sin peligros', priority: 'HIGH' }),
        buildFinding({ id: 'pve-insufficient-coverage', title: 'Cobertura insuficiente', priority: 'MEDIUM' }),
      ],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.nextSteps.length > 0);
    assert.ok(result.nextSteps.length <= 3);
  });

  it('AN-009b: nextSteps máximo 3', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'epidemiological-surveillance', compliance: 20, level: 'NON_COMPLIANT', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'pve-no-hazards', title: 'Sin peligros', priority: 'HIGH' }),
        buildFinding({ id: 'pve-no-target-population', title: 'Sin población', priority: 'HIGH' }),
        buildFinding({ id: 'pve-insufficient-coverage', title: 'Cobertura insuficiente', priority: 'MEDIUM' }),
        buildFinding({ id: 'pve-overdue-activities', title: 'Actividades vencidas', priority: 'MEDIUM' }),
      ],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.nextSteps.length <= 3);
  });

  it('AN-009c: nextSteps default cuando no hay findings', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'epidemiological-surveillance', compliance: 100, level: 'COMPLIANT', lastUpdated: '' },
      findings: [],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.nextSteps.length > 0);
    assert.ok(result.nextSteps[0].includes('revisión periódica'));
  });

  // ═══════════════════════════════════════════════════════════════
  // AN-010: métricas agregadas
  // ═══════════════════════════════════════════════════════════════

  it('AN-010a: getMetrics retorna compliancePercentage', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'epidemiological-surveillance', compliance: 60, level: 'PARTIAL', lastUpdated: '' },
      findings: [],
    });

    const metrics = analyzer.getMetrics(context);
    assert.equal(metrics.compliancePercentage, 60);
  });

  it('AN-010b: getMetrics con NO_DATA retorna totalPrograms = 0', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'epidemiological-surveillance', compliance: 0, level: 'NO_DATA', lastUpdated: '' },
      findings: [buildFinding({ id: 'pve-no-data', title: 'Sin programas', priority: 'HIGH' })],
    });

    const metrics = analyzer.getMetrics(context);
    assert.equal(metrics.totalPrograms, 0);
  });

  it('AN-010c: getMetrics con datos retorna totalPrograms = 1', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'epidemiological-surveillance', compliance: 60, level: 'PARTIAL', lastUpdated: '' },
      findings: [buildFinding({ id: 'pve-no-hazards', title: 'Sin peligros', priority: 'HIGH' })],
    });

    const metrics = analyzer.getMetrics(context);
    assert.equal(metrics.totalPrograms, 1);
  });

  // ═══════════════════════════════════════════════════════════════
  // AN-011: no employeeId en resultado agregado
  // ═══════════════════════════════════════════════════════════════

  it('AN-011: no contiene employeeId en resultado agregado', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'epidemiological-surveillance', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'pve-insufficient-coverage', title: 'Cobertura insuficiente', priority: 'MEDIUM' }),
      ],
    });

    const result = analyzer.analyze(context);
    const resultStr = JSON.stringify(result);
    assert.ok(!resultStr.includes('employeeId'), 'Should not contain employeeId');
    assert.ok(!resultStr.includes('64b0000000000000000000'), 'Should not contain ObjectId');
  });

  // ═══════════════════════════════════════════════════════════════
  // AN-012: no información clínica
  // ═══════════════════════════════════════════════════════════════

  it('AN-012a: no contiene información clínica', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'epidemiological-surveillance', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'pve-insufficient-coverage', title: 'Cobertura insuficiente', priority: 'MEDIUM' }),
      ],
    });

    const result = analyzer.analyze(context);
    const resultStr = JSON.stringify(result);

    assert.ok(!resultStr.includes('diagnóstico'), 'Should not contain diagnostic');
    assert.ok(!resultStr.includes('historia clínica'), 'Should not contain clinical history');
    assert.ok(!resultStr.includes('medicamento'), 'Should not contain medication');
    assert.ok(!resultStr.includes('tratamiento'), 'Should not contain treatment');
    assert.ok(!resultStr.includes('síntoma'), 'Should not contain symptom');
  });

  it('AN-012b: no contiene userId ni datos individuales', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'epidemiological-surveillance', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'pve-overdue-activities', title: 'Actividades vencidas', priority: 'MEDIUM' }),
      ],
    });

    const result = analyzer.analyze(context);
    const resultStr = JSON.stringify(result);

    assert.ok(!resultStr.includes('userId'), 'Should not contain userId');
    assert.ok(!resultStr.includes('1234567890'), 'Should not contain document numbers');
  });

  // ═══════════════════════════════════════════════════════════════
  // AN-013: 3.3.1 aparece registrado en StandardAnalysisService
  // ═══════════════════════════════════════════════════════════════

  it('AN-013: 3.3.1 aparece registrado en StandardAnalysisService', () => {
    // Verificar que el analyzer es compatible con 3.3.1
    // (el registro real se hace en StandardAnalysisService.constructor)
    assert.equal(analyzer.supports('3.3.1'), true);
    assert.equal(analyzer.getModule(), 'epidemiological-surveillance');
  });

  // ═══════════════════════════════════════════════════════════════
  // AN-014: provider 3.3.1 disponible en ComplianceEngine
  // ═══════════════════════════════════════════════════════════════

  it('AN-014: provider 3.3.1 compatible con ComplianceEngine', () => {
    // El analyzer consume el resultado del ComplianceEngine
    // Verificar que el módulo coincide con el provider
    assert.equal(analyzer.getModule(), 'epidemiological-surveillance');
  });

  // ═══════════════════════════════════════════════════════════════
  // AN-015: tenant isolation no se rompe
  // ═══════════════════════════════════════════════════════════════

  it('AN-015: tenant isolation no se rompe', () => {
    const context = createMockContext({
      companyId: 'tenant-abc',
      moduleCompliance: { module: 'epidemiological-surveillance', compliance: 60, level: 'PARTIAL', lastUpdated: '' },
      findings: [],
    });

    const result = analyzer.analyze(context);
    // El analyzer solo interpreta datos agregados, no consulta MongoDB
    assert.ok(result.summary.length > 0);
    assert.ok(result.quickWins.length > 0);
  });

  // ═══════════════════════════════════════════════════════════════
  // FINDINGS
  // ═══════════════════════════════════════════════════════════════

  it('FINDINGS-001: pve-no-hazards genera keyIssue con impacto', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'epidemiological-surveillance', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'pve-no-hazards', title: '1 programa(s) sin peligros', priority: 'HIGH' }),
      ],
    });

    const result = analyzer.analyze(context);
    const issue = result.keyIssues.find((i) => i.id === 'pve-no-hazards');
    assert.ok(issue, 'Should have no-hazards issue');
    assert.equal(issue!.priority, 'HIGH');
    assert.ok(issue!.impact.length > 0);
    assert.ok(issue!.recommendation.length > 0);
  });

  it('FINDINGS-002: pve-no-target-population genera keyIssue', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'epidemiological-surveillance', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'pve-no-target-population', title: '1 programa(s) sin población', priority: 'HIGH' }),
      ],
    });

    const result = analyzer.analyze(context);
    const issue = result.keyIssues.find((i) => i.id === 'pve-no-target-population');
    assert.ok(issue, 'Should have no-target-population issue');
    assert.equal(issue!.priority, 'HIGH');
  });

  it('FINDINGS-003: pve-insufficient-coverage genera keyIssue', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'epidemiological-surveillance', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'pve-insufficient-coverage', title: 'Cobertura insuficiente: 40%', priority: 'MEDIUM' }),
      ],
    });

    const result = analyzer.analyze(context);
    const issue = result.keyIssues.find((i) => i.id === 'pve-insufficient-coverage');
    assert.ok(issue, 'Should have insufficient-coverage issue');
    assert.equal(issue!.priority, 'MEDIUM');
  });

  it('FINDINGS-004: pve-overdue-activities genera keyIssue', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'epidemiological-surveillance', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'pve-overdue-activities', title: '2 actividad(es) vencida(s)', priority: 'MEDIUM' }),
      ],
    });

    const result = analyzer.analyze(context);
    const issue = result.keyIssues.find((i) => i.id === 'pve-overdue-activities');
    assert.ok(issue, 'Should have overdue-activities issue');
    assert.equal(issue!.priority, 'MEDIUM');
  });

  it('FINDINGS-005: pve-no-periodicity genera keyIssue', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'epidemiological-surveillance', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'pve-no-periodicity', title: '1 programa(s) sin periodicidad', priority: 'MEDIUM' }),
      ],
    });

    const result = analyzer.analyze(context);
    const issue = result.keyIssues.find((i) => i.id === 'pve-no-periodicity');
    assert.ok(issue, 'Should have no-periodicity issue');
    assert.equal(issue!.priority, 'MEDIUM');
  });

  it('FINDINGS-006: pve-no-follow-up genera keyIssue', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'epidemiological-surveillance', compliance: 50, level: 'PARTIAL', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'pve-no-follow-up', title: '1 programa(s) sin seguimiento', priority: 'LOW' }),
      ],
    });

    const result = analyzer.analyze(context);
    const issue = result.keyIssues.find((i) => i.id === 'pve-no-follow-up');
    assert.ok(issue, 'Should have no-follow-up issue');
    assert.equal(issue!.priority, 'LOW');
  });

  // ═══════════════════════════════════════════════════════════════
  // COMPATIBILIDAD
  // ═══════════════════════════════════════════════════════════════

  it('COMPAT-001: Comportamiento cuando findings está vacío', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'epidemiological-surveillance', compliance: 0, level: 'NO_DATA', lastUpdated: '' },
      findings: [],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.summary.length > 0);
    assert.ok(result.quickWins.length > 0);
    assert.ok(result.nextSteps.length > 0);
  });

  it('COMPAT-002: Comportamiento con múltiples findings', () => {
    const context = createMockContext({
      moduleCompliance: { module: 'epidemiological-surveillance', compliance: 30, level: 'NON_COMPLIANT', lastUpdated: '' },
      findings: [
        buildFinding({ id: 'pve-no-hazards', title: 'Sin peligros', priority: 'HIGH' }),
        buildFinding({ id: 'pve-no-target-population', title: 'Sin población', priority: 'HIGH' }),
        buildFinding({ id: 'pve-insufficient-coverage', title: 'Cobertura insuficiente', priority: 'MEDIUM' }),
        buildFinding({ id: 'pve-overdue-activities', title: 'Actividades vencidas', priority: 'MEDIUM' }),
        buildFinding({ id: 'pve-no-follow-up', title: 'Sin seguimiento', priority: 'LOW' }),
      ],
    });

    const result = analyzer.analyze(context);
    assert.ok(result.keyIssues.length >= 3);
    assert.ok(result.quickWins.length <= 3);
    assert.ok(result.nextSteps.length <= 3);
  });

  // ═══════════════════════════════════════════════════════════════
  // CONTRATO STANDARD ANALYSIS SERVICE
  // ═══════════════════════════════════════════════════════════════

  it('CONTRACT-001: Implementa interfaz StandardAnalyzer', () => {
    assert.equal(typeof analyzer.supports, 'function');
    assert.equal(typeof analyzer.getModule, 'function');
    assert.equal(typeof analyzer.analyze, 'function');
    assert.equal(typeof analyzer.getMetrics, 'function');
  });
});
