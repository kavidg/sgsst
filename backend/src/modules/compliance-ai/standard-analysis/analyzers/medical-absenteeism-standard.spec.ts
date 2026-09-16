import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MedicalAbsenteeismStandardAnalyzer } from './medical-absenteeism-standard.analyzer';
import { StandardAnalysisContext } from '../../dto/standard-analysis.dto';

/**
 * FASE 35E-2 — Tests del analyzer 3.3.6.
 *
 * El analyzer interpreta los datos reales del ComplianceEngine; NO recalcula
 * score, NO consulta MongoDB y NO duplica la lógica del provider.
 */

const analyzer = new MedicalAbsenteeismStandardAnalyzer();

function buildContext(
  moduleCompliance: { module: string; compliance: number },
  findings: Array<{ id: string; title: string; description: string; priority: string }>,
): StandardAnalysisContext {
  return {
    standardCode: '3.3.6',
    moduleCompliance: { ...moduleCompliance, level: 'EXCELLENT', lastUpdated: new Date().toISOString() },
    findings: findings.map((f) => ({
      ...f,
      module: 'medical-absenteeism',
      status: 'OPEN',
      responsible: '',
      dueDate: '',
      createdAt: new Date().toISOString(),
    })),
    evidence: [],
  } as unknown as StandardAnalysisContext;
}

describe('FASE 35E-2 — MedicalAbsenteeismStandardAnalyzer (3.3.6)', () => {
  it('supports: solo 3.3.6', () => {
    assert.equal(analyzer.supports('3.3.6'), true);
    assert.equal(analyzer.supports('3.3.5'), false);
    assert.equal(analyzer.supports('3.2.1'), false);
  });

  it('getModule: medical-absenteeism', () => {
    assert.equal(analyzer.getModule(), 'medical-absenteeism');
  });

  it('NO_DATA (sin denominador) → análisis orientado a cargar el denominador', () => {
    const result = analyzer.analyze(
      buildContext({ module: 'medical-absenteeism', compliance: 0 }, [
        {
          id: 'medical-absenteeism-no-denominator',
          title: 'No existe denominador de días de trabajo programados para el período',
          description: 'sin registro',
          priority: 'HIGH',
        },
      ]),
    );
    assert.ok(result.summary.includes('días de trabajo programados'));
    assert.equal(result.keyIssues[0].priority, 'HIGH');
  });

  it('zero absences → keyIssue de posible subregistro', () => {
    const result = analyzer.analyze(
      buildContext({ module: 'medical-absenteeism', compliance: 100 }, [
        {
          id: 'medical-absenteeism-zero-absences',
          title: '0 días de ausencia médica registrados en el período',
          description: 'cero válido',
          priority: 'MEDIUM',
        },
      ]),
    );
    const issue = result.keyIssues.find((i) => i.id === 'medical-absenteeism-zero-absences');
    assert.ok(issue, 'issue presente');
    assert.ok(issue.impact.includes('subregistro'));
  });

  it('unclassified records → keyIssue de trazabilidad', () => {
    const result = analyzer.analyze(
      buildContext({ module: 'medical-absenteeism', compliance: 80 }, [
        {
          id: 'medical-absenteeism-unclassified-records',
          title: '2 registro(s) sin clasificación',
          description: 'sin señal',
          priority: 'LOW',
        },
      ]),
    );
    const issue = result.keyIssues.find((i) => i.id === 'medical-absenteeism-unclassified-records');
    assert.ok(issue);
  });

  it('cross-period records → keyIssue de atribución mensual', () => {
    const result = analyzer.analyze(
      buildContext({ module: 'medical-absenteeism', compliance: 100 }, [
        {
          id: 'medical-absenteeism-cross-period',
          title: '1 ausencia cruza los límites',
          description: 'cross month',
          priority: 'LOW',
        },
      ]),
    );
    const issue = result.keyIssues.find((i) => i.id === 'medical-absenteeism-cross-period');
    assert.ok(issue);
  });

  it('summary ≥ 90: medición sólida', () => {
    const result = analyzer.analyze(buildContext({ module: 'medical-absenteeism', compliance: 100 }, []));
    assert.ok(result.summary.includes('100%'));
    assert.ok(result.summary.includes('3.3.6'));
  });

  it('summary 50–89: avanza con brechas', () => {
    const result = analyzer.analyze(
      buildContext({ module: 'medical-absenteeism', compliance: 70 }, [
        {
          id: 'medical-absenteeism-unclassified-records',
          title: 'Registros sin clasificación',
          description: '',
          priority: 'LOW',
        },
      ]),
    );
    assert.ok(result.summary.includes('70%'));
  });

  it('summary < 50: requiere atención', () => {
    const result = analyzer.analyze(
      buildContext({ module: 'medical-absenteeism', compliance: 30 }, [
        {
          id: 'medical-absenteeism-unclassified-records',
          title: 'Muchos registros sin clasificación',
          description: '',
          priority: 'LOW',
        },
      ]),
    );
    assert.ok(result.summary.includes('30%'));
    assert.ok(result.summary.includes('requiere atención'));
  });

  it('getMetrics: hasValidMeasurement = 1 con medición válida y compliancePercentage real', () => {
    const metrics = analyzer.getMetrics(
      buildContext({ module: 'medical-absenteeism', compliance: 90 }, [
        { id: 'medical-absenteeism-rate', title: 'tasa', description: '', priority: 'MEDIUM' },
      ]),
    );
    assert.equal(metrics.compliancePercentage, 90);
    assert.equal(metrics.hasValidMeasurement, 1);
  });

  it('getMetrics: hasValidMeasurement = 0 en NO_DATA', () => {
    const metrics = analyzer.getMetrics(
      buildContext({ module: 'medical-absenteeism', compliance: 0 }, [
        {
          id: 'medical-absenteeism-no-denominator',
          title: 'sin denominador',
          description: '',
          priority: 'HIGH',
        },
      ]),
    );
    assert.equal(metrics.hasValidMeasurement, 0);
  });

  it('quickWins: máximo 3, con acciones accionables', () => {
    const result = analyzer.analyze(
      buildContext({ module: 'medical-absenteeism', compliance: 60 }, [
        {
          id: 'medical-absenteeism-zero-absences',
          title: 'a',
          description: '',
          priority: 'MEDIUM',
        },
        {
          id: 'medical-absenteeism-unclassified-records',
          title: 'b',
          description: '',
          priority: 'LOW',
        },
        {
          id: 'medical-absenteeism-cross-period',
          title: 'c',
          description: '',
          priority: 'LOW',
        },
      ]),
    );
    assert.ok(result.quickWins.length > 0 && result.quickWins.length <= 3);
    assert.ok(result.nextSteps.length > 0 && result.nextSteps.length <= 3);
  });

  it('no consulta MongoDB: la clase no tiene dependencias de modelos', () => {
    const src = require('fs').readFileSync(
      require('path').resolve(
        __dirname,
        '../../../../../src/modules/compliance-ai/standard-analysis/analyzers/medical-absenteeism-standard.analyzer.ts',
      ),
      'utf-8',
    );
    assert.doesNotMatch(src, /@InjectModel|mongoose|Model</);
  });

  it('no recalcula el score: usa moduleCompliance.compliance tal cual', () => {
    const result = analyzer.analyze(buildContext({ module: 'medical-absenteeism', compliance: 77 }, []));
    assert.ok(result.summary.includes('77%'));
  });
});
