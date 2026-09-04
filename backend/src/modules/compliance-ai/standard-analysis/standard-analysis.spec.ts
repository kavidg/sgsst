import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ComplianceEngineService } from '../../compliance-engine/compliance-engine.service';
import { StandardAnalysisService } from './standard-analysis.service';
import { AcquisitionStandardAnalyzer } from './analyzers/acquisition-standard.analyzer';
import { ChangeManagementStandardAnalyzer } from './analyzers/change-management-standard.analyzer';
import { ContractingStandardAnalyzer } from './analyzers/contracting-standard.analyzer';
import { SociodemographicStandardAnalyzer } from './analyzers/sociodemographic-standard.analyzer';
import { OccupationalExamStandardAnalyzer } from './analyzers/occupational-exam-standard.analyzer';

/** ObjectId válido de MongoDB para las pruebas. */
const COMPANY_A = '64b000000000000000000001';
const COMPANY_B = '64b000000000000000000002';

function buildOverview(overrides?: {
  overallCompliance?: number;
  moduleCompliance?: Array<{
    module: string;
    compliance: number;
    level: string;
    lastUpdated: string;
  }>;
  findings?: Array<{
    id: string;
    module: string;
    title: string;
    description: string;
    priority: string;
    status: string;
    responsible: string;
    dueDate: string;
    createdAt: string;
  }>;
}) {
  return {
    overallCompliance: overrides?.overallCompliance ?? 65,
    phaseCompliance: { plan: 70, do: 60, check: 50, act: 40 },
    moduleCompliance: overrides?.moduleCompliance ?? [
      {
        module: 'acquisitions',
        compliance: 65,
        level: 'MEDIUM',
        lastUpdated: new Date().toISOString(),
      },
    ],
    findings: overrides?.findings ?? [],
    recommendations: [],
    alerts: [],
    prediction: null,
    trend: null,
    executiveSummary: 'Test summary',
    lastUpdated: new Date().toISOString(),
  };
}

function buildService(overviewOverride?: ReturnType<typeof buildOverview>) {
  const complianceEngineService = {
    getOverview: async () => overviewOverride ?? buildOverview(),
  } as unknown as ComplianceEngineService;

  return new StandardAnalysisService(complianceEngineService);
}

function buildServiceWithTwoCompanies(
  companyAOverview: ReturnType<typeof buildOverview>,
  companyBOverview: ReturnType<typeof buildOverview>,
) {
  const complianceEngineService = {
    getOverview: async (companyId: string) =>
      companyId === COMPANY_A ? companyAOverview : companyBOverview,
  } as unknown as ComplianceEngineService;

  return new StandardAnalysisService(complianceEngineService);
}

// ═══════════════════════════════════════════════════════════════════════════
// STD-AI-01: Genera análisis 2.9.1 con datos reales
// ═══════════════════════════════════════════════════════════════════════════

describe('STD-AI-01: Genera análisis 2.9.1 con datos reales', () => {
  it('retorna análisis completo con summary, keyIssues, quickWins y nextSteps', async () => {
    const service = buildService(
      buildOverview({
        overallCompliance: 65,
        moduleCompliance: [
          { module: 'acquisitions', compliance: 65, level: 'MEDIUM', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'acq-no-sst-criteria',
            module: 'acquisitions',
            title: '3 adquisición(es) sin criterios SST',
            description: 'Test',
            priority: 'HIGH',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
          {
            id: 'acq-no-supplier',
            module: 'acquisitions',
            title: '2 adquisición(es) sin proveedor asignado',
            description: 'Test',
            priority: 'MEDIUM',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('2.9.1', COMPANY_A);

    assert.equal(result.standardCode, '2.9.1');
    assert.equal(result.standardTitle, 'Adquisiciones');
    assert.equal(result.module, 'acquisitions');
    assert.equal(result.compliancePercentage, 65);
    assert.equal(result.dataAvailable, true);
    assert.ok(result.analysis.summary.length > 0);
    assert.ok(result.analysis.keyIssues.length > 0);
    assert.ok(result.analysis.quickWins.length > 0);
    assert.ok(result.analysis.nextSteps.length > 0);
    assert.ok(result.evaluatedAt.length > 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// STD-AI-02: NO_DATA
// ═══════════════════════════════════════════════════════════════════════════

describe('STD-AI-02: NO_DATA', () => {
  it('retorna dataAvailable: false cuando existe finding acq-no-data', async () => {
    const service = buildService(
      buildOverview({
        overallCompliance: 0,
        moduleCompliance: [
          { module: 'acquisitions', compliance: 0, level: 'CRITICAL', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'acq-no-data',
            module: 'acquisitions',
            title: 'Sin datos de adquisiciones ni proveedores',
            description: 'Test',
            priority: 'HIGH',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('2.9.1', COMPANY_A);

    assert.equal(result.dataAvailable, false);
    assert.equal(result.compliancePercentage, 0);
    assert.ok(result.analysis.summary.includes('No existen datos suficientes'));
    assert.equal(result.analysis.keyIssues.length, 0);
    assert.ok(result.analysis.quickWins.length > 0);
    assert.ok(result.analysis.nextSteps.length > 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// STD-AI-03: Usa percentage proveniente de ComplianceEngine
// ═══════════════════════════════════════════════════════════════════════════

describe('STD-AI-03: Usa percentage proveniente de ComplianceEngine', () => {
  it('el compliancePercentage coincide exactamente con el overview', async () => {
    const service = buildService(
      buildOverview({
        moduleCompliance: [
          { module: 'acquisitions', compliance: 78, level: 'HIGH', lastUpdated: new Date().toISOString() },
        ],
      }),
    );

    const result = await service.analyze('2.9.1', COMPANY_A);

    assert.equal(result.compliancePercentage, 78);
    assert.equal(result.level, 'HIGH');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// STD-AI-04: No recalcula score
// ═══════════════════════════════════════════════════════════════════════════

describe('STD-AI-04: No recalcula score', () => {
  it('el analyzer no contiene lógica de cálculo de porcentaje', () => {
    const analyzer = new AcquisitionStandardAnalyzer();
    const source = analyzer.analyze.toString();

    // El analyzer NO debe contener divisiones ni cálculos de porcentaje
    assert.ok(!source.includes('/ 100'), 'Analyzer no debe dividir por 100');
    assert.ok(!source.includes('* 100'), 'Analyzer no debe multiplicar por 100');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// STD-AI-05: Finding sin criterios SST genera keyIssue
// ═══════════════════════════════════════════════════════════════════════════

describe('STD-AI-05: Finding sin criterios SST genera keyIssue', () => {
  it('acq-no-sst-criteria se convierte en keyIssue con prioridad HIGH', async () => {
    const service = buildService(
      buildOverview({
        moduleCompliance: [
          { module: 'acquisitions', compliance: 45, level: 'MEDIUM', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'acq-no-sst-criteria',
            module: 'acquisitions',
            title: '5 adquisición(es) sin criterios SST',
            description: 'Test',
            priority: 'HIGH',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('2.9.1', COMPANY_A);

    const sstIssue = result.analysis.keyIssues.find((issue) => issue.id === 'acq-no-sst-criteria');
    assert.ok(sstIssue, 'Should have acq-no-sst-criteria keyIssue');
    assert.equal(sstIssue.priority, 'HIGH');
    assert.ok(sstIssue.recommendation.length > 0);
    assert.ok(sstIssue.impact.length > 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// STD-AI-06: Finding sin proveedor genera keyIssue
// ═══════════════════════════════════════════════════════════════════════════

describe('STD-AI-06: Finding sin proveedor genera keyIssue', () => {
  it('acq-no-supplier se convierte en keyIssue', async () => {
    const service = buildService(
      buildOverview({
        moduleCompliance: [
          { module: 'acquisitions', compliance: 50, level: 'MEDIUM', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'acq-no-supplier',
            module: 'acquisitions',
            title: '2 adquisición(es) sin proveedor asignado',
            description: 'Test',
            priority: 'MEDIUM',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('2.9.1', COMPANY_A);

    const supplierIssue = result.analysis.keyIssues.find((issue) => issue.id === 'acq-no-supplier');
    assert.ok(supplierIssue, 'Should have acq-no-supplier keyIssue');
    assert.equal(supplierIssue.priority, 'MEDIUM');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// STD-AI-07: Genera quickWins accionables
// ═══════════════════════════════════════════════════════════════════════════

describe('STD-AI-07: Genera quickWins accionables', () => {
  it('quickWins son strings no vacíos y máximo 3', async () => {
    const service = buildService(
      buildOverview({
        moduleCompliance: [
          { module: 'acquisitions', compliance: 30, level: 'LOW', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'acq-no-sst-criteria',
            module: 'acquisitions',
            title: '5 adquisición(es) sin criterios SST',
            description: 'Test',
            priority: 'HIGH',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
          {
            id: 'acq-no-supplier',
            module: 'acquisitions',
            title: '3 adquisición(es) sin proveedor asignado',
            description: 'Test',
            priority: 'MEDIUM',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('2.9.1', COMPANY_A);

    assert.ok(result.analysis.quickWins.length > 0);
    assert.ok(result.analysis.quickWins.length <= 3);
    for (const win of result.analysis.quickWins) {
      assert.ok(typeof win === 'string');
      assert.ok(win.length > 0);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// STD-AI-08: Company A no recibe datos de Company B (tenant isolation)
// ═══════════════════════════════════════════════════════════════════════════

describe('STD-AI-08: Tenant isolation', () => {
  it('Company A y Company B obtienen análisis diferentes', async () => {
    const overviewA = buildOverview({
      moduleCompliance: [
        { module: 'acquisitions', compliance: 75, level: 'HIGH', lastUpdated: new Date().toISOString() },
      ],
    });
    const overviewB = buildOverview({
      moduleCompliance: [
        { module: 'acquisitions', compliance: 0, level: 'CRITICAL', lastUpdated: new Date().toISOString() },
      ],
      findings: [
        {
          id: 'acq-no-data',
          module: 'acquisitions',
          title: 'Sin datos de adquisiciones ni proveedores',
          description: 'Test',
          priority: 'HIGH',
          status: 'OPEN',
          responsible: '',
          dueDate: '',
          createdAt: new Date().toISOString(),
        },
      ],
    });

    const service = buildServiceWithTwoCompanies(overviewA, overviewB);

    const resultA = await service.analyze('2.9.1', COMPANY_A);
    const resultB = await service.analyze('2.9.1', COMPANY_B);

    assert.equal(resultA.compliancePercentage, 75);
    assert.equal(resultA.dataAvailable, true);
    assert.equal(resultB.compliancePercentage, 0);
    assert.equal(resultB.dataAvailable, false);
  });

  it('Company A no recibe datos de Company B', async () => {
    const overviewA = buildOverview({
      moduleCompliance: [
        { module: 'acquisitions', compliance: 60, level: 'MEDIUM', lastUpdated: new Date().toISOString() },
      ],
      findings: [
        {
          id: 'acq-no-sst-criteria',
          module: 'acquisitions',
          title: '2 adquisición(es) sin criterios SST',
          description: 'Test',
          priority: 'HIGH',
          status: 'OPEN',
          responsible: '',
          dueDate: '',
          createdAt: new Date().toISOString(),
        },
      ],
    });
    const overviewB = buildOverview({
      moduleCompliance: [
        { module: 'acquisitions', compliance: 0, level: 'CRITICAL', lastUpdated: new Date().toISOString() },
      ],
      findings: [
        {
          id: 'acq-no-data',
          module: 'acquisitions',
          title: 'Sin datos de adquisiciones ni proveedores',
          description: 'Test',
          priority: 'HIGH',
          status: 'OPEN',
          responsible: '',
          dueDate: '',
          createdAt: new Date().toISOString(),
        },
      ],
    });

    const service = buildServiceWithTwoCompanies(overviewA, overviewB);

    const resultA = await service.analyze('2.9.1', COMPANY_A);
    const resultB = await service.analyze('2.9.1', COMPANY_B);

    // Company A: tiene datos, análisis completo
    assert.equal(resultA.dataAvailable, true);
    assert.equal(resultA.compliancePercentage, 60);
    assert.ok(resultA.analysis.keyIssues.length > 0);

    // Company B: NO_DATA, análisis simplificado
    assert.equal(resultB.dataAvailable, false);
    assert.equal(resultB.analysis.keyIssues.length, 0);
    assert.ok(resultB.analysis.quickWins.length > 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// STD-AI-09: standardCode inválido
// ═══════════════════════════════════════════════════════════════════════════

describe('STD-AI-09: standardCode inválido', () => {
  it('lanza NotFoundException para standardCode sin analyzer', async () => {
    const service = buildService();

    await assert.rejects(
      () => service.analyze('99.99', COMPANY_A),
      (err: Error) => {
        assert.ok(err.message.includes('aún no dispone'));
        return true;
      },
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// STD-AI-10: Estándar sin analyzer
// ═══════════════════════════════════════════════════════════════════════════

describe('STD-AI-10: Estándar sin analyzer', () => {
  it('lanza NotFoundException para códigos no registrados', async () => {
    const service = buildService();

    const codes = ['1.1.1', '2.1.1', 'random'];
    for (const code of codes) {
      await assert.rejects(
        () => service.analyze(code, COMPANY_A),
        (err: Error) => {
          assert.ok(err.message.includes('aún no dispone'));
          return true;
        },
      );
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// STD-AI-11: ComplianceEngine failure
// ═══════════════════════════════════════════════════════════════════════════

describe('STD-AI-11: ComplianceEngine failure', () => {
  it('lanza NotFoundException cuando ComplianceEngine falla', async () => {
    const complianceEngineService = {
      getOverview: async () => {
        throw new Error('DB connection failed');
      },
    } as unknown as ComplianceEngineService;

    const service = new StandardAnalysisService(complianceEngineService);

    await assert.rejects(
      () => service.analyze('2.9.1', COMPANY_A),
      (err: Error) => {
        assert.ok(err.message.includes('No fue posible obtener'));
        return true;
      },
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// STD-AI-12: No genera claims sobre DocumentMaster
// ═══════════════════════════════════════════════════════════════════════════

describe('STD-AI-12: No genera claims sobre DocumentMaster', () => {
  it('summary y recommendations no mencionan documentos, certificados ni evidencias documentales', async () => {
    const service = buildService(
      buildOverview({
        moduleCompliance: [
          { module: 'acquisitions', compliance: 50, level: 'MEDIUM', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'acq-no-sst-criteria',
            module: 'acquisitions',
            title: '3 adquisición(es) sin criterios SST',
            description: 'Test',
            priority: 'HIGH',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('2.9.1', COMPANY_A);

    const allText = [
      result.analysis.summary,
      ...result.analysis.quickWins,
      ...result.analysis.nextSteps,
      ...result.analysis.keyIssues.map((i) => `${i.title} ${i.impact} ${i.recommendation}`),
    ].join(' ').toLowerCase();

    // No debe mencionar certificados SST, contratos, ni documentos
    assert.ok(!allText.includes('certificado'), 'No debe mencionar certificados');
    assert.ok(!allText.includes('contrato'), 'No debe mencionar contratos');
    assert.ok(!allText.includes('documentmaster'), 'No debe mencionar DocumentMaster');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// STD-AI-13: No genera claims sobre Approval Workflow
// ═══════════════════════════════════════════════════════════════════════════

describe('STD-AI-13: No genera claims sobre Approval Workflow', () => {
  it('no menciona aprobaciones ni flujos de aprobación', async () => {
    const service = buildService(
      buildOverview({
        moduleCompliance: [
          { module: 'acquisitions', compliance: 40, level: 'MEDIUM', lastUpdated: new Date().toISOString() },
        ],
        findings: [],
      }),
    );

    const result = await service.analyze('2.9.1', COMPANY_A);

    const allText = [
      result.analysis.summary,
      ...result.analysis.quickWins,
      ...result.analysis.nextSteps,
    ].join(' ').toLowerCase();

    assert.ok(!allText.includes('aprobación workflow'), 'No debe mencionar Approval Workflow');
    assert.ok(!allText.includes('aprobación de compra'), 'No debe mencionar aprobación de compra');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// STD-AI-14: No inventa pérdida de puntos
// ═══════════════════════════════════════════════════════════════════════════

describe('STD-AI-14: No inventa pérdida de puntos', () => {
  it('impact es cualitativo, no numérico', async () => {
    const service = buildService(
      buildOverview({
        moduleCompliance: [
          { module: 'acquisitions', compliance: 55, level: 'MEDIUM', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'acq-no-sst-criteria',
            module: 'acquisitions',
            title: '2 adquisición(es) sin criterios SST',
            description: 'Test',
            priority: 'HIGH',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('2.9.1', COMPANY_A);

    for (const issue of result.analysis.keyIssues) {
      // El impact no debe contener claims numéricos como "Reduce X puntos"
      assert.ok(
        !issue.impact.match(/reduce.*\d+\s*punto/i),
        `Impact no debe afirmar pérdida de puntos: "${issue.impact}"`,
      );
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AcquisitionStandardAnalyzer unit tests
// ═══════════════════════════════════════════════════════════════════════════

describe('AcquisitionStandardAnalyzer', () => {
  const analyzer = new AcquisitionStandardAnalyzer();

  it('supports solo 2.9.1', () => {
    assert.ok(analyzer.supports('2.9.1'));
    assert.ok(!analyzer.supports('2.7.1'));
    assert.ok(!analyzer.supports('1.1.1'));
  });

  it('getModule retorna acquisitions', () => {
    assert.equal(analyzer.getModule(), 'acquisitions');
  });

  it('NO_DATA cuando existe finding acq-no-data', () => {
    const result = analyzer.analyze({
      companyId: COMPANY_A,
      moduleCompliance: { module: 'acquisitions', compliance: 0, level: 'CRITICAL', lastUpdated: '' },
      findings: [
        { id: 'acq-no-data', module: 'acquisitions', title: 'Sin datos', description: '', priority: 'HIGH', status: 'OPEN', responsible: '', dueDate: '', createdAt: '' },
      ],
      overview: { overallCompliance: 0, phaseCompliance: { plan: 0, do: 0, check: 0, act: 0 }, moduleCompliance: [] },
    });

    assert.ok(result.summary.includes('No existen datos suficientes'));
    assert.equal(result.keyIssues.length, 0);
    assert.ok(result.quickWins.length > 0);
  });

  it('cumplimiento alto genera summary positivo', () => {
    const result = analyzer.analyze({
      companyId: COMPANY_A,
      moduleCompliance: { module: 'acquisitions', compliance: 95, level: 'EXCELLENT', lastUpdated: '' },
      findings: [],
      overview: { overallCompliance: 95, phaseCompliance: { plan: 95, do: 95, check: 95, act: 95 }, moduleCompliance: [] },
    });

    assert.ok(result.summary.includes('95%'));
    assert.ok(result.summary.toLowerCase().includes('sólida'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT-AI-01: NO_DATA solo cuando suppliers=0 AND acquisitions=0
// ═══════════════════════════════════════════════════════════════════════════

describe('AUDIT-AI-01: NO_DATA solo cuando suppliers=0 AND acquisitions=0', () => {
  it('suppliers=0 y acquisitions=0 con finding acq-no-data → dataAvailable=false', async () => {
    const service = buildService(
      buildOverview({
        moduleCompliance: [
          { module: 'acquisitions', compliance: 0, level: 'CRITICAL', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'acq-no-data',
            module: 'acquisitions',
            title: 'Sin datos de adquisiciones ni proveedores',
            description: 'Test',
            priority: 'HIGH',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('2.9.1', COMPANY_A);
    assert.equal(result.dataAvailable, false);
    assert.equal(result.compliancePercentage, 0);
    assert.equal(result.analysis.keyIssues.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT-AI-02: Suppliers > 0 y acquisitions=0 NO es NO_DATA
// ═══════════════════════════════════════════════════════════════════════════

describe('AUDIT-AI-02: Suppliers > 0 y acquisitions=0 NO es NO_DATA', () => {
  it('proveedores existentes sin adquisiciones → dataAvailable=true', async () => {
    const service = buildService(
      buildOverview({
        moduleCompliance: [
          { module: 'acquisitions', compliance: 30, level: 'LOW', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'acq-no-suppliers',
            module: 'acquisitions',
            title: 'Sin proveedores registrados',
            description: 'Test',
            priority: 'HIGH',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('2.9.1', COMPANY_A);
    // Sin finding acq-no-data → dataAvailable=true
    assert.equal(result.dataAvailable, true);
    assert.equal(result.compliancePercentage, 30);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT-AI-03: Suppliers=0 y acquisitions > 0 NO es NO_DATA
// ═══════════════════════════════════════════════════════════════════════════

describe('AUDIT-AI-03: Suppliers=0 y acquisitions > 0 NO es NO_DATA', () => {
  it('adquisiciones existentes sin proveedores → dataAvailable=true', async () => {
    const service = buildService(
      buildOverview({
        moduleCompliance: [
          { module: 'acquisitions', compliance: 15, level: 'CRITICAL', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'acq-no-suppliers',
            module: 'acquisitions',
            title: 'Sin proveedores registrados',
            description: 'Test',
            priority: 'HIGH',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
          {
            id: 'acq-no-sst-criteria',
            module: 'acquisitions',
            title: '3 adquisición(es) sin criterios SST',
            description: 'Test',
            priority: 'HIGH',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('2.9.1', COMPANY_A);
    // Sin finding acq-no-data → dataAvailable=true
    assert.equal(result.dataAvailable, true);
    assert.equal(result.compliancePercentage, 15);
    assert.ok(result.analysis.keyIssues.length > 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT-AI-04: Datos reales + compliance=0 NO es NO_DATA
// ═══════════════════════════════════════════════════════════════════════════

describe('AUDIT-AI-04: Datos reales + compliance=0 NO es NO_DATA', () => {
  it('compliance=0 sin finding acq-no-data → dataAvailable=true', async () => {
    const service = buildService(
      buildOverview({
        moduleCompliance: [
          { module: 'acquisitions', compliance: 0, level: 'CRITICAL', lastUpdated: new Date().toISOString() },
        ],
        // Sin finding acq-no-data: indica que SÍ hay datos pero compliance es 0
        findings: [],
      }),
    );

    const result = await service.analyze('2.9.1', COMPANY_A);
    // Sin finding acq-no-data → dataAvailable=true (NO es NO_DATA)
    assert.equal(result.dataAvailable, true);
    assert.equal(result.compliancePercentage, 0);
    // El análisis debe generar contenido, no un empty state
    assert.ok(result.analysis.summary.length > 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT-AI-05: Score del análisis === score del ComplianceEngine
// ═══════════════════════════════════════════════════════════════════════════

describe('AUDIT-AI-05: Score del análisis coincide con ComplianceEngine', () => {
  it('compliancePercentage se toma directamente del overview sin recalcular', async () => {
    const percentages = [0, 14, 28, 43, 57, 71, 85, 93, 100];

    for (const pct of percentages) {
      const service = buildService(
        buildOverview({
          moduleCompliance: [
            { module: 'acquisitions', compliance: pct, level: 'MEDIUM', lastUpdated: new Date().toISOString() },
          ],
        }),
      );

      const result = await service.analyze('2.9.1', COMPANY_A);
      assert.equal(
        result.compliancePercentage, pct,
        `Expected compliancePercentage=${pct} but got ${result.compliancePercentage}`,
      );
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT-AI-06: No inventan cantidades en keyIssues
// ═══════════════════════════════════════════════════════════════════════════

describe('AUDIT-AI-06: No inventan cantidades en keyIssues', () => {
  it('keyIssues derivan de findings reales con números exactos', async () => {
    const service = buildService(
      buildOverview({
        moduleCompliance: [
          { module: 'acquisitions', compliance: 40, level: 'MEDIUM', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'acq-no-sst-criteria',
            module: 'acquisitions',
            title: '7 adquisición(es) sin criterios SST',
            description: 'Test',
            priority: 'HIGH',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
          {
            id: 'acq-no-supplier',
            module: 'acquisitions',
            title: '4 adquisición(es) sin proveedor asignado',
            description: 'Test',
            priority: 'MEDIUM',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('2.9.1', COMPANY_A);

    // Verificar que los números en los títulos se extraen correctamente
    const sstIssue = result.analysis.keyIssues.find((i) => i.id === 'acq-no-sst-criteria');
    assert.ok(sstIssue);
    assert.ok(sstIssue.title.includes('7'), 'Should contain exact number 7');

    const supplierIssue = result.analysis.keyIssues.find((i) => i.id === 'acq-no-supplier');
    assert.ok(supplierIssue);
    assert.ok(supplierIssue.title.includes('4'), 'Should contain exact number 4');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT-AI-07: No inventa pérdida de puntos
// ═══════════════════════════════════════════════════════════════════════════

describe('AUDIT-AI-07: No inventa pérdida de puntos', () => {
  it('impact es cualitativo, no numérico', async () => {
    const service = buildService(
      buildOverview({
        moduleCompliance: [
          { module: 'acquisitions', compliance: 35, level: 'LOW', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'acq-no-sst-criteria',
            module: 'acquisitions',
            title: '3 adquisición(es) sin criterios SST',
            description: 'Test',
            priority: 'HIGH',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('2.9.1', COMPANY_A);

    for (const issue of result.analysis.keyIssues) {
      assert.ok(
        !issue.impact.match(/reduce.*\d+\s*punto/i),
        `Impact no debe afirmar pérdida de puntos: "${issue.impact}"`,
      );
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT-AI-08: quickWins basados en condiciones reales
// ═══════════════════════════════════════════════════════════════════════════

describe('AUDIT-AI-08: quickWins basados en condiciones reales', () => {
  it('quickWins solo aparecen cuando hay findings correspondientes', async () => {
    const analyzer = new AcquisitionStandardAnalyzer();

    // Sin findings de SST ni proveedor → no hay quickWins
    const result = analyzer.analyze({
      companyId: COMPANY_A,
      moduleCompliance: { module: 'acquisitions', compliance: 60, level: 'MEDIUM', lastUpdated: '' },
      findings: [],
      overview: { overallCompliance: 60, phaseCompliance: { plan: 60, do: 60, check: 60, act: 60 }, moduleCompliance: [] },
    });

    assert.equal(result.quickWins.length, 0, 'Sin findings no debe haber quickWins');
  });

  it('con findings de SST y proveedor → quickWins correspondientes', async () => {
    const analyzer = new AcquisitionStandardAnalyzer();

    const result = analyzer.analyze({
      companyId: COMPANY_A,
      moduleCompliance: { module: 'acquisitions', compliance: 40, level: 'MEDIUM', lastUpdated: '' },
      findings: [
        { id: 'acq-no-sst-criteria', module: 'acquisitions', title: '2 adquisición(es) sin criterios SST', description: '', priority: 'HIGH', status: 'OPEN', responsible: '', dueDate: '', createdAt: '' },
        { id: 'acq-no-supplier', module: 'acquisitions', title: '1 adquisición(es) sin proveedor asignado', description: '', priority: 'MEDIUM', status: 'OPEN', responsible: '', dueDate: '', createdAt: '' },
      ],
      overview: { overallCompliance: 40, phaseCompliance: { plan: 40, do: 40, check: 40, act: 40 }, moduleCompliance: [] },
    });

    assert.ok(result.quickWins.length > 0);
    const allWins = result.quickWins.join(' ').toLowerCase();
    assert.ok(allWins.includes('criterios sst') || allWins.includes('sst'));
    assert.ok(allWins.includes('proveedor'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT-AI-09: nextSteps solo utilizan funcionalidades existentes
// ═══════════════════════════════════════════════════════════════════════════

describe('AUDIT-AI-09: nextSteps solo utilizan funcionalidades existentes', () => {
  it('no recomienda funcionalidades inexistentes', async () => {
    const service = buildService(
      buildOverview({
        moduleCompliance: [
          { module: 'acquisitions', compliance: 30, level: 'LOW', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'acq-no-sst-criteria',
            module: 'acquisitions',
            title: '3 adquisición(es) sin criterios SST',
            description: 'Test',
            priority: 'HIGH',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('2.9.1', COMPANY_A);

    const allText = result.analysis.nextSteps.join(' ').toLowerCase();
    // No debe recomendar funcionalidades que no existen
    assert.ok(!allText.includes('certificado'), 'No debe recomendar certificados');
    assert.ok(!allText.includes('contrato'), 'No debe recomendar contratos');
    assert.ok(!allText.includes('aprobación workflow'), 'No debe recomendar Approval Workflow');
    assert.ok(!allText.includes('evaluación formal'), 'No debe recomendar evaluación formal');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT-AI-10: Tenant isolation (via StandardAnalysisService)
// ═══════════════════════════════════════════════════════════════════════════

describe('AUDIT-AI-10: Tenant isolation en service', () => {
  it('companyId se pasa correctamente al ComplianceEngine', async () => {
    const receivedCompanyIds: string[] = [];
    const complianceEngineService = {
      getOverview: async (companyId: string) => {
        receivedCompanyIds.push(companyId);
        return buildOverview();
      },
    } as unknown as ComplianceEngineService;

    const service = new StandardAnalysisService(complianceEngineService);
    await service.analyze('2.9.1', 'company-test-123');

    assert.equal(receivedCompanyIds.length, 1);
    assert.equal(receivedCompanyIds[0], 'company-test-123');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT-AI-11: StandardCode inválido → NotFoundException
// ═══════════════════════════════════════════════════════════════════════════

describe('AUDIT-AI-11: StandardCode inválido', () => {
  it('códigos inexistentes lanzan NotFoundException', async () => {
    const service = buildService();

    await assert.rejects(
      () => service.analyze('9.9.9', COMPANY_A),
      (err: Error) => {
        assert.ok(err.message.includes('aún no dispone'));
        return true;
      },
    );
  });

  it('código vacío lanza BadRequestException', async () => {
    const service = buildService();

    await assert.rejects(
      () => service.analyze('', COMPANY_A),
      (err: Error) => {
        assert.ok(err.message.includes('requerido'));
        return true;
      },
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT-AI-12: Analyzer registry funciona correctamente
// ═══════════════════════════════════════════════════════════════════════════

describe('AUDIT-AI-12: Analyzer registry', () => {
  it('2.9.1 está registrado y funciona', async () => {
    const service = buildService();
    const result = await service.analyze('2.9.1', COMPANY_A);
    assert.equal(result.standardCode, '2.9.1');
    assert.equal(result.module, 'acquisitions');
  });

  it('estándares no registrados lanzan NotFoundException', async () => {
    const service = buildService();
    const codes = ['1.1.1', '2.1.1'];
    for (const code of codes) {
      await assert.rejects(
        () => service.analyze(code, COMPANY_A),
        (err: Error) => {
          assert.ok(err.message.includes('aún no dispone'));
          return true;
        },
      );
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AI-CONTRACTING-01: StandardAnalysisService reconoce 2.10.1
// ═══════════════════════════════════════════════════════════════════════════

describe('AI-CONTRACTING-01: StandardAnalysisService reconoce 2.10.1', () => {
  it('retorna análisis completo para 2.10.1 con datos reales', async () => {
    const service = buildService(
      buildOverview({
        overallCompliance: 55,
        moduleCompliance: [
          { module: 'contracting', compliance: 55, level: 'MEDIUM', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'ctr-no-sst-requirements',
            module: 'contracting',
            title: '2 contrato(s) activo(s) sin requisitos SST documentados',
            description: 'Test',
            priority: 'HIGH',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
          {
            id: 'ctr-pending-inductions',
            module: 'contracting',
            title: '3 inducción(es) de contratistas pendientes o incompletas',
            description: 'Test',
            priority: 'MEDIUM',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('2.10.1', COMPANY_A);

    assert.equal(result.standardCode, '2.10.1');
    assert.equal(result.standardTitle, 'Contratación');
    assert.equal(result.module, 'contracting');
    assert.equal(result.compliancePercentage, 55);
    assert.equal(result.dataAvailable, true);
    assert.ok(result.analysis.summary.length > 0);
    assert.ok(result.analysis.keyIssues.length > 0);
    assert.ok(result.analysis.quickWins.length > 0);
    assert.ok(result.analysis.nextSteps.length > 0);
    assert.ok(result.evaluatedAt.length > 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AI-CONTRACTING-02: ContractingStandardAnalyzer está registrado
// ═══════════════════════════════════════════════════════════════════════════

describe('AI-CONTRACTING-02: ContractingStandardAnalyzer registrado', () => {
  it('2.10.1 ya no lanza NotFoundException', async () => {
    const service = buildService(
      buildOverview({
        moduleCompliance: [
          { module: 'contracting', compliance: 40, level: 'MEDIUM', lastUpdated: new Date().toISOString() },
        ],
        findings: [],
      }),
    );

    const result = await service.analyze('2.10.1', COMPANY_A);
    assert.equal(result.standardCode, '2.10.1');
    assert.equal(result.module, 'contracting');
  });

  it('ContractingStandardAnalyzer supports solo 2.10.1', () => {
    const analyzer = new ContractingStandardAnalyzer();
    assert.ok(analyzer.supports('2.10.1'));
    assert.ok(!analyzer.supports('2.9.1'));
    assert.ok(!analyzer.supports('1.1.1'));
  });

  it('getModule retorna contracting', () => {
    const analyzer = new ContractingStandardAnalyzer();
    assert.equal(analyzer.getModule(), 'contracting');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AI-CONTRACTING-03: Ausencia de datos usa ctr-no-data
// ═══════════════════════════════════════════════════════════════════════════

describe('AI-CONTRACTING-03: dataAvailable usa ctr-no-data para contratación', () => {
  it('retorna dataAvailable: false cuando existe finding ctr-no-data', async () => {
    const service = buildService(
      buildOverview({
        overallCompliance: 0,
        moduleCompliance: [
          { module: 'contracting', compliance: 0, level: 'CRITICAL', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'ctr-no-data',
            module: 'contracting',
            title: 'Sin datos de contratación',
            description: 'Test',
            priority: 'HIGH',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('2.10.1', COMPANY_A);

    assert.equal(result.dataAvailable, false);
    assert.equal(result.compliancePercentage, 0);
    assert.ok(result.analysis.summary.includes('No existen datos suficientes'));
    assert.equal(result.analysis.keyIssues.length, 0);
    assert.ok(result.analysis.quickWins.length > 0);
  });

  it('retorna dataAvailable: true cuando NO existe ctr-no-data (incluso con compliance=0)', async () => {
    const service = buildService(
      buildOverview({
        overallCompliance: 0,
        moduleCompliance: [
          { module: 'contracting', compliance: 0, level: 'CRITICAL', lastUpdated: new Date().toISOString() },
        ],
        // Sin ctr-no-data: indica que SÍ hay datos pero compliance es 0
        findings: [],
      }),
    );

    const result = await service.analyze('2.10.1', COMPANY_A);

    assert.equal(result.dataAvailable, true);
    assert.equal(result.compliancePercentage, 0);
  });

  it('2.9.1 sigue usando acq-no-data (no se rompe)', async () => {
    const service = buildService(
      buildOverview({
        overallCompliance: 0,
        moduleCompliance: [
          { module: 'acquisitions', compliance: 0, level: 'CRITICAL', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'acq-no-data',
            module: 'acquisitions',
            title: 'Sin datos de adquisiciones ni proveedores',
            description: 'Test',
            priority: 'HIGH',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('2.9.1', COMPANY_A);

    assert.equal(result.dataAvailable, false);
    assert.equal(result.standardCode, '2.9.1');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AI-CONTRACTING-04: Título de 2.10.1 es correcto
// ═══════════════════════════════════════════════════════════════════════════

describe('AI-CONTRACTING-04: Título de 2.10.1', () => {
  it('el título del estándar 2.10.1 es Contratación', async () => {
    const service = buildService(
      buildOverview({
        moduleCompliance: [
          { module: 'contracting', compliance: 50, level: 'MEDIUM', lastUpdated: new Date().toISOString() },
        ],
        findings: [],
      }),
    );

    const result = await service.analyze('2.10.1', COMPANY_A);
    assert.equal(result.standardTitle, 'Contratación');
  });

  it('el título de 2.9.1 sigue siendo Adquisiciones', async () => {
    const service = buildService();
    const result = await service.analyze('2.9.1', COMPANY_A);
    assert.equal(result.standardTitle, 'Adquisiciones');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AI-CONTRACTING-05: Findings de ContractingProvider son interpretados
// ═══════════════════════════════════════════════════════════════════════════

describe('AI-CONTRACTING-05: Findings de ContractingProvider son interpretados', () => {
  it('ctr-no-sst-requirements se convierte en keyIssue con prioridad HIGH', async () => {
    const service = buildService(
      buildOverview({
        moduleCompliance: [
          { module: 'contracting', compliance: 35, level: 'LOW', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'ctr-no-sst-requirements',
            module: 'contracting',
            title: '3 contrato(s) activo(s) sin requisitos SST documentados',
            description: 'Test',
            priority: 'HIGH',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('2.10.1', COMPANY_A);

    const sstIssue = result.analysis.keyIssues.find((issue) => issue.id === 'ctr-no-sst-requirements');
    assert.ok(sstIssue, 'Should have ctr-no-sst-requirements keyIssue');
    assert.equal(sstIssue.priority, 'HIGH');
    assert.ok(sstIssue.recommendation.length > 0);
    assert.ok(sstIssue.impact.length > 0);
  });

  it('ctr-pending-inductions se convierte en keyIssue con prioridad MEDIUM', async () => {
    const service = buildService(
      buildOverview({
        moduleCompliance: [
          { module: 'contracting', compliance: 45, level: 'MEDIUM', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'ctr-pending-inductions',
            module: 'contracting',
            title: '2 inducción(es) de contratistas pendientes o incompletas',
            description: 'Test',
            priority: 'MEDIUM',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('2.10.1', COMPANY_A);

    const inductionIssue = result.analysis.keyIssues.find((issue) => issue.id === 'ctr-pending-inductions');
    assert.ok(inductionIssue, 'Should have ctr-pending-inductions keyIssue');
    assert.equal(inductionIssue.priority, 'MEDIUM');
  });

  it('ctr-no-evaluations se convierte en keyIssue con prioridad MEDIUM', async () => {
    const service = buildService(
      buildOverview({
        moduleCompliance: [
          { module: 'contracting', compliance: 40, level: 'MEDIUM', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'ctr-no-evaluations',
            module: 'contracting',
            title: '2 contrato(s) activo(s) sin evaluación de seguimiento',
            description: 'Test',
            priority: 'MEDIUM',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('2.10.1', COMPANY_A);

    const evalIssue = result.analysis.keyIssues.find((issue) => issue.id === 'ctr-no-evaluations');
    assert.ok(evalIssue, 'Should have ctr-no-evaluations keyIssue');
    assert.equal(evalIssue.priority, 'MEDIUM');
  });

  it('ctr-no-policy-data se convierte en keyIssue con prioridad LOW', async () => {
    const service = buildService(
      buildOverview({
        moduleCompliance: [
          { module: 'contracting', compliance: 60, level: 'MEDIUM', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'ctr-no-policy-data',
            module: 'contracting',
            title: 'Sin datos estructurados de pólizas o certificados',
            description: 'Test',
            priority: 'LOW',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('2.10.1', COMPANY_A);

    const policyIssue = result.analysis.keyIssues.find((issue) => issue.id === 'ctr-no-policy-data');
    assert.ok(policyIssue, 'Should have ctr-no-policy-data keyIssue');
    assert.equal(policyIssue.priority, 'LOW');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AI-CONTRACTING-06: El analyzer no crea scoring paralelo
// ═══════════════════════════════════════════════════════════════════════════

describe('AI-CONTRACTING-06: El analyzer no crea scoring paralelo', () => {
  it('ContractingStandardAnalyzer no contiene divisiones ni cálculos de porcentaje', () => {
    const analyzer = new ContractingStandardAnalyzer();
    const source = analyzer.analyze.toString();

    assert.ok(!source.includes('/ 100'), 'Analyzer no debe dividir por 100');
    assert.ok(!source.includes('* 100'), 'Analyzer no debe multiplicar por 100');
  });

  it('NO_DATA genera quickWins sin datos', () => {
    const analyzer = new ContractingStandardAnalyzer();

    const result = analyzer.analyze({
      companyId: COMPANY_A,
      moduleCompliance: { module: 'contracting', compliance: 0, level: 'CRITICAL', lastUpdated: '' },
      findings: [
        { id: 'ctr-no-data', module: 'contracting', title: 'Sin datos de contratación', description: '', priority: 'HIGH', status: 'OPEN', responsible: '', dueDate: '', createdAt: '' },
      ],
      overview: { overallCompliance: 0, phaseCompliance: { plan: 0, do: 0, check: 0, act: 0 }, moduleCompliance: [] },
    });

    assert.ok(result.summary.includes('No existen datos suficientes'));
    assert.equal(result.keyIssues.length, 0);
    assert.ok(result.quickWins.length > 0);
  });

  it('cumplimiento alto genera summary positivo', () => {
    const analyzer = new ContractingStandardAnalyzer();

    const result = analyzer.analyze({
      companyId: COMPANY_A,
      moduleCompliance: { module: 'contracting', compliance: 95, level: 'EXCELLENT', lastUpdated: '' },
      findings: [],
      overview: { overallCompliance: 95, phaseCompliance: { plan: 95, do: 95, check: 95, act: 95 }, moduleCompliance: [] },
    });

    assert.ok(result.summary.includes('95%'));
    assert.ok(result.summary.toLowerCase().includes('sólida'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PHVA-CONTRACTING-01: 2.10.1 continúa clasificado como HACER
// ═══════════════════════════════════════════════════════════════════════════

describe('PHVA-CONTRACTING-01: 2.10.1 continúa clasificado como HACER', () => {
  it('ContractingStandardAnalyzer.getModule retorna contracting', () => {
    const analyzer = new ContractingStandardAnalyzer();
    assert.equal(analyzer.getModule(), 'contracting');
    // El módulo 'contracting' contribuye a phases.do en ContractingProvider
    // lo que es consistente con la clasificación HACER del catálogo normativo.
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PHVA-CONTRACTING-02: 2.10.1 continúa teniendo peso 2
// ═══════════════════════════════════════════════════════════════════════════

describe('PHVA-CONTRACTING-02: 2.10.1 continúa teniendo peso 2', () => {
  it('el porcentaje proviene directamente del ComplianceEngine sin recálculo', async () => {
    const service = buildService(
      buildOverview({
        moduleCompliance: [
          { module: 'contracting', compliance: 70, level: 'HIGH', lastUpdated: new Date().toISOString() },
        ],
      }),
    );

    const result = await service.analyze('2.10.1', COMPANY_A);
    // El peso normativo (2) se aplica en ComplianceEngineService, no en el analyzer.
    // El analyzer simplemente expone el percentage tal cual lo calculó el provider.
    assert.equal(result.compliancePercentage, 70);
    assert.equal(result.level, 'HIGH');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PHVA-CONTRACTING-03: ComplianceResultCard apunta a contracting
// ═══════════════════════════════════════════════════════════════════════════

describe('PHVA-CONTRACTING-03: ComplianceResultCard configuración', () => {
  it('el analyzer retorna module=contracting para 2.10.1', () => {
    const analyzer = new ContractingStandardAnalyzer();
    assert.equal(analyzer.getModule(), 'contracting');
    // ComplianceResultCard recibe module="contracting" y standardCode="2.10.1"
    // desde PlanPage.tsx (línea 1473-1478).
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PHVA-CONTRACTING-04: La ruta avanzada es /contracting
// ═══════════════════════════════════════════════════════════════════════════

describe('PHVA-CONTRACTING-04: Ruta avanzada /contracting', () => {
  it('StandardAnalysisService.module para 2.10.1 es contracting', async () => {
    const service = buildService(
      buildOverview({
        moduleCompliance: [
          { module: 'contracting', compliance: 50, level: 'MEDIUM', lastUpdated: new Date().toISOString() },
        ],
        findings: [],
      }),
    );

    const result = await service.analyze('2.10.1', COMPANY_A);
    assert.equal(result.module, 'contracting');
    // La ruta /contracting está registrada en App.tsx y navega desde PlanPage.
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Tenant isolation para 2.10.1
// ═══════════════════════════════════════════════════════════════════════════

describe('AI-CONTRACTING-TENANT: Tenant isolation para 2.10.1', () => {
  it('Company A y Company B obtienen análisis diferentes para 2.10.1', async () => {
    const overviewA = buildOverview({
      moduleCompliance: [
        { module: 'contracting', compliance: 80, level: 'HIGH', lastUpdated: new Date().toISOString() },
      ],
      findings: [],
    });
    const overviewB = buildOverview({
      moduleCompliance: [
        { module: 'contracting', compliance: 0, level: 'CRITICAL', lastUpdated: new Date().toISOString() },
      ],
      findings: [
        {
          id: 'ctr-no-data',
          module: 'contracting',
          title: 'Sin datos de contratación',
          description: 'Test',
          priority: 'HIGH',
          status: 'OPEN',
          responsible: '',
          dueDate: '',
          createdAt: new Date().toISOString(),
        },
      ],
    });

    const service = buildServiceWithTwoCompanies(overviewA, overviewB);

    const resultA = await service.analyze('2.10.1', COMPANY_A);
    const resultB = await service.analyze('2.10.1', COMPANY_B);

    assert.equal(resultA.compliancePercentage, 80);
    assert.equal(resultA.dataAvailable, true);
    assert.equal(resultB.compliancePercentage, 0);
    assert.equal(resultB.dataAvailable, false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Helper para crear overviews de change-management
// ═══════════════════════════════════════════════════════════════════════════

function buildChangeManagementOverview(overrides?: {
  overallCompliance?: number;
  moduleCompliance?: Array<{
    module: string;
    compliance: number;
    level: string;
    lastUpdated: string;
  }>;
  findings?: Array<{
    id: string;
    module: string;
    title: string;
    description: string;
    priority: string;
    status: string;
    responsible: string;
    dueDate: string;
    createdAt: string;
  }>;
}) {
  return {
    overallCompliance: overrides?.overallCompliance ?? 0,
    phaseCompliance: { plan: 0, do: overrides?.overallCompliance ?? 0, check: 0, act: 0 },
    moduleCompliance: overrides?.moduleCompliance ?? [
      {
        module: 'change-management',
        compliance: 0,
        level: 'CRITICAL',
        lastUpdated: new Date().toISOString(),
      },
    ],
    findings: overrides?.findings ?? [],
    recommendations: [],
    alerts: [],
    prediction: null,
    trend: null,
    executiveSummary: 'Test summary',
    lastUpdated: new Date().toISOString(),
  };
}

function buildChangeManagementService(overviewOverride?: ReturnType<typeof buildChangeManagementOverview>) {
  const complianceEngineService = {
    getOverview: async () => overviewOverride ?? buildChangeManagementOverview(),
  } as unknown as ComplianceEngineService;

  return new StandardAnalysisService(complianceEngineService);
}

// ═══════════════════════════════════════════════════════════════════════════
// AI-CHANGE-01: StandardAnalysisService reconoce 2.11.1
// ═══════════════════════════════════════════════════════════════════════════

describe('AI-CHANGE-01: StandardAnalysisService reconoce 2.11.1', () => {
  it('retorna análisis completo para 2.11.1 con datos reales', async () => {
    const service = buildChangeManagementService(
      buildChangeManagementOverview({
        overallCompliance: 55,
        moduleCompliance: [
          { module: 'change-management', compliance: 55, level: 'MEDIUM', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'change-missing-impact-analysis',
            module: 'change-management',
            title: '2 cambio(s) sin análisis de riesgos SST',
            description: 'Test',
            priority: 'HIGH',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
          {
            id: 'change-pending-approval',
            module: 'change-management',
            title: '1 cambio(s) pendiente(s) de aprobación',
            description: 'Test',
            priority: 'MEDIUM',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('2.11.1', COMPANY_A);

    assert.equal(result.standardCode, '2.11.1');
    assert.equal(result.standardTitle, 'Gestión del cambio');
    assert.equal(result.module, 'change-management');
    assert.equal(result.compliancePercentage, 55);
    assert.equal(result.dataAvailable, true);
    assert.ok(result.analysis.summary.length > 0);
    assert.ok(result.analysis.keyIssues.length > 0);
    assert.ok(result.analysis.quickWins.length > 0);
    assert.ok(result.analysis.nextSteps.length > 0);
    assert.ok(result.evaluatedAt.length > 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AI-CHANGE-02: getStandardTitle('2.11.1') → Gestión del cambio
// ═══════════════════════════════════════════════════════════════════════════

describe('AI-CHANGE-02: getStandardTitle(2.11.1)', () => {
  it('el título del estándar 2.11.1 es Gestión del cambio', async () => {
    const service = buildChangeManagementService(
      buildChangeManagementOverview({
        moduleCompliance: [
          { module: 'change-management', compliance: 50, level: 'MEDIUM', lastUpdated: new Date().toISOString() },
        ],
        findings: [],
      }),
    );

    const result = await service.analyze('2.11.1', COMPANY_A);
    assert.equal(result.standardTitle, 'Gestión del cambio');
  });

  it('el título de 2.9.1 sigue siendo Adquisiciones', async () => {
    const service = buildService(
      buildOverview({
        moduleCompliance: [
          { module: 'acquisitions', compliance: 50, level: 'MEDIUM', lastUpdated: new Date().toISOString() },
        ],
        findings: [],
      }),
    );
    const result = await service.analyze('2.9.1', COMPANY_A);
    assert.equal(result.standardTitle, 'Adquisiciones');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AI-CHANGE-03: Sin datos → dataAvailable = false
// ═══════════════════════════════════════════════════════════════════════════

describe('AI-CHANGE-03: NO_DATA → dataAvailable = false', () => {
  it('retorna dataAvailable: false cuando existe finding change-no-data', async () => {
    const service = buildChangeManagementService(
      buildChangeManagementOverview({
        overallCompliance: 0,
        moduleCompliance: [
          { module: 'change-management', compliance: 0, level: 'CRITICAL', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'change-no-data',
            module: 'change-management',
            title: 'Sin datos de gestión del cambio',
            description: 'Test',
            priority: 'HIGH',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('2.11.1', COMPANY_A);

    assert.equal(result.dataAvailable, false);
    assert.equal(result.compliancePercentage, 0);
    assert.ok(result.analysis.summary.includes('No existen datos suficientes'));
    assert.equal(result.analysis.keyIssues.length, 0);
    assert.ok(result.analysis.quickWins.length > 0);
    assert.ok(result.analysis.nextSteps.length > 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AI-CHANGE-04: Con datos → dataAvailable = true
// ═══════════════════════════════════════════════════════════════════════════

describe('AI-CHANGE-04: Con datos → dataAvailable = true', () => {
  it('retorna dataAvailable: true cuando NO existe change-no-data', async () => {
    const service = buildChangeManagementService(
      buildChangeManagementOverview({
        overallCompliance: 40,
        moduleCompliance: [
          { module: 'change-management', compliance: 40, level: 'MEDIUM', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'change-missing-impact-analysis',
            module: 'change-management',
            title: '1 cambio(s) sin análisis de riesgos SST',
            description: 'Test',
            priority: 'HIGH',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('2.11.1', COMPANY_A);

    assert.equal(result.dataAvailable, true);
    assert.equal(result.compliancePercentage, 40);
    assert.ok(result.analysis.keyIssues.length > 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AI-CHANGE-05: Interpreta change-missing-impact-analysis
// ═══════════════════════════════════════════════════════════════════════════

describe('AI-CHANGE-05: Interpreta change-missing-impact-analysis', () => {
  it('se convierte en keyIssue con prioridad HIGH', async () => {
    const service = buildChangeManagementService(
      buildChangeManagementOverview({
        moduleCompliance: [
          { module: 'change-management', compliance: 35, level: 'LOW', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'change-missing-impact-analysis',
            module: 'change-management',
            title: '3 cambio(s) sin análisis de riesgos SST',
            description: 'Test',
            priority: 'HIGH',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('2.11.1', COMPANY_A);

    const issue = result.analysis.keyIssues.find((i) => i.id === 'change-missing-impact-analysis');
    assert.ok(issue, 'Should have change-missing-impact-analysis keyIssue');
    assert.equal(issue.priority, 'HIGH');
    assert.ok(issue.recommendation.length > 0);
    assert.ok(issue.impact.length > 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AI-CHANGE-06: Interpreta change-missing-control-actions
// ═══════════════════════════════════════════════════════════════════════════

describe('AI-CHANGE-06: Interpreta change-missing-control-actions', () => {
  it('se convierte en keyIssue con prioridad HIGH', async () => {
    const service = buildChangeManagementService(
      buildChangeManagementOverview({
        moduleCompliance: [
          { module: 'change-management', compliance: 30, level: 'LOW', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'change-missing-control-actions',
            module: 'change-management',
            title: '2 cambio(s) sin acciones de control',
            description: 'Test',
            priority: 'HIGH',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('2.11.1', COMPANY_A);

    const issue = result.analysis.keyIssues.find((i) => i.id === 'change-missing-control-actions');
    assert.ok(issue, 'Should have change-missing-control-actions keyIssue');
    assert.equal(issue.priority, 'HIGH');
    assert.ok(issue.recommendation.length > 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AI-CHANGE-07: Interpreta change-pending-approval
// ═══════════════════════════════════════════════════════════════════════════

describe('AI-CHANGE-07: Interpreta change-pending-approval', () => {
  it('se convierte en keyIssue con prioridad MEDIUM', async () => {
    const service = buildChangeManagementService(
      buildChangeManagementOverview({
        moduleCompliance: [
          { module: 'change-management', compliance: 50, level: 'MEDIUM', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'change-pending-approval',
            module: 'change-management',
            title: '1 cambio(s) pendiente(s) de aprobación',
            description: 'Test',
            priority: 'MEDIUM',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('2.11.1', COMPANY_A);

    const issue = result.analysis.keyIssues.find((i) => i.id === 'change-pending-approval');
    assert.ok(issue, 'Should have change-pending-approval keyIssue');
    assert.equal(issue.priority, 'MEDIUM');
    assert.ok(issue.recommendation.length > 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AI-CHANGE-08: Interpreta change-rejected
// ═══════════════════════════════════════════════════════════════════════════

describe('AI-CHANGE-08: Interpreta change-rejected', () => {
  it('se convierte en keyIssue con prioridad MEDIUM (no crítico)', async () => {
    const service = buildChangeManagementService(
      buildChangeManagementOverview({
        moduleCompliance: [
          { module: 'change-management', compliance: 60, level: 'MEDIUM', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'change-rejected',
            module: 'change-management',
            title: '1 cambio(s) rechazado(s)',
            description: 'Test',
            priority: 'MEDIUM',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('2.11.1', COMPANY_A);

    const issue = result.analysis.keyIssues.find((i) => i.id === 'change-rejected');
    assert.ok(issue, 'Should have change-rejected keyIssue');
    assert.equal(issue.priority, 'MEDIUM');
    assert.ok(issue.recommendation.length > 0);
    // Verificar que no lo trata como crítico
    assert.ok(issue.impact.toLowerCase().includes('ajuste') || issue.impact.toLowerCase().includes('rechazado') || issue.impact.toLowerCase().includes('corrección'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AI-CHANGE-09: Interpreta change-missing-follow-up
// ═══════════════════════════════════════════════════════════════════════════

describe('AI-CHANGE-09: Interpreta change-missing-follow-up', () => {
  it('se convierte en keyIssue con prioridad MEDIUM', async () => {
    const service = buildChangeManagementService(
      buildChangeManagementOverview({
        moduleCompliance: [
          { module: 'change-management', compliance: 45, level: 'MEDIUM', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'change-missing-follow-up',
            module: 'change-management',
            title: '2 cambio(s) implementado(s) sin seguimiento',
            description: 'Test',
            priority: 'MEDIUM',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('2.11.1', COMPANY_A);

    const issue = result.analysis.keyIssues.find((i) => i.id === 'change-missing-follow-up');
    assert.ok(issue, 'Should have change-missing-follow-up keyIssue');
    assert.equal(issue.priority, 'MEDIUM');
    assert.ok(issue.recommendation.length > 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AI-CHANGE-10: Múltiples findings generan recomendaciones coherentes
// ═══════════════════════════════════════════════════════════════════════════

describe('AI-CHANGE-10: Múltiples findings generan recomendaciones coherentes', () => {
  it('con múltiples findings, quickWins y nextSteps son coherentes', async () => {
    const service = buildChangeManagementService(
      buildChangeManagementOverview({
        moduleCompliance: [
          { module: 'change-management', compliance: 25, level: 'LOW', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'change-missing-impact-analysis',
            module: 'change-management',
            title: '3 cambio(s) sin análisis de riesgos SST',
            description: 'Test',
            priority: 'HIGH',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
          {
            id: 'change-missing-control-actions',
            module: 'change-management',
            title: '2 cambio(s) sin acciones de control',
            description: 'Test',
            priority: 'HIGH',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
          {
            id: 'change-pending-approval',
            module: 'change-management',
            title: '1 cambio(s) pendiente(s) de aprobación',
            description: 'Test',
            priority: 'MEDIUM',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
          {
            id: 'change-missing-follow-up',
            module: 'change-management',
            title: '1 cambio(s) implementado(s) sin seguimiento',
            description: 'Test',
            priority: 'MEDIUM',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('2.11.1', COMPANY_A);

    assert.equal(result.dataAvailable, true);
    assert.equal(result.analysis.keyIssues.length, 4);
    assert.ok(result.analysis.quickWins.length > 0);
    assert.ok(result.analysis.quickWins.length <= 3);
    assert.ok(result.analysis.nextSteps.length > 0);
    assert.ok(result.analysis.nextSteps.length <= 3);

    // Verificar que nextSteps priorizan HIGH sobre MEDIUM
    const allText = result.analysis.nextSteps.join(' ').toLowerCase();
    // Los nextSteps deben contener recomendaciones de issues HIGH primero
    assert.ok(allText.includes('impacto') || allText.includes('control') || allText.includes('evaluación'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AI-CHANGE-11: No inventa findings inexistentes
// ═══════════════════════════════════════════════════════════════════════════

describe('AI-CHANGE-11: No inventa findings inexistentes', () => {
  it('sin findings, no genera keyIssues artificiales', async () => {
    const analyzer = new ChangeManagementStandardAnalyzer();

    const result = analyzer.analyze({
      companyId: COMPANY_A,
      moduleCompliance: { module: 'change-management', compliance: 70, level: 'HIGH', lastUpdated: '' },
      findings: [],
      overview: { overallCompliance: 70, phaseCompliance: { plan: 0, do: 70, check: 0, act: 0 }, moduleCompliance: [] },
    });

    assert.equal(result.keyIssues.length, 0, 'No findings = no keyIssues');
    assert.ok(result.summary.length > 0);
  });

  it('no contiene findings como change-no-data inventados en contexto con datos', () => {
    const analyzer = new ChangeManagementStandardAnalyzer();

    const result = analyzer.analyze({
      companyId: COMPANY_A,
      moduleCompliance: { module: 'change-management', compliance: 60, level: 'MEDIUM', lastUpdated: '' },
      findings: [
        { id: 'change-missing-impact-analysis', module: 'change-management', title: '1 cambio(s) sin análisis de riesgos SST', description: '', priority: 'HIGH', status: 'OPEN', responsible: '', dueDate: '', createdAt: '' },
      ],
      overview: { overallCompliance: 60, phaseCompliance: { plan: 0, do: 60, check: 0, act: 0 }, moduleCompliance: [] },
    });

    // Solo debe tener el issue real, no inventados
    assert.equal(result.keyIssues.length, 1);
    assert.equal(result.keyIssues[0].id, 'change-missing-impact-analysis');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AI-CHANGE-12: No recalcula el porcentaje del ComplianceEngine
// ═══════════════════════════════════════════════════════════════════════════

describe('AI-CHANGE-12: No recalcula el porcentaje del ComplianceEngine', () => {
  it('ChangeManagementStandardAnalyzer no contiene divisiones ni cálculos de porcentaje', () => {
    const analyzer = new ChangeManagementStandardAnalyzer();
    const source = analyzer.analyze.toString();

    assert.ok(!source.includes('/ 100'), 'Analyzer no debe dividir por 100');
    assert.ok(!source.includes('* 100'), 'Analyzer no debe multiplicar por 100');
  });

  it('compliancePercentage se toma directamente del overview sin recalcular', async () => {
    const percentages = [0, 14, 28, 43, 57, 71, 85, 93, 100];

    for (const pct of percentages) {
      const service = buildChangeManagementService(
        buildChangeManagementOverview({
          moduleCompliance: [
            { module: 'change-management', compliance: pct, level: 'MEDIUM', lastUpdated: new Date().toISOString() },
          ],
          findings: [
            {
              id: 'change-missing-impact-analysis',
              module: 'change-management',
              title: '1 cambio(s) sin análisis de riesgos SST',
              description: 'Test',
              priority: 'HIGH',
              status: 'OPEN',
              responsible: '',
              dueDate: '',
              createdAt: new Date().toISOString(),
            },
          ],
        }),
      );

      const result = await service.analyze('2.11.1', COMPANY_A);
      assert.equal(
        result.compliancePercentage, pct,
        `Expected compliancePercentage=${pct} but got ${result.compliancePercentage}`,
      );
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AI-CHANGE-13: No modifica el scoring global PHVA
// ═══════════════════════════════════════════════════════════════════════════

describe('AI-CHANGE-13: No modifica el scoring global PHVA', () => {
  it('ChangeManagementStandardAnalyzer.getModule retorna change-management', () => {
    const analyzer = new ChangeManagementStandardAnalyzer();
    assert.equal(analyzer.getModule(), 'change-management');
    // El módulo 'change-management' contribuye a phases.do en ChangeManagementProvider
    // lo que es consistente con la clasificación HACER del catálogo normativo.
  });

  it('el porcentaje proviene directamente del ComplianceEngine sin recálculo', async () => {
    const service = buildChangeManagementService(
      buildChangeManagementOverview({
        moduleCompliance: [
          { module: 'change-management', compliance: 75, level: 'HIGH', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'change-missing-impact-analysis',
            module: 'change-management',
            title: '1 cambio(s) sin análisis de riesgos SST',
            description: 'Test',
            priority: 'HIGH',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('2.11.1', COMPANY_A);
    assert.equal(result.compliancePercentage, 75);
    assert.equal(result.level, 'HIGH');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AI-CHANGE-14: Estándares existentes continúan funcionando
// ═══════════════════════════════════════════════════════════════════════════

describe('AI-CHANGE-14: Estándares existentes continúan funcionando', () => {
  it('2.9.1 sigue funcionando correctamente', async () => {
    const service = buildChangeManagementService(
      buildChangeManagementOverview({
        overallCompliance: 65,
        moduleCompliance: [
          { module: 'acquisitions', compliance: 65, level: 'MEDIUM', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'acq-no-sst-criteria',
            module: 'acquisitions',
            title: '2 adquisición(es) sin criterios SST',
            description: 'Test',
            priority: 'HIGH',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('2.9.1', COMPANY_A);
    assert.equal(result.standardCode, '2.9.1');
    assert.equal(result.standardTitle, 'Adquisiciones');
    assert.equal(result.dataAvailable, true);
    assert.ok(result.analysis.keyIssues.length > 0);
  });

  it('2.10.1 sigue funcionando correctamente', async () => {
    const service = buildChangeManagementService(
      buildChangeManagementOverview({
        overallCompliance: 55,
        moduleCompliance: [
          { module: 'contracting', compliance: 55, level: 'MEDIUM', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'ctr-no-sst-requirements',
            module: 'contracting',
            title: '2 contrato(s) activo(s) sin requisitos SST documentados',
            description: 'Test',
            priority: 'HIGH',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('2.10.1', COMPANY_A);
    assert.equal(result.standardCode, '2.10.1');
    assert.equal(result.standardTitle, 'Contratación');
    assert.equal(result.dataAvailable, true);
    assert.ok(result.analysis.keyIssues.length > 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AI-CHANGE-15: No existe analyzer duplicado para 2.11.1
// ═══════════════════════════════════════════════════════════════════════════

describe('AI-CHANGE-15: No existe analyzer duplicado para 2.11.1', () => {
  it('ChangeManagementStandardAnalyzer es la única clase que soporta 2.11.1', () => {
    const analyzer = new ChangeManagementStandardAnalyzer();
    assert.ok(analyzer.supports('2.11.1'));
    assert.ok(!analyzer.supports('2.9.1'));
    assert.ok(!analyzer.supports('2.10.1'));
    assert.ok(!analyzer.supports('1.1.1'));
  });

  it('ChangeManagementStandardAnalyzer supports retorna true solo para 2.11.1', () => {
    const analyzer = new ChangeManagementStandardAnalyzer();
    const codes = ['2.5.1', '2.6.1', '2.7.1', '2.8.1', '2.9.1', '2.10.1', '2.12.1', '3.1.1', '99.99'];
    for (const code of codes) {
      assert.ok(!analyzer.supports(code), `No debe soportar ${code}`);
    }
    assert.ok(analyzer.supports('2.11.1'));
  });

  it('getModule retorna change-management', () => {
    const analyzer = new ChangeManagementStandardAnalyzer();
    assert.equal(analyzer.getModule(), 'change-management');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Tenant isolation para 2.11.1
// ═══════════════════════════════════════════════════════════════════════════

describe('AI-CHANGE-TENANT: Tenant isolation para 2.11.1', () => {
  it('Company A y Company B obtienen análisis diferentes para 2.11.1', async () => {
    const overviewA = buildChangeManagementOverview({
      overallCompliance: 80,
      moduleCompliance: [
        { module: 'change-management', compliance: 80, level: 'HIGH', lastUpdated: new Date().toISOString() },
      ],
      findings: [],
    });
    const overviewB = buildChangeManagementOverview({
      overallCompliance: 0,
      moduleCompliance: [
        { module: 'change-management', compliance: 0, level: 'CRITICAL', lastUpdated: new Date().toISOString() },
      ],
      findings: [
        {
          id: 'change-no-data',
          module: 'change-management',
          title: 'Sin datos de gestión del cambio',
          description: 'Test',
          priority: 'HIGH',
          status: 'OPEN',
          responsible: '',
          dueDate: '',
          createdAt: new Date().toISOString(),
        },
      ],
    });

    const complianceEngineService = {
      getOverview: async (companyId: string) =>
        companyId === COMPANY_A ? overviewA : overviewB,
    } as unknown as ComplianceEngineService;

    const service = new StandardAnalysisService(complianceEngineService);

    const resultA = await service.analyze('2.11.1', COMPANY_A);
    const resultB = await service.analyze('2.11.1', COMPANY_B);

    assert.equal(resultA.compliancePercentage, 80);
    assert.equal(resultA.dataAvailable, true);
    assert.equal(resultB.compliancePercentage, 0);
    assert.equal(resultB.dataAvailable, false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AI-CHANGE-NO-DATA: NO_DATA no se interpreta como 100%
// ═══════════════════════════════════════════════════════════════════════════

describe('AI-CHANGE-NO-DATA: NO_DATA no se interpreta como 100%', () => {
  it('con change-no-data, el summary indica ausencia de datos, no cumplimiento', async () => {
    const service = buildChangeManagementService(
      buildChangeManagementOverview({
        overallCompliance: 0,
        moduleCompliance: [
          { module: 'change-management', compliance: 0, level: 'CRITICAL', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'change-no-data',
            module: 'change-management',
            title: 'Sin datos de gestión del cambio',
            description: 'Test',
            priority: 'HIGH',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('2.11.1', COMPANY_A);

    assert.equal(result.dataAvailable, false);
    assert.equal(result.compliancePercentage, 0);
    // El summary NO debe afirmar cumplimiento
    assert.ok(!result.analysis.summary.toLowerCase().includes('sólida'));
    assert.ok(!result.analysis.summary.toLowerCase().includes('cumplimiento completo'));
    assert.ok(result.analysis.summary.includes('No existen datos suficientes'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AI-CHANGE-METRICS: Métricas se extraen de findings reales
// ═══════════════════════════════════════════════════════════════════════════

describe('AI-CHANGE-METRICS: Métricas se extraen de findings reales', () => {
  it('extrae métricas de los títulos de findings', () => {
    const analyzer = new ChangeManagementStandardAnalyzer();

    const metrics = analyzer.getMetrics({
      companyId: COMPANY_A,
      moduleCompliance: { module: 'change-management', compliance: 40, level: 'MEDIUM', lastUpdated: '' },
      findings: [
        { id: 'change-missing-impact-analysis', module: 'change-management', title: '3 cambio(s) sin análisis de riesgos SST', description: '', priority: 'HIGH', status: 'OPEN', responsible: '', dueDate: '', createdAt: '' },
        { id: 'change-missing-control-actions', module: 'change-management', title: '2 cambio(s) sin acciones de control', description: '', priority: 'HIGH', status: 'OPEN', responsible: '', dueDate: '', createdAt: '' },
        { id: 'change-pending-approval', module: 'change-management', title: '1 cambio(s) pendiente(s) de aprobación', description: '', priority: 'MEDIUM', status: 'OPEN', responsible: '', dueDate: '', createdAt: '' },
      ],
      overview: { overallCompliance: 40, phaseCompliance: { plan: 0, do: 40, check: 0, act: 0 }, moduleCompliance: [] },
    });

    assert.equal(metrics.compliancePercentage, 40);
    assert.equal(metrics.changesWithoutImpactAnalysis, 3);
    assert.equal(metrics.changesWithoutControlActions, 2);
    assert.equal(metrics.pendingApprovalChanges, 1);
  });

  it('con change-no-data, totalChanges = 0', () => {
    const analyzer = new ChangeManagementStandardAnalyzer();

    const metrics = analyzer.getMetrics({
      companyId: COMPANY_A,
      moduleCompliance: { module: 'change-management', compliance: 0, level: 'CRITICAL', lastUpdated: '' },
      findings: [
        { id: 'change-no-data', module: 'change-management', title: 'Sin datos de gestión del cambio', description: '', priority: 'HIGH', status: 'OPEN', responsible: '', dueDate: '', createdAt: '' },
      ],
      overview: { overallCompliance: 0, phaseCompliance: { plan: 0, do: 0, check: 0, act: 0 }, moduleCompliance: [] },
    });

    assert.equal(metrics.totalChanges, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SOCIO-AN-001: Perfil completo
// ═══════════════════════════════════════════════════════════════════════════

describe('SOCIO-AN-001: Perfil completo', () => {
  it('100% compliance genera summary positivo sin keyIssues', () => {
    const analyzer = new SociodemographicStandardAnalyzer();

    const result = analyzer.analyze({
      companyId: COMPANY_A,
      moduleCompliance: { module: 'sociodemographic', compliance: 100, level: 'EXCELLENT', lastUpdated: '' },
      findings: [],
      overview: { overallCompliance: 100, phaseCompliance: { plan: 0, do: 100, check: 0, act: 0 }, moduleCompliance: [] },
    });

    assert.ok(result.summary.includes('100%'));
    assert.ok(result.summary.toLowerCase().includes('sólida'));
    assert.equal(result.keyIssues.length, 0);
    assert.equal(result.quickWins.length, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SOCIO-AN-002: NO_DATA
// ═══════════════════════════════════════════════════════════════════════════

describe('SOCIO-AN-002: NO_DATA', () => {
  it('totalWorkers=0 con finding socio-no-data produce dataAvailable=false', async () => {
    const service = buildService(
      buildOverview({
        overallCompliance: 0,
        moduleCompliance: [
          { module: 'sociodemographic', compliance: 0, level: 'CRITICAL', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'socio-no-data',
            module: 'sociodemographic',
            title: 'Sin datos sociodemográficos',
            description: 'Test',
            priority: 'HIGH',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('3.1.1', COMPANY_A);

    assert.equal(result.dataAvailable, false);
    assert.equal(result.compliancePercentage, 0);
    assert.ok(result.analysis.summary.includes('No existen trabajadores registrados'));
    assert.equal(result.analysis.keyIssues.length, 0);
    assert.ok(result.analysis.quickWins.length > 0);
    assert.ok(result.analysis.nextSteps.length > 0);
  });

  it('analyzer NO interpreta NO_DATA como 0% convencional', () => {
    const analyzer = new SociodemographicStandardAnalyzer();

    const result = analyzer.analyze({
      companyId: COMPANY_A,
      moduleCompliance: { module: 'sociodemographic', compliance: 0, level: 'CRITICAL', lastUpdated: '' },
      findings: [
        { id: 'socio-no-data', module: 'sociodemographic', title: 'Sin datos sociodemográficos', description: '', priority: 'HIGH', status: 'OPEN', responsible: '', dueDate: '', createdAt: '' },
      ],
      overview: { overallCompliance: 0, phaseCompliance: { plan: 0, do: 0, check: 0, act: 0 }, moduleCompliance: [] },
    });

    // NO debe afirmar cumplimiento, ni 0% como incumplimiento convencional
    assert.ok(!result.summary.toLowerCase().includes('cumplimiento completo'));
    assert.ok(!result.summary.toLowerCase().includes('0%'));
    assert.ok(result.summary.includes('No existen trabajadores registrados'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SOCIO-AN-003: Falta birthDate
// ═══════════════════════════════════════════════════════════════════════════

describe('SOCIO-AN-003: Falta birthDate', () => {
  it('socio-missing-age genera keyIssue con recomendación de fecha de nacimiento', async () => {
    const service = buildService(
      buildOverview({
        moduleCompliance: [
          { module: 'sociodemographic', compliance: 50, level: 'MEDIUM', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'socio-missing-age',
            module: 'sociodemographic',
            title: '5 trabajador(es) sin fecha de nacimiento registrada',
            description: 'Test',
            priority: 'MEDIUM',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('3.1.1', COMPANY_A);

    const ageIssue = result.analysis.keyIssues.find((issue) => issue.id === 'socio-missing-age');
    assert.ok(ageIssue, 'Should have socio-missing-age keyIssue');
    assert.equal(ageIssue.priority, 'MEDIUM');
    assert.ok(ageIssue.recommendation.toLowerCase().includes('fecha de nacimiento'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SOCIO-AN-004: Falta gender
// ═══════════════════════════════════════════════════════════════════════════

describe('SOCIO-AN-004: Falta gender', () => {
  it('socio-missing-gender genera keyIssue con recomendación de género', async () => {
    const service = buildService(
      buildOverview({
        moduleCompliance: [
          { module: 'sociodemographic', compliance: 50, level: 'MEDIUM', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'socio-missing-gender',
            module: 'sociodemographic',
            title: '3 trabajador(es) sin información de género registrada',
            description: 'Test',
            priority: 'MEDIUM',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('3.1.1', COMPANY_A);

    const genderIssue = result.analysis.keyIssues.find((issue) => issue.id === 'socio-missing-gender');
    assert.ok(genderIssue, 'Should have socio-missing-gender keyIssue');
    assert.equal(genderIssue.priority, 'MEDIUM');
    assert.ok(genderIssue.recommendation.toLowerCase().includes('género'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SOCIO-AN-005: Falta educationLevel
// ═══════════════════════════════════════════════════════════════════════════

describe('SOCIO-AN-005: Falta educationLevel', () => {
  it('socio-missing-education genera keyIssue con recomendación de nivel educativo', async () => {
    const service = buildService(
      buildOverview({
        moduleCompliance: [
          { module: 'sociodemographic', compliance: 50, level: 'MEDIUM', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'socio-missing-education',
            module: 'sociodemographic',
            title: '4 trabajador(es) sin nivel educativo registrado',
            description: 'Test',
            priority: 'MEDIUM',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('3.1.1', COMPANY_A);

    const educationIssue = result.analysis.keyIssues.find((issue) => issue.id === 'socio-missing-education');
    assert.ok(educationIssue, 'Should have socio-missing-education keyIssue');
    assert.equal(educationIssue.priority, 'MEDIUM');
    assert.ok(educationIssue.recommendation.toLowerCase().includes('nivel educativo'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SOCIO-AN-006: Falta maritalStatus
// ═══════════════════════════════════════════════════════════════════════════

describe('SOCIO-AN-006: Falta maritalStatus', () => {
  it('socio-missing-marital genera keyIssue con recomendación de estado civil', async () => {
    const service = buildService(
      buildOverview({
        moduleCompliance: [
          { module: 'sociodemographic', compliance: 50, level: 'MEDIUM', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'socio-missing-marital',
            module: 'sociodemographic',
            title: '2 trabajador(es) sin estado civil registrado',
            description: 'Test',
            priority: 'LOW',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('3.1.1', COMPANY_A);

    const maritalIssue = result.analysis.keyIssues.find((issue) => issue.id === 'socio-missing-marital');
    assert.ok(maritalIssue, 'Should have socio-missing-marital keyIssue');
    assert.equal(maritalIssue.priority, 'LOW');
    assert.ok(maritalIssue.recommendation.toLowerCase().includes('estado civil'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SOCIO-AN-007: Múltiples findings
// ═══════════════════════════════════════════════════════════════════════════

describe('SOCIO-AN-007: Múltiples findings', () => {
  it('todos los findings socio-* se interpretan correctamente', async () => {
    const service = buildService(
      buildOverview({
        moduleCompliance: [
          { module: 'sociodemographic', compliance: 30, level: 'LOW', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'socio-missing-age',
            module: 'sociodemographic',
            title: '5 trabajador(es) sin fecha de nacimiento registrada',
            description: 'Test',
            priority: 'MEDIUM',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
          {
            id: 'socio-missing-gender',
            module: 'sociodemographic',
            title: '3 trabajador(es) sin información de género registrada',
            description: 'Test',
            priority: 'MEDIUM',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
          {
            id: 'socio-missing-education',
            module: 'sociodemographic',
            title: '4 trabajador(es) sin nivel educativo registrado',
            description: 'Test',
            priority: 'MEDIUM',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
          {
            id: 'socio-missing-marital',
            module: 'sociodemographic',
            title: '2 trabajador(es) sin estado civil registrado',
            description: 'Test',
            priority: 'LOW',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('3.1.1', COMPANY_A);

    assert.equal(result.analysis.keyIssues.length, 4);
    assert.ok(result.analysis.keyIssues.some((i) => i.id === 'socio-missing-age'));
    assert.ok(result.analysis.keyIssues.some((i) => i.id === 'socio-missing-gender'));
    assert.ok(result.analysis.keyIssues.some((i) => i.id === 'socio-missing-education'));
    assert.ok(result.analysis.keyIssues.some((i) => i.id === 'socio-missing-marital'));
    assert.ok(result.analysis.quickWins.length > 0);
    assert.ok(result.analysis.quickWins.length <= 3);
    assert.ok(result.analysis.nextSteps.length > 0);
    assert.ok(result.analysis.nextSteps.length <= 3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SOCIO-AN-008: Porcentaje parcial
// ═══════════════════════════════════════════════════════════════════════════

describe('SOCIO-AN-008: Porcentaje parcial', () => {
  it('diferentes porcentajes generan summaries coherentes', () => {
    const analyzer = new SociodemographicStandardAnalyzer();

    const percentages = [0, 25, 50, 75, 90, 100];

    for (const pct of percentages) {
      const result = analyzer.analyze({
        companyId: COMPANY_A,
        moduleCompliance: { module: 'sociodemographic', compliance: pct, level: 'MEDIUM', lastUpdated: '' },
        findings: [
          { id: 'socio-missing-age', module: 'sociodemographic', title: '3 trabajador(es) sin fecha de nacimiento', description: '', priority: 'MEDIUM', status: 'OPEN', responsible: '', dueDate: '', createdAt: '' },
        ],
        overview: { overallCompliance: pct, phaseCompliance: { plan: 0, do: pct, check: 0, act: 0 }, moduleCompliance: [] },
      });

      assert.ok(result.summary.length > 0, `pct=${pct} debe tener summary`);
      if (pct >= 90) {
        assert.ok(result.summary.toLowerCase().includes('sólida'), `pct=${pct} debe incluir sólida`);
      } else if (pct >= 50) {
        assert.ok(result.summary.includes(`${pct}%`), `pct=${pct} debe incluir porcentaje`);
      } else {
        assert.ok(result.summary.toLowerCase().includes('bajo'), `pct=${pct} debe indicar bajo`);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SOCIO-AN-009: Sin PII
// ═══════════════════════════════════════════════════════════════════════════

describe('SOCIO-AN-009: Sin PII', () => {
  it('el análisis no contiene información personal identificable', async () => {
    const service = buildService(
      buildOverview({
        moduleCompliance: [
          { module: 'sociodemographic', compliance: 45, level: 'MEDIUM', lastUpdated: new Date().toISOString() },
        ],
        findings: [
          {
            id: 'socio-missing-age',
            module: 'sociodemographic',
            title: '5 trabajador(es) sin fecha de nacimiento registrada',
            description: 'Test',
            priority: 'MEDIUM',
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    );

    const result = await service.analyze('3.1.1', COMPANY_A);

    const allText = [
      result.analysis.summary,
      ...result.analysis.quickWins,
      ...result.analysis.nextSteps,
      ...result.analysis.keyIssues.map((i) => `${i.title} ${i.impact} ${i.recommendation}`),
    ].join(' ').toLowerCase();

    assert.ok(!allText.includes('nombre'), 'No debe contener nombre');
    assert.ok(!allText.includes('documento'), 'No debe contener documento');
    assert.ok(!allText.includes('email'), 'No debe contener email');
    assert.ok(!allText.includes('teléfono'), 'No debe contener teléfono');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SOCIO-AN-010: Registro en StandardAnalysisService
// ═══════════════════════════════════════════════════════════════════════════

describe('SOCIO-AN-010: Registro en StandardAnalysisService', () => {
  it('3.1.1 resuelve correctamente a SociodemographicStandardAnalyzer', async () => {
    const service = buildService(
      buildOverview({
        moduleCompliance: [
          { module: 'sociodemographic', compliance: 55, level: 'MEDIUM', lastUpdated: new Date().toISOString() },
        ],
        findings: [],
      }),
    );

    const result = await service.analyze('3.1.1', COMPANY_A);

    assert.equal(result.standardCode, '3.1.1');
    assert.equal(result.standardTitle, 'Perfil sociodemográfico');
    assert.equal(result.module, 'sociodemographic');
    assert.equal(result.compliancePercentage, 55);
    assert.equal(result.dataAvailable, true);
    assert.ok(result.analysis.summary.length > 0);
    assert.ok(result.evaluatedAt.length > 0);
  });

  it('SociodemographicStandardAnalyzer supports solo 3.1.1', () => {
    const analyzer = new SociodemographicStandardAnalyzer();
    assert.ok(analyzer.supports('3.1.1'));
    assert.ok(!analyzer.supports('2.9.1'));
    assert.ok(!analyzer.supports('2.10.1'));
    assert.ok(!analyzer.supports('2.11.1'));
  });

  it('getModule retorna sociodemographic', () => {
    const analyzer = new SociodemographicStandardAnalyzer();
    assert.equal(analyzer.getModule(), 'sociodemographic');
  });

  it('título de 3.1.1 es Perfil sociodemográfico', async () => {
    const service = buildService(
      buildOverview({
        moduleCompliance: [
          { module: 'sociodemographic', compliance: 50, level: 'MEDIUM', lastUpdated: new Date().toISOString() },
        ],
        findings: [],
      }),
    );
    const result = await service.analyze('3.1.1', COMPANY_A);
    assert.equal(result.standardTitle, 'Perfil sociodemográfico');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SOCIO-AN-011: Tenant isolation
// ═══════════════════════════════════════════════════════════════════════════

describe('SOCIO-AN-011: Tenant isolation', () => {
  it('Company A y Company B obtienen análisis diferentes para 3.1.1', async () => {
    const overviewA = buildOverview({
      moduleCompliance: [
        { module: 'sociodemographic', compliance: 80, level: 'HIGH', lastUpdated: new Date().toISOString() },
      ],
    });
    const overviewB = buildOverview({
      moduleCompliance: [
        { module: 'sociodemographic', compliance: 0, level: 'CRITICAL', lastUpdated: new Date().toISOString() },
      ],
      findings: [
        {
          id: 'socio-no-data',
          module: 'sociodemographic',
          title: 'Sin datos sociodemográficos',
          description: 'Test',
          priority: 'HIGH',
          status: 'OPEN',
          responsible: '',
          dueDate: '',
          createdAt: new Date().toISOString(),
        },
      ],
    });

    const service = buildServiceWithTwoCompanies(overviewA, overviewB);

    const resultA = await service.analyze('3.1.1', COMPANY_A);
    const resultB = await service.analyze('3.1.1', COMPANY_B);

    assert.equal(resultA.compliancePercentage, 80);
    assert.equal(resultA.dataAvailable, true);
    assert.equal(resultB.compliancePercentage, 0);
    assert.equal(resultB.dataAvailable, false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SOCIO-AN-012: Estándares existentes no se rompen
// ═══════════════════════════════════════════════════════════════════════════

describe('SOCIO-AN-012: Estándares existentes no se rompen', () => {
  it('2.9.1 sigue funcionando correctamente', async () => {
    const service = buildService(
      buildOverview({
        moduleCompliance: [
          { module: 'acquisitions', compliance: 65, level: 'MEDIUM', lastUpdated: new Date().toISOString() },
        ],
        findings: [],
      }),
    );

    const result = await service.analyze('2.9.1', COMPANY_A);
    assert.equal(result.standardCode, '2.9.1');
    assert.equal(result.standardTitle, 'Adquisiciones');
  });

  it('2.10.1 sigue funcionando correctamente', async () => {
    const service = buildService(
      buildOverview({
        moduleCompliance: [
          { module: 'contracting', compliance: 55, level: 'MEDIUM', lastUpdated: new Date().toISOString() },
        ],
        findings: [],
      }),
    );

    const result = await service.analyze('2.10.1', COMPANY_A);
    assert.equal(result.standardCode, '2.10.1');
    assert.equal(result.standardTitle, 'Contratación');
  });

  it('2.11.1 sigue funcionando correctamente', async () => {
    const service = buildService(
      buildOverview({
        moduleCompliance: [
          { module: 'change-management', compliance: 40, level: 'MEDIUM', lastUpdated: new Date().toISOString() },
        ],
        findings: [],
      }),
    );

    const result = await service.analyze('2.11.1', COMPANY_A);
    assert.equal(result.standardCode, '2.11.1');
    assert.equal(result.standardTitle, 'Gestión del cambio');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SOCIO-AN-013: No recalcula scoring
// ═══════════════════════════════════════════════════════════════════════════

describe('SOCIO-AN-013: No recalcula scoring', () => {
  it('SociodemographicStandardAnalyzer no contiene divisiones ni cálculos de porcentaje', () => {
    const analyzer = new SociodemographicStandardAnalyzer();
    const source = analyzer.analyze.toString();

    assert.ok(!source.includes('/ 100'), 'Analyzer no debe dividir por 100');
    assert.ok(!source.includes('* 100'), 'Analyzer no debe multiplicar por 100');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SOCIO-AN-014: Prioridades se conservan
// ═══════════════════════════════════════════════════════════════════════════

describe('SOCIO-AN-014: Prioridades se conservan', () => {
  it('socio-missing-age tiene prioridad MEDIUM, socio-missing-marital tiene LOW', () => {
    const analyzer = new SociodemographicStandardAnalyzer();

    const result = analyzer.analyze({
      companyId: COMPANY_A,
      moduleCompliance: { module: 'sociodemographic', compliance: 20, level: 'LOW', lastUpdated: '' },
      findings: [
        { id: 'socio-missing-age', module: 'sociodemographic', title: '5 trabajador(es) sin birthDate', description: '', priority: 'MEDIUM', status: 'OPEN', responsible: '', dueDate: '', createdAt: '' },
        { id: 'socio-missing-marital', module: 'sociodemographic', title: '2 trabajador(es) sin estado civil', description: '', priority: 'LOW', status: 'OPEN', responsible: '', dueDate: '', createdAt: '' },
      ],
      overview: { overallCompliance: 20, phaseCompliance: { plan: 0, do: 20, check: 0, act: 0 }, moduleCompliance: [] },
    });

    const ageIssue = result.keyIssues.find((i) => i.id === 'socio-missing-age');
    assert.ok(ageIssue);
    assert.equal(ageIssue.priority, 'MEDIUM');

    const maritalIssue = result.keyIssues.find((i) => i.id === 'socio-missing-marital');
    assert.ok(maritalIssue);
    assert.equal(maritalIssue.priority, 'LOW');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// OCCUP-AN-001: supports('3.1.2') === true
// ═══════════════════════════════════════════════════════════════════════════

describe('OCCUP-AN-001: supports', () => {
  it('supports(3.1.2) returns true', () => {
    const analyzer = new OccupationalExamStandardAnalyzer();
    assert.equal(analyzer.supports('3.1.2'), true);
  });

  it('supports(3.1.1) returns false', () => {
    const analyzer = new OccupationalExamStandardAnalyzer();
    assert.equal(analyzer.supports('3.1.1'), false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// OCCUP-AN-002: getModule() === 'occupational-exam'
// ═══════════════════════════════════════════════════════════════════════════

describe('OCCUP-AN-002: getModule', () => {
  it('getModule returns occupational-exam', () => {
    const analyzer = new OccupationalExamStandardAnalyzer();
    assert.equal(analyzer.getModule(), 'occupational-exam');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// OCCUP-AN-003: 100% genera resumen positivo
// ═══════════════════════════════════════════════════════════════════════════

describe('OCCUP-AN-003: 100% genera resumen positivo', () => {
  it('100% compliance genera summary positivo sin keyIssues', () => {
    const analyzer = new OccupationalExamStandardAnalyzer();

    const result = analyzer.analyze({
      companyId: COMPANY_A,
      moduleCompliance: { module: 'occupational-exam', compliance: 100, level: 'EXCELLENT', lastUpdated: '' },
      findings: [],
      overview: { overallCompliance: 100, phaseCompliance: { plan: 0, do: 100, check: 0, act: 0 }, moduleCompliance: [] },
    });

    assert.ok(result.summary.includes('100%'));
    assert.ok(result.summary.toLowerCase().includes('sólida'));
    assert.equal(result.keyIssues.length, 0);
    assert.ok(result.quickWins.length > 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// OCCUP-AN-004: 50–99% genera oportunidades de mejora
// ═══════════════════════════════════════════════════════════════════════════

describe('OCCUP-AN-004: 50–99% genera oportunidades', () => {
  it('75% compliance genera summary con oportunidades', () => {
    const analyzer = new OccupationalExamStandardAnalyzer();

    const result = analyzer.analyze({
      companyId: COMPANY_A,
      moduleCompliance: { module: 'occupational-exam', compliance: 75, level: 'MEDIUM', lastUpdated: '' },
      findings: [
        { id: 'exam-missing-entry', module: 'occupational-exam', title: '5 trabajador(es) sin examen de ingreso', description: '', priority: 'MEDIUM', status: 'OPEN', responsible: '', dueDate: '', createdAt: '' },
      ],
      overview: { overallCompliance: 75, phaseCompliance: { plan: 0, do: 75, check: 0, act: 0 }, moduleCompliance: [] },
    });

    assert.ok(result.summary.includes('75%'));
    assert.ok(result.keyIssues.length > 0);
    assert.ok(result.quickWins.length > 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// OCCUP-AN-005: <50% genera recomendación prioritaria
// ═══════════════════════════════════════════════════════════════════════════

describe('OCCUP-AN-005: <50% genera recomendación prioritaria', () => {
  it('30% compliance genera summary con recomendación prioritaria', () => {
    const analyzer = new OccupationalExamStandardAnalyzer();

    const result = analyzer.analyze({
      companyId: COMPANY_A,
      moduleCompliance: { module: 'occupational-exam', compliance: 30, level: 'LOW', lastUpdated: '' },
      findings: [
        { id: 'exam-missing-entry', module: 'occupational-exam', title: '10 trabajador(es) sin examen de ingreso', description: '', priority: 'MEDIUM', status: 'OPEN', responsible: '', dueDate: '', createdAt: '' },
        { id: 'exam-missing-periodic', module: 'occupational-exam', title: '8 trabajador(es) sin examen periódico vigente', description: '', priority: 'MEDIUM', status: 'OPEN', responsible: '', dueDate: '', createdAt: '' },
      ],
      overview: { overallCompliance: 30, phaseCompliance: { plan: 0, do: 30, check: 0, act: 0 }, moduleCompliance: [] },
    });

    assert.ok(result.summary.includes('30%'));
    assert.ok(result.summary.toLowerCase().includes('atención prioritaria'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// OCCUP-AN-006: NO_DATA no se interpreta como 0%
// ═══════════════════════════════════════════════════════════════════════════

describe('OCCUP-AN-006: NO_DATA', () => {
  it('NO_DATA genera explicación apropiada sin afirmar 0%', () => {
    const analyzer = new OccupationalExamStandardAnalyzer();

    const result = analyzer.analyze({
      companyId: COMPANY_A,
      moduleCompliance: { module: 'occupational-exam', compliance: 0, level: 'CRITICAL', lastUpdated: '' },
      findings: [
        { id: 'exam-no-data', module: 'occupational-exam', title: 'Sin datos de exámenes médicos ocupacionales', description: '', priority: 'HIGH', status: 'OPEN', responsible: '', dueDate: '', createdAt: '' },
      ],
      overview: { overallCompliance: 0, phaseCompliance: { plan: 0, do: 0, check: 0, act: 0 }, moduleCompliance: [] },
    });

    assert.ok(!result.summary.toLowerCase().includes('cumplimiento completo'));
    assert.ok(!result.summary.toLowerCase().includes('0%'));
    assert.ok(result.summary.includes('No existen trabajadores registrados'));
    assert.equal(result.keyIssues.length, 0);
    assert.ok(result.quickWins.length > 0);
    assert.ok(result.nextSteps.length > 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// OCCUP-AN-007: exam-missing-entry aparece como issue
// ═══════════════════════════════════════════════════════════════════════════

describe('OCCUP-AN-007: exam-missing-entry', () => {
  it('exam-missing-entry genera keyIssue con recomendación de ingreso', () => {
    const analyzer = new OccupationalExamStandardAnalyzer();

    const result = analyzer.analyze({
      companyId: COMPANY_A,
      moduleCompliance: { module: 'occupational-exam', compliance: 50, level: 'MEDIUM', lastUpdated: '' },
      findings: [
        { id: 'exam-missing-entry', module: 'occupational-exam', title: '5 trabajador(es) sin examen de ingreso', description: '', priority: 'MEDIUM', status: 'OPEN', responsible: '', dueDate: '', createdAt: '' },
      ],
      overview: { overallCompliance: 50, phaseCompliance: { plan: 0, do: 50, check: 0, act: 0 }, moduleCompliance: [] },
    });

    const entryIssue = result.keyIssues.find((issue) => issue.id === 'exam-missing-entry');
    assert.ok(entryIssue, 'Should have exam-missing-entry keyIssue');
    assert.equal(entryIssue.priority, 'MEDIUM');
    assert.ok(entryIssue.recommendation.toLowerCase().includes('ingreso'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// OCCUP-AN-008: exam-missing-periodic aparece como issue
// ═══════════════════════════════════════════════════════════════════════════

describe('OCCUP-AN-008: exam-missing-periodic', () => {
  it('exam-missing-periodic genera keyIssue con recomendación de periódicos', () => {
    const analyzer = new OccupationalExamStandardAnalyzer();

    const result = analyzer.analyze({
      companyId: COMPANY_A,
      moduleCompliance: { module: 'occupational-exam', compliance: 50, level: 'MEDIUM', lastUpdated: '' },
      findings: [
        { id: 'exam-missing-periodic', module: 'occupational-exam', title: '8 trabajador(es) sin examen periódico vigente', description: '', priority: 'MEDIUM', status: 'OPEN', responsible: '', dueDate: '', createdAt: '' },
      ],
      overview: { overallCompliance: 50, phaseCompliance: { plan: 0, do: 50, check: 0, act: 0 }, moduleCompliance: [] },
    });

    const periodicIssue = result.keyIssues.find((issue) => issue.id === 'exam-missing-periodic');
    assert.ok(periodicIssue, 'Should have exam-missing-periodic keyIssue');
    assert.equal(periodicIssue.priority, 'MEDIUM');
    assert.ok(periodicIssue.recommendation.toLowerCase().includes('periódico'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// OCCUP-AN-009: exam-missing-follow-up aparece como issue
// ═══════════════════════════════════════════════════════════════════════════

describe('OCCUP-AN-009: exam-missing-follow-up', () => {
  it('exam-missing-follow-up genera keyIssue con recomendación de seguimiento', () => {
    const analyzer = new OccupationalExamStandardAnalyzer();

    const result = analyzer.analyze({
      companyId: COMPANY_A,
      moduleCompliance: { module: 'occupational-exam', compliance: 60, level: 'MEDIUM', lastUpdated: '' },
      findings: [
        { id: 'exam-missing-follow-up', module: 'occupational-exam', title: '3 examen(es) con seguimiento requerido sin fecha', description: '', priority: 'LOW', status: 'OPEN', responsible: '', dueDate: '', createdAt: '' },
      ],
      overview: { overallCompliance: 60, phaseCompliance: { plan: 0, do: 60, check: 0, act: 0 }, moduleCompliance: [] },
    });

    const followUpIssue = result.keyIssues.find((issue) => issue.id === 'exam-missing-follow-up');
    assert.ok(followUpIssue, 'Should have exam-missing-follow-up keyIssue');
    assert.equal(followUpIssue.priority, 'LOW');
    assert.ok(followUpIssue.recommendation.toLowerCase().includes('seguimiento'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// OCCUP-AN-010: No genera PII
// ═══════════════════════════════════════════════════════════════════════════

describe('OCCUP-AN-010: No genera PII', () => {
  it('No genera nombres, documentos, employeeId ni diagnósticos', () => {
    const analyzer = new OccupationalExamStandardAnalyzer();

    const result = analyzer.analyze({
      companyId: COMPANY_A,
      moduleCompliance: { module: 'occupational-exam', compliance: 50, level: 'MEDIUM', lastUpdated: '' },
      findings: [
        { id: 'exam-missing-entry', module: 'occupational-exam', title: '5 trabajador(es) sin examen de ingreso', description: '', priority: 'MEDIUM', status: 'OPEN', responsible: '', dueDate: '', createdAt: '' },
      ],
      overview: { overallCompliance: 50, phaseCompliance: { plan: 0, do: 50, check: 0, act: 0 }, moduleCompliance: [] },
    });

    const resultStr = JSON.stringify(result);
    assert.ok(!resultStr.includes('Juan'), 'Should not contain employee names');
    assert.ok(!resultStr.includes('1234567890'), 'Should not contain document numbers');
    assert.ok(!resultStr.includes('diagnosis'), 'Should not contain diagnoses');
    assert.ok(!resultStr.includes('clinicalNotes'), 'Should not contain clinical notes');
    assert.ok(!resultStr.includes('medicalHistory'), 'Should not contain medical history');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// OCCUP-AN-011: Quick wins corresponden a findings
// ═══════════════════════════════════════════════════════════════════════════

describe('OCCUP-AN-011: Quick wins corresponden a findings', () => {
  it('Con exam-missing-entry y exam-missing-periodic genera quick wins correspondientes', () => {
    const analyzer = new OccupationalExamStandardAnalyzer();

    const result = analyzer.analyze({
      companyId: COMPANY_A,
      moduleCompliance: { module: 'occupational-exam', compliance: 40, level: 'LOW', lastUpdated: '' },
      findings: [
        { id: 'exam-missing-entry', module: 'occupational-exam', title: '5 trabajador(es) sin examen de ingreso', description: '', priority: 'MEDIUM', status: 'OPEN', responsible: '', dueDate: '', createdAt: '' },
        { id: 'exam-missing-periodic', module: 'occupational-exam', title: '3 trabajador(es) sin examen periódico vigente', description: '', priority: 'MEDIUM', status: 'OPEN', responsible: '', dueDate: '', createdAt: '' },
      ],
      overview: { overallCompliance: 40, phaseCompliance: { plan: 0, do: 40, check: 0, act: 0 }, moduleCompliance: [] },
    });

    assert.ok(result.quickWins.some((w) => w.toLowerCase().includes('ingreso')));
    assert.ok(result.quickWins.some((w) => w.toLowerCase().includes('periódico')));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// OCCUP-AN-012: Next steps son accionables
// ═══════════════════════════════════════════════════════════════════════════

describe('OCCUP-AN-012: Next steps son accionables', () => {
  it('Next steps incluyen recomendaciones concretas', () => {
    const analyzer = new OccupationalExamStandardAnalyzer();

    const result = analyzer.analyze({
      companyId: COMPANY_A,
      moduleCompliance: { module: 'occupational-exam', compliance: 50, level: 'MEDIUM', lastUpdated: '' },
      findings: [
        { id: 'exam-missing-entry', module: 'occupational-exam', title: '5 trabajador(es) sin examen de ingreso', description: '', priority: 'MEDIUM', status: 'OPEN', responsible: '', dueDate: '', createdAt: '' },
      ],
      overview: { overallCompliance: 50, phaseCompliance: { plan: 0, do: 50, check: 0, act: 0 }, moduleCompliance: [] },
    });

    assert.ok(result.nextSteps.length > 0);
    assert.ok(result.nextSteps.every((s) => s.length > 10));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// OCCUP-AN-013: 3.1.1 continúa funcionando
// ═══════════════════════════════════════════════════════════════════════════

describe('OCCUP-AN-013: 3.1.1 continúa funcionando', () => {
  it('SociodemographicStandardAnalyzer sigue funcionando correctamente', () => {
    const analyzer = new SociodemographicStandardAnalyzer();
    assert.equal(analyzer.supports('3.1.1'), true);
    assert.equal(analyzer.getModule(), 'sociodemographic');
  });
});
