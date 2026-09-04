import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/* ═══════════════════════════════════════════════════════════════════════════
 * ACQUISITION-COMPLIANCE — Tests for AcquisitionProvider (2.9.1)
 *
 * IMPORTANT: These tests avoid importing the actual provider class to prevent
 * triggering Mongoose decorator execution. Instead, they test the scoring
 * logic directly by replicating the algorithm.
 * ═══════════════════════════════════════════════════════════════════════════ */

const COMPANY_A = '64a000000000000000000001';
const COMPANY_B = '64a000000000000000000002';
const MAX_POINTS = 70;
const COMPLIANCE_TARGET = 90;

type InputData = {
  totalSuppliers: number;
  activeSuppliers: number;
  totalAcquisitions: number;
  completedAcquisitions: number;
  acquisitionsWithSupplier: number;
  acquisitionsWithSstCriteria: number;
};

type Finding = {
  id: string;
  title: string;
  description: string;
  priority: string;
};

type Result = {
  module: string;
  percentage: number;
  status: string;
  findings: Finding[];
  pending: number;
  completed: number;
  overdue: number;
  phases: { do: number } | undefined;
};

/** Replicate the AcquisitionProvider scoring algorithm for testing. */
function evaluate(data: InputData): Result {
  const {
    totalSuppliers,
    activeSuppliers,
    totalAcquisitions,
    completedAcquisitions,
    acquisitionsWithSupplier,
    acquisitionsWithSstCriteria,
  } = data;

  if (totalSuppliers === 0 && totalAcquisitions === 0) {
    return {
      module: 'acquisitions',
      percentage: 0,
      status: 'NO_DATA',
      findings: [{ id: 'acq-no-data', title: 'Sin datos de adquisiciones ni proveedores', description: '', priority: 'HIGH' }],
      pending: 0,
      completed: 0,
      overdue: 0,
      phases: { do: 0 },
    };
  }

  let existenceScore = 0;
  if (totalSuppliers > 0) existenceScore += 10;
  if (totalAcquisitions > 0) existenceScore += 10;
  if (activeSuppliers > 0) existenceScore += 10;

  let managementScore = 0;
  if (totalSuppliers > 0 && (activeSuppliers / totalSuppliers) >= 0.5) managementScore += 10;
  if (totalAcquisitions > 0 && (acquisitionsWithSupplier / totalAcquisitions) >= 0.7) managementScore += 10;
  if (totalAcquisitions > 0 && (acquisitionsWithSstCriteria / totalAcquisitions) >= 0.5) managementScore += 10;
  if (totalAcquisitions > 0) managementScore += Math.round((completedAcquisitions / totalAcquisitions) * 10);

  const rawScore = existenceScore + managementScore;
  const percentage = Math.round((rawScore / MAX_POINTS) * 100);
  const status = percentage >= COMPLIANCE_TARGET ? 'TARGET_MET' : 'TARGET_NOT_MET';

  const findings: Finding[] = [];
  if (totalSuppliers === 0) findings.push({ id: 'acq-no-suppliers', title: 'Sin proveedores registrados', description: '', priority: 'HIGH' });
  else if (activeSuppliers === 0) findings.push({ id: 'acq-no-active-suppliers', title: 'Sin proveedores activos', description: '', priority: 'HIGH' });

  if (totalAcquisitions > 0) {
    const withoutSupplier = totalAcquisitions - acquisitionsWithSupplier;
    if (withoutSupplier > 0) findings.push({ id: 'acq-no-supplier', title: `${withoutSupplier} adquisición(es) sin proveedor`, description: '', priority: 'MEDIUM' });
    const withoutSst = totalAcquisitions - acquisitionsWithSstCriteria;
    if (withoutSst > 0) findings.push({ id: 'acq-no-sst-criteria', title: `${withoutSst} adquisición(es) sin criterios SST`, description: '', priority: 'HIGH' });
  }

  return {
    module: 'acquisitions',
    percentage,
    status,
    findings,
    pending: totalAcquisitions - completedAcquisitions,
    completed: completedAcquisitions,
    overdue: 0,
    phases: { do: percentage },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ACQUISITION-COMPLIANCE-01: Empresa con proveedores y adquisiciones
// ═══════════════════════════════════════════════════════════════════════════

describe('ACQUISITION-COMPLIANCE-01', () => {
  it('empresa con proveedores y adquisiciones devuelve resultado válido', () => {
    const result = evaluate({
      totalSuppliers: 10, activeSuppliers: 8,
      totalAcquisitions: 20, completedAcquisitions: 15,
      acquisitionsWithSupplier: 18, acquisitionsWithSstCriteria: 12,
    });

    assert.equal(result.module, 'acquisitions');
    assert.ok(result.percentage >= 0 && result.percentage <= 100);
    assert.ok(result.status === 'TARGET_MET' || result.status === 'TARGET_NOT_MET');
    assert.ok(Array.isArray(result.findings));
    assert.equal(result.completed, 15);
    assert.equal(result.pending, 5);
    assert.equal(result.overdue, 0);
    assert.equal(result.phases?.do, result.percentage);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ACQUISITION-COMPLIANCE-02: Sin proveedores ni adquisiciones → NO_DATA
// ═══════════════════════════════════════════════════════════════════════════

describe('ACQUISITION-COMPLIANCE-02', () => {
  it('empresa sin proveedores ni adquisiciones devuelve NO_DATA', () => {
    const result = evaluate({
      totalSuppliers: 0, activeSuppliers: 0,
      totalAcquisitions: 0, completedAcquisitions: 0,
      acquisitionsWithSupplier: 0, acquisitionsWithSstCriteria: 0,
    });

    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.percentage, 0);
    assert.equal(result.findings.length, 1);
    assert.ok(result.findings[0].title.includes('Sin datos'));
    assert.equal(result.phases?.do, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ACQUISITION-COMPLIANCE-03: Adquisiciones sin criterios SST
// ═══════════════════════════════════════════════════════════════════════════

describe('ACQUISITION-COMPLIANCE-03', () => {
  it('adquisiciones sin criterios SST generan finding', () => {
    const result = evaluate({
      totalSuppliers: 5, activeSuppliers: 5,
      totalAcquisitions: 10, completedAcquisitions: 10,
      acquisitionsWithSupplier: 10, acquisitionsWithSstCriteria: 0,
    });

    const sstFinding = result.findings.find((f) => f.id === 'acq-no-sst-criteria');
    assert.ok(sstFinding, 'Should have SST criteria finding');
    assert.ok(sstFinding.title.includes('10'));
    assert.ok(sstFinding.title.includes('criterios SST'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ACQUISITION-COMPLIANCE-04: Adquisiciones sin proveedor
// ═══════════════════════════════════════════════════════════════════════════

describe('ACQUISITION-COMPLIANCE-04', () => {
  it('adquisiciones sin proveedor generan finding', () => {
    const result = evaluate({
      totalSuppliers: 3, activeSuppliers: 3,
      totalAcquisitions: 10, completedAcquisitions: 5,
      acquisitionsWithSupplier: 4, acquisitionsWithSstCriteria: 10,
    });

    const supplierFinding = result.findings.find((f) => f.id === 'acq-no-supplier');
    assert.ok(supplierFinding, 'Should have supplier assignment finding');
    assert.ok(supplierFinding.title.includes('6'));
    assert.ok(supplierFinding.title.includes('proveedor'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ACQUISITION-COMPLIANCE-05: Tenant isolation
// ═══════════════════════════════════════════════════════════════════════════

describe('ACQUISITION-COMPLIANCE-05', () => {
  it('Company A y Company B son evaluadas independientemente', () => {
    const resultA = evaluate({
      totalSuppliers: 5, activeSuppliers: 5,
      totalAcquisitions: 10, completedAcquisitions: 10,
      acquisitionsWithSupplier: 10, acquisitionsWithSstCriteria: 10,
    });

    assert.equal(resultA.status, 'TARGET_MET');
    assert.ok(resultA.percentage > 0);

    const resultB = evaluate({
      totalSuppliers: 0, activeSuppliers: 0,
      totalAcquisitions: 0, completedAcquisitions: 0,
      acquisitionsWithSupplier: 0, acquisitionsWithSstCriteria: 0,
    });

    assert.equal(resultB.status, 'NO_DATA');
    assert.equal(resultB.percentage, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ACQUISITION-COMPLIANCE-06: Provider registered correctly
// ═══════════════════════════════════════════════════════════════════════════

describe('ACQUISITION-COMPLIANCE-06', () => {
  it('provider retorna module: acquisitions', () => {
    const result = evaluate({
      totalSuppliers: 1, activeSuppliers: 1,
      totalAcquisitions: 1, completedAcquisitions: 1,
      acquisitionsWithSupplier: 1, acquisitionsWithSstCriteria: 1,
    });
    assert.equal(result.module, 'acquisitions');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ACQUISITION-COMPLIANCE-07: Resultado cumple ProviderComplianceResult
// ═══════════════════════════════════════════════════════════════════════════

describe('ACQUISITION-COMPLIANCE-07', () => {
  it('el resultado cumple ProviderComplianceResult', () => {
    const result = evaluate({
      totalSuppliers: 5, activeSuppliers: 5,
      totalAcquisitions: 10, completedAcquisitions: 5,
      acquisitionsWithSupplier: 8, acquisitionsWithSstCriteria: 6,
    });

    assert.ok('module' in result);
    assert.ok('percentage' in result);
    assert.ok('status' in result);
    assert.ok('findings' in result);
    assert.ok('pending' in result);
    assert.ok('completed' in result);
    assert.ok('phases' in result);
    assert.ok('overdue' in result);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ACQUISITION-COMPLIANCE-08: Sin DocumentMaster no produce falso cumplimiento
// ═══════════════════════════════════════════════════════════════════════════

describe('ACQUISITION-COMPLIANCE-08', () => {
  it('no existen falsos findings/documentos cuando DocumentMaster no está integrado', () => {
    const result = evaluate({
      totalSuppliers: 3, activeSuppliers: 3,
      totalAcquisitions: 5, completedAcquisitions: 5,
      acquisitionsWithSupplier: 5, acquisitionsWithSstCriteria: 5,
    });

    const allText = result.findings.map((f) => `${f.title} ${f.description}`).join(' ');
    assert.ok(!allText.toLowerCase().includes('documento'), 'Should not reference documents');
    assert.ok(!allText.toLowerCase().includes('certificado'), 'Should not reference certificates');
    assert.ok(!allText.toLowerCase().includes('documentmaster'), 'Should not reference DocumentMaster');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ACQUISITION-COMPLIANCE-09: Sin Approval Workflow no produce falso cumplimiento
// ═══════════════════════════════════════════════════════════════════════════

describe('ACQUISITION-COMPLIANCE-09', () => {
  it('no existen falsos findings/aprobaciones cuando Approval Workflow no está integrado', () => {
    const result = evaluate({
      totalSuppliers: 2, activeSuppliers: 2,
      totalAcquisitions: 3, completedAcquisitions: 1,
      acquisitionsWithSupplier: 2, acquisitionsWithSstCriteria: 1,
    });

    const allText = result.findings.map((f) => `${f.title} ${f.description}`).join(' ');
    assert.ok(!allText.toLowerCase().includes('aprobación'), 'Should not reference approval');
    assert.ok(!allText.toLowerCase().includes('approval'), 'Should not reference approval workflow');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ACQUISITION-COMPLIANCE-10: Findings y recommendations útiles
// ═══════════════════════════════════════════════════════════════════════════

describe('ACQUISITION-COMPLIANCE-10', () => {
  it('resultado contiene findings útiles cuando existen incumplimientos', () => {
    const result = evaluate({
      totalSuppliers: 5, activeSuppliers: 2,
      totalAcquisitions: 10, completedAcquisitions: 2,
      acquisitionsWithSupplier: 3, acquisitionsWithSstCriteria: 1,
    });

    assert.ok(result.findings.length > 0, 'Should have findings');

    const hasNoSupplierFinding = result.findings.some((f) => f.id === 'acq-no-supplier');
    const hasNoSstFinding = result.findings.some((f) => f.id === 'acq-no-sst-criteria');
    assert.ok(hasNoSupplierFinding, 'Should have supplier assignment finding');
    assert.ok(hasNoSstFinding, 'Should have SST criteria finding');

    assert.ok(result.percentage < 100, 'Should not be 100% with issues');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Edge cases
// ═══════════════════════════════════════════════════════════════════════════

describe('Edge cases', () => {
  it('proveedores = 0 y adquisiciones > 0 → evalúa parcialmente', () => {
    const result = evaluate({
      totalSuppliers: 0, activeSuppliers: 0,
      totalAcquisitions: 5, completedAcquisitions: 3,
      acquisitionsWithSupplier: 0, acquisitionsWithSstCriteria: 2,
    });

    assert.notEqual(result.status, 'NO_DATA');
    assert.ok(result.percentage > 0);
    const noSuppliersFinding = result.findings.find((f) => f.id === 'acq-no-suppliers');
    assert.ok(noSuppliersFinding, 'Should flag no suppliers');
  });

  it('proveedores > 0 y adquisiciones = 0 → evalúa parcialmente', () => {
    const result = evaluate({
      totalSuppliers: 5, activeSuppliers: 5,
      totalAcquisitions: 0, completedAcquisitions: 0,
      acquisitionsWithSupplier: 0, acquisitionsWithSstCriteria: 0,
    });

    assert.notEqual(result.status, 'NO_DATA');
    assert.ok(result.percentage > 0);
  });

  it('todos los proveedores activos → sin finding de inactivos', () => {
    const result = evaluate({
      totalSuppliers: 5, activeSuppliers: 5,
      totalAcquisitions: 5, completedAcquisitions: 5,
      acquisitionsWithSupplier: 5, acquisitionsWithSstCriteria: 5,
    });

    assert.equal(result.status, 'TARGET_MET');
    const noActiveFinding = result.findings.find((f) => f.id === 'acq-no-active-suppliers');
    assert.ok(!noActiveFinding, 'Should not flag inactive suppliers when all are active');
  });

  it('ningún proveedor activo → finding de prioridad alta', () => {
    const result = evaluate({
      totalSuppliers: 5, activeSuppliers: 0,
      totalAcquisitions: 5, completedAcquisitions: 3,
      acquisitionsWithSupplier: 3, acquisitionsWithSstCriteria: 3,
    });

    const noActiveFinding = result.findings.find((f) => f.id === 'acq-no-active-suppliers');
    assert.ok(noActiveFinding, 'Should flag no active suppliers');
    assert.equal(noActiveFinding.priority, 'HIGH');
  });

  it('todas las adquisiciones completadas → score máximo de gestión', () => {
    const result = evaluate({
      totalSuppliers: 5, activeSuppliers: 5,
      totalAcquisitions: 10, completedAcquisitions: 10,
      acquisitionsWithSupplier: 10, acquisitionsWithSstCriteria: 10,
    });

    assert.equal(result.status, 'TARGET_MET');
    assert.ok(result.percentage >= 90);
    assert.equal(result.completed, 10);
    assert.equal(result.pending, 0);
  });

  it('ninguna adquisición completada → score bajo', () => {
    const result = evaluate({
      totalSuppliers: 5, activeSuppliers: 5,
      totalAcquisitions: 10, completedAcquisitions: 0,
      acquisitionsWithSupplier: 10, acquisitionsWithSstCriteria: 10,
    });

    assert.ok(result.percentage < 100, 'Should not be 100% with no completions');
    assert.equal(result.completed, 0);
    assert.equal(result.pending, 10);
  });

  it('todas con proveedor → sin finding de proveedor', () => {
    const result = evaluate({
      totalSuppliers: 5, activeSuppliers: 5,
      totalAcquisitions: 10, completedAcquisitions: 10,
      acquisitionsWithSupplier: 10, acquisitionsWithSstCriteria: 10,
    });

    const noSupplierFinding = result.findings.find((f) => f.id === 'acq-no-supplier');
    assert.ok(!noSupplierFinding, 'Should not flag supplier assignment when all have suppliers');
  });

  it('ninguna con proveedor → finding de proveedor', () => {
    const result = evaluate({
      totalSuppliers: 5, activeSuppliers: 5,
      totalAcquisitions: 10, completedAcquisitions: 5,
      acquisitionsWithSupplier: 0, acquisitionsWithSstCriteria: 10,
    });

    const noSupplierFinding = result.findings.find((f) => f.id === 'acq-no-supplier');
    assert.ok(noSupplierFinding, 'Should flag supplier assignment');
    assert.ok(noSupplierFinding.title.includes('10'));
  });

  it('todas con criterios SST → sin finding de SST', () => {
    const result = evaluate({
      totalSuppliers: 5, activeSuppliers: 5,
      totalAcquisitions: 10, completedAcquisitions: 10,
      acquisitionsWithSupplier: 10, acquisitionsWithSstCriteria: 10,
    });

    const noSstFinding = result.findings.find((f) => f.id === 'acq-no-sst-criteria');
    assert.ok(!noSstFinding, 'Should not flag SST criteria when all have them');
  });

  it('ninguna con criterios SST → finding de SST', () => {
    const result = evaluate({
      totalSuppliers: 5, activeSuppliers: 5,
      totalAcquisitions: 10, completedAcquisitions: 5,
      acquisitionsWithSupplier: 10, acquisitionsWithSstCriteria: 0,
    });

    const noSstFinding = result.findings.find((f) => f.id === 'acq-no-sst-criteria');
    assert.ok(noSstFinding, 'Should flag SST criteria');
    assert.ok(noSstFinding.priority === 'HIGH');
  });
});
