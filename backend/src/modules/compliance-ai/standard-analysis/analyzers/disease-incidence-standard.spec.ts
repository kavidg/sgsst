import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DiseaseIncidenceStandardAnalyzer } from './disease-incidence-standard.analyzer';
import { StandardAnalysisContext } from '../../dto/standard-analysis.dto';

/**
 * FASE 35D-2 — Tests del analyzer 3.3.5.
 *
 * El analyzer interpreta los datos reales del ComplianceEngine; NO recalcula
 * score, NO consulta MongoDB y NO duplica la lógica del provider.
 */

const analyzer = new DiseaseIncidenceStandardAnalyzer();

function buildContext(
  overrides: {
    compliance?: number;
    findings?: { id: string; title: string; priority: string; description: string }[];
  } = {},
): StandardAnalysisContext {
  return {
    moduleCompliance: {
      module: 'disease-incidence',
      compliance: overrides.compliance ?? 100,
      level: 'EXCELENTE',
      lastUpdated: new Date().toISOString(),
    },
    findings: (overrides.findings ?? []).map((f) => ({
      id: f.id,
      module: 'disease-incidence',
      title: f.title,
      description: f.description,
      priority: f.priority,
      status: 'OPEN',
      responsible: '',
      dueDate: '',
      createdAt: new Date().toISOString(),
    })),
    companyId: '507f1f77bcf86cd799439011',
  } as unknown as StandardAnalysisContext;
}

describe('DiseaseIncidenceStandardAnalyzer — 3.3.5 (FASE 35D-2)', () => {
  it('supports: solo 3.3.5', () => {
    assert.equal(analyzer.supports('3.3.5'), true);
    assert.equal(analyzer.supports('3.3.4'), false);
    assert.equal(analyzer.supports('3.1.9'), false);
    assert.equal(analyzer.supports('3.2.3'), false);
  });

  it('getModule: disease-incidence', () => {
    assert.equal(analyzer.getModule(), 'disease-incidence');
  });

  it('NO_DATA por colección vacía → resumen de ausencia de registro', () => {
    const result = analyzer.analyze(
      buildContext({
        compliance: 0,
        findings: [
          {
            id: 'disease-incidence-no-data',
            title: 'Sin datos para calcular la incidencia',
            priority: 'HIGH',
            description: 'El registro estadístico no tiene casos registrados.',
          },
        ],
      }),
    );
    assert.match(result.summary, /no tiene casos registrados|no es posible distinguir/);
    assert.equal(result.keyIssues.length, 1);
    assert.equal(result.keyIssues[0].priority, 'HIGH');
    assert.ok(result.quickWins.length > 0);
  });

  it('NO_DATA por población de referencia vacía → mensaje específico de denominador', () => {
    const result = analyzer.analyze(
      buildContext({
        compliance: 0,
        findings: [
          {
            id: 'disease-incidence-no-denominator',
            title: 'No existe población de referencia válida',
            priority: 'HIGH',
            description: '0 trabajadores activos al cierre del período.',
          },
        ],
      }),
    );
    assert.match(result.summary, /No existe población de referencia/);
    assert.match(result.keyIssues[0].impact, /denominador/);
  });

  it('cero casos nuevos → advertencia de subregistro', () => {
    const result = analyzer.analyze(
      buildContext({
        compliance: 100,
        findings: [
          {
            id: 'disease-incidence-zero-cases',
            title: '0 casos nuevos registrados en el período',
            priority: 'MEDIUM',
            description: 'Incidencia = 0.00 por 1.000 trabajadores.',
          },
        ],
      }),
    );
    const issue = result.keyIssues.find((i) => i.id === 'disease-incidence-zero-cases');
    assert.ok(issue, 'keyIssue de cero casos');
    assert.match(issue.impact, /subregistro/);
  });

  it('gap de trazabilidad → recomendación de asociar casos a trabajadores', () => {
    const result = analyzer.analyze(
      buildContext({
        compliance: 80,
        findings: [
          {
            id: 'disease-incidence-traceability-gap',
            title: '2 caso(s) nuevo(s) sin trabajador asociado',
            priority: 'LOW',
            description: 'Casos nuevos sin employeeId.',
          },
        ],
      }),
    );
    const issue = result.keyIssues.find((i) => i.id === 'disease-incidence-traceability-gap');
    assert.ok(issue, 'keyIssue de trazabilidad');
    assert.match(issue.recommendation, /trabajador/);
  });

  it('duplicidad de episodios → keyIssue de ambigüedad estadística', () => {
    const result = analyzer.analyze(
      buildContext({
        compliance: 85,
        findings: [
          {
            id: 'disease-incidence-duplicate-episodes',
            title: 'Posible duplicidad estadística en 1 trabajador(es)',
            priority: 'LOW',
            description: 'Mismo employeeId con múltiples casos nuevos.',
          },
        ],
      }),
    );
    const issue = result.keyIssues.find((i) => i.id === 'disease-incidence-duplicate-episodes');
    assert.ok(issue, 'keyIssue de duplicidad');
    assert.match(issue.recommendation, /episodios|distintos/);
  });

  it('score alto → resumen positivo sin issues', () => {
    const result = analyzer.analyze(buildContext({ compliance: 100 }));
    assert.match(result.summary, /alcanza un 100%/);
    assert.equal(result.keyIssues.length, 0);
  });

  it('score intermedio → resumen de brechas', () => {
    const result = analyzer.analyze(buildContext({ compliance: 60 }));
    assert.match(result.summary, /60%/);
  });

  it('score bajo → resumen de atención', () => {
    const result = analyzer.analyze(buildContext({ compliance: 30 }));
    assert.match(result.summary, /requiere atención/);
  });

  it('getMetrics: hasValidMeasurement 0 con NO_DATA y 1 con medición', () => {
    const noData = analyzer.getMetrics(
      buildContext({
        compliance: 0,
        findings: [
          {
            id: 'disease-incidence-no-denominator',
            title: 'Sin población',
            priority: 'HIGH',
            description: '',
          },
        ],
      }),
    );
    assert.equal(noData.hasValidMeasurement, 0);

    const valid = analyzer.getMetrics(buildContext({ compliance: 100 }));
    assert.equal(valid.hasValidMeasurement, 1);
    assert.equal(valid.compliancePercentage, 100);
  });

  it('no excede 3 quickWins ni 3 nextSteps', () => {
    const result = analyzer.analyze(
      buildContext({
        compliance: 50,
        findings: [
          { id: 'disease-incidence-zero-cases', title: 'a', priority: 'HIGH', description: '' },
          { id: 'disease-incidence-traceability-gap', title: 'b', priority: 'MEDIUM', description: '' },
          { id: 'disease-incidence-duplicate-episodes', title: 'c', priority: 'LOW', description: '' },
        ],
      }),
    );
    assert.ok(result.quickWins.length <= 3);
    assert.ok(result.nextSteps.length <= 3);
  });

  it('incidencia positiva no genera mensaje de penalización por magnitud (score = calidad de medición)', () => {
    // Con incidencia positiva (finding de tasa) y sin brechas, el analyzer
    // NO produce keyIssues "por tener casos": el score es de medición.
    const result = analyzer.analyze(
      buildContext({
        compliance: 100,
        findings: [
          {
            id: 'disease-incidence-rate',
            title: 'Incidencia de enfermedad laboral: 12.50 por 1.000 trabajadores',
            priority: 'MEDIUM',
            description: '5 casos nuevos sobre 400 trabajadores.',
          },
        ],
      }),
    );
    assert.equal(result.keyIssues.length, 0, 'sin penalización por magnitud');
    assert.match(result.summary, /alcanza un 100%/);
  });
});
