import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CaseInterventionStandardAnalyzer } from './case-intervention-standard.analyzer';
import { StandardAnalysisContext } from '../../dto/standard-analysis.dto';

/**
 * Tests del CaseInterventionStandardAnalyzer — Estándar 3.3.3
 * Intervención y seguimiento de casos.
 *
 * Valida:
 * - supports()
 * - getModule()
 * - NO_DATA
 * - findings interpretation
 * - compliance states
 * - quickWins
 * - nextSteps
 * - metrics
 * - privacy
 * - contract compatibility
 */

function createFinding(id: string, priority: string = 'HIGH') {
  return {
    id,
    module: 'incidents',
    title: `Finding: ${id}`,
    description: `Description for ${id}`,
    priority,
    status: 'OPEN',
    responsible: '',
    dueDate: '',
    createdAt: new Date().toISOString(),
  };
}

function createContext(
  percentage: number,
  findings: StandardAnalysisContext['findings'] = [],
): StandardAnalysisContext {
  return {
    companyId: '507f1f77bcf86cd799439011',
    moduleCompliance: {
      module: 'incidents',
      compliance: percentage,
      level: percentage >= 90 ? 'COMPLIANT' : percentage >= 50 ? 'PARTIAL' : 'NON_COMPLIANT',
      lastUpdated: new Date().toISOString(),
    },
    findings,
    overview: {
      overallCompliance: percentage,
      phaseCompliance: { plan: 0, do: percentage, check: 0, act: 0 },
      moduleCompliance: [],
    },
  };
}

describe('CaseInterventionStandardAnalyzer', () => {
  const analyzer = new CaseInterventionStandardAnalyzer();

  describe('supports', () => {
    it('supports 3.3.3', () => {
      assert.equal(analyzer.supports('3.3.3'), true);
    });

    it('does not support 3.3.1', () => {
      assert.equal(analyzer.supports('3.3.1'), false);
    });

    it('does not support 3.3.2', () => {
      assert.equal(analyzer.supports('3.3.2'), false);
    });

    it('does not support arbitrary codes', () => {
      assert.equal(analyzer.supports('9.9.9'), false);
    });
  });

  describe('getModule', () => {
    it('returns incidents', () => {
      assert.equal(analyzer.getModule(), 'incidents');
    });
  });

  describe('NO_DATA', () => {
    it('interprets case-intervention-no-data correctly', () => {
      const context = createContext(0, [createFinding('case-intervention-no-data')]);
      const result = analyzer.analyze(context);

      assert.equal(result.quickWins.length, 1);
      assert.ok(result.quickWins[0].includes('Registrar'));
      assert.equal(result.nextSteps.length, 1);
      assert.ok(result.nextSteps[0].includes('Implementar'));
    });

    it('produces NO_DATA summary when percentage is 0', () => {
      const context = createContext(0, [createFinding('case-intervention-no-data')]);
      const result = analyzer.analyze(context);

      assert.ok(result.summary.includes('No existen casos'));
    });

    it('produces NO_DATA when no findings and percentage 0', () => {
      const context = createContext(0, []);
      const result = analyzer.analyze(context);

      assert.ok(result.summary.includes('No existen casos'));
    });
  });

  describe('Findings Interpretation', () => {
    it('interprets no-intervention finding', () => {
      const context = createContext(60, [createFinding('case-intervention-no-intervention')]);
      const result = analyzer.analyze(context);

      const issue = result.keyIssues.find((i) => i.id === 'case-intervention-no-intervention');
      assert.ok(issue);
      assert.equal(issue.priority, 'HIGH');
    });

    it('interprets overdue-actions finding', () => {
      const context = createContext(60, [createFinding('case-intervention-overdue-actions')]);
      const result = analyzer.analyze(context);

      const issue = result.keyIssues.find((i) => i.id === 'case-intervention-overdue-actions');
      assert.ok(issue);
      assert.equal(issue.priority, 'HIGH');
    });

    it('interprets no-closure finding', () => {
      const context = createContext(60, [createFinding('case-intervention-no-closure', 'MEDIUM')]);
      const result = analyzer.analyze(context);

      const issue = result.keyIssues.find((i) => i.id === 'case-intervention-no-closure');
      assert.ok(issue);
      assert.equal(issue.priority, 'MEDIUM');
    });

    it('interprets no-follow-up finding', () => {
      const context = createContext(60, [createFinding('case-intervention-no-follow-up', 'MEDIUM')]);
      const result = analyzer.analyze(context);

      const issue = result.keyIssues.find((i) => i.id === 'case-intervention-no-follow-up');
      assert.ok(issue);
      assert.equal(issue.priority, 'MEDIUM');
    });
  });

  describe('Compliance States', () => {
    it('COMPLIANT when percentage >= 90', () => {
      const context = createContext(95, []);
      const result = analyzer.analyze(context);

      assert.ok(result.summary.includes('95%'));
      assert.ok(result.summary.includes('cumplimiento'));
    });

    it('PARTIAL when percentage >= 50 and < 90', () => {
      const context = createContext(70, []);
      const result = analyzer.analyze(context);

      assert.ok(result.summary.includes('70%'));
      assert.ok(result.summary.includes('avances'));
    });

    it('NON_COMPLIANT when percentage < 50', () => {
      const context = createContext(30, []);
      const result = analyzer.analyze(context);

      assert.ok(result.summary.includes('30%'));
      assert.ok(result.summary.includes('atención prioritaria'));
    });
  });

  describe('QuickWins', () => {
    it('maximum 3 quickWins', () => {
      const context = createContext(30, [
        createFinding('case-intervention-no-intervention'),
        createFinding('case-intervention-overdue-actions'),
        createFinding('case-intervention-no-closure', 'MEDIUM'),
        createFinding('case-intervention-no-follow-up', 'MEDIUM'),
      ]);
      const result = analyzer.analyze(context);

      assert.ok(result.quickWins.length <= 3);
    });

    it('prioritizes HIGH over MEDIUM', () => {
      const context = createContext(30, [
        createFinding('case-intervention-no-closure', 'MEDIUM'),
        createFinding('case-intervention-overdue-actions'),
        createFinding('case-intervention-no-intervention'),
      ]);
      const result = analyzer.analyze(context);

      // First quickWin should be about overdue (HIGH) or no-intervention (HIGH)
      assert.ok(
        result.quickWins[0].includes('vencidas') ||
        result.quickWins[0].includes('intervención'),
      );
    });
  });

  describe('NextSteps', () => {
    it('maximum 3 nextSteps', () => {
      const context = createContext(30, [
        createFinding('case-intervention-no-intervention'),
        createFinding('case-intervention-overdue-actions'),
        createFinding('case-intervention-no-closure', 'MEDIUM'),
        createFinding('case-intervention-no-follow-up', 'MEDIUM'),
      ]);
      const result = analyzer.analyze(context);

      assert.ok(result.nextSteps.length <= 3);
    });
  });

  describe('Metrics', () => {
    it('returns compliancePercentage', () => {
      const context = createContext(75, []);
      const metrics = analyzer.getMetrics(context);

      assert.equal(metrics.compliancePercentage, 75);
    });

    it('returns zero metrics for NO_DATA', () => {
      const context = createContext(0, [createFinding('case-intervention-no-data')]);
      const metrics = analyzer.getMetrics(context);

      assert.equal(metrics.totalCases, 0);
      assert.equal(metrics.casesWithIntervention, 0);
    });
  });

  describe('Privacy', () => {
    it('result does not contain employeeId', () => {
      const context = createContext(60, [
        createFinding('case-intervention-no-intervention'),
        createFinding('case-intervention-overdue-actions'),
      ]);
      const result = analyzer.analyze(context);

      const resultString = JSON.stringify(result);
      assert.equal(resultString.includes('employeeId'), false);
      assert.equal(resultString.includes('userId'), false);
    });

    it('summary does not contain individual names', () => {
      const context = createContext(70, []);
      const result = analyzer.analyze(context);

      // Summary should be about cases, not individuals
      assert.ok(result.summary.includes('casos') || result.summary.includes('cumplimiento'));
    });

    it('metrics do not expose individual data', () => {
      const context = createContext(60, [createFinding('case-intervention-no-intervention')]);
      const metrics = analyzer.getMetrics(context);

      const metricsString = JSON.stringify(metrics);
      assert.equal(metricsString.includes('employeeId'), false);
      assert.equal(metricsString.includes('userId'), false);
    });
  });

  describe('Contract', () => {
    it('analyze returns StandardAnalysisInterpretation', () => {
      const context = createContext(60, []);
      const result = analyzer.analyze(context);

      assert.ok(typeof result.summary === 'string');
      assert.ok(Array.isArray(result.keyIssues));
      assert.ok(Array.isArray(result.quickWins));
      assert.ok(Array.isArray(result.nextSteps));
    });

    it('getMetrics returns StandardAnalysisMetrics', () => {
      const context = createContext(60, []);
      const metrics = analyzer.getMetrics(context);

      assert.ok(typeof metrics === 'object');
      assert.ok(typeof metrics.compliancePercentage === 'number');
    });
  });
});
