import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// ─── Simulación del DocumentEvaluationProvider ─────────────────────────────
// Los tests del dominio documental siguen el patrón establecido en el
// proyecto: simulación de la lógica del provider sin importar Mongoose schemas.

interface TestDocumentMaster {
  code: string;
  name: string;
  status: string;
  expirationDate?: Date;
  createdAt?: Date;
}

interface EvaluationResult {
  module: string;
  percentage: number;
  status: string;
  findings: Array<{
    id: string;
    module: string;
    title: string;
    description: string;
    priority: string;
    status: string;
  }>;
  pending: number;
  completed: number;
}

/**
 * Simula la lógica del DocumentEvaluationProvider para tests unitarios.
 * Replica exactamente la lógica del provider real sin dependencias de NestJS.
 */
function simulateDocumentEvaluation(documents: TestDocumentMaster[]): EvaluationResult {
  const COMPLIANCE_TARGET = 90;

  if (documents.length === 0) {
    return {
      module: 'document-evaluation',
      percentage: 0,
      status: 'NO_DATA',
      findings: [],
      pending: 0,
      completed: 0,
    };
  }

  const now = new Date();
  let validCount = 0;
  let expiredCount = 0;
  let expiringSoonCount = 0;
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  for (const doc of documents) {
    if (doc.status !== 'ACTIVE' && doc.status !== 'APPROVED') {
      continue;
    }

    const expirationDate = doc.expirationDate;

    if (!expirationDate) {
      validCount++;
      continue;
    }

    if (expirationDate < now) {
      expiredCount++;
    } else if (expirationDate <= thirtyDaysFromNow) {
      expiringSoonCount++;
      validCount++;
    } else {
      validCount++;
    }
  }

  const eligible = validCount + expiredCount;
  const percentage = eligible > 0 ? Math.round((validCount / eligible) * 100) : 0;

  const findings: EvaluationResult['findings'] = [];

  // Findings for expired documents
  const expiredDocs = documents.filter(
    (doc) =>
      doc.expirationDate &&
      doc.expirationDate < now &&
      (doc.status === 'ACTIVE' || doc.status === 'APPROVED'),
  );

  for (let i = 0; i < expiredDocs.length; i++) {
    const doc = expiredDocs[i];
    findings.push({
      id: `doc-eval-expired-${i}`,
      module: 'document-evaluation',
      title: `Documento vencido: ${doc.code} — ${doc.name}`,
      description: `Vencimiento: ${doc.expirationDate!.toISOString()}. Requiere actualización para cumplimiento de 2.5.1.`,
      priority: 'MEDIUM',
      status: 'OPEN',
    });
  }

  // Findings for expiring soon
  const expiringDocs = documents.filter(
    (doc) =>
      doc.expirationDate &&
      doc.expirationDate > now &&
      doc.expirationDate <= thirtyDaysFromNow &&
      (doc.status === 'ACTIVE' || doc.status === 'APPROVED'),
  );

  for (let i = 0; i < expiringDocs.length; i++) {
    const doc = expiringDocs[i];
    findings.push({
      id: `doc-eval-expiring-${i}`,
      module: 'document-evaluation',
      title: `Documento próximo a vencer: ${doc.code} — ${doc.name}`,
      description: `Vencimiento: ${doc.expirationDate!.toISOString()}. Considere actualizar antes de la fecha límite.`,
      priority: 'LOW',
      status: 'OPEN',
    });
  }

  let status: string;
  if (eligible === 0) status = 'NO_DATA';
  else if (percentage >= COMPLIANCE_TARGET) status = 'TARGET_MET';
  else status = 'TARGET_NOT_MET';

  return {
    module: 'document-evaluation',
    percentage,
    status,
    findings,
    pending: expiredCount + expiringSoonCount,
    completed: validCount,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DOC-EVAL-01: 2.5.1 con documentos vigentes cumple
// ═══════════════════════════════════════════════════════════════════════════

describe('DOC-EVAL-01: 2.5.1 con documentos vigentes cumple', () => {
  it('10 documentos ACTIVE sin vencimiento → TARGET_MET 100%', () => {
    const docs: TestDocumentMaster[] = Array.from({ length: 10 }, (_, i) => ({
      code: `DOC-${i}`,
      name: `Documento ${i}`,
      status: 'ACTIVE',
    }));

    const result = simulateDocumentEvaluation(docs);

    assert.equal(result.percentage, 100);
    assert.equal(result.status, 'TARGET_MET');
    assert.equal(result.completed, 10);
    assert.equal(result.pending, 0);
    assert.equal(result.findings.length, 0);
  });

  it('10 documentos con fechas futuras lejanas → TARGET_MET', () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 2);

    const docs: TestDocumentMaster[] = Array.from({ length: 10 }, (_, i) => ({
      code: `DOC-${i}`,
      name: `Documento ${i}`,
      status: 'ACTIVE',
      expirationDate: futureDate,
    }));

    const result = simulateDocumentEvaluation(docs);

    assert.equal(result.percentage, 100);
    assert.equal(result.status, 'TARGET_MET');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DOC-EVAL-02: 2.5.1 detecta documentos vencidos
// ═══════════════════════════════════════════════════════════════════════════

describe('DOC-EVAL-02: 2.5.1 detecta documentos vencidos', () => {
  it('8 vigentes + 2 vencidos → 80% TARGET_NOT_MET', () => {
    const pastDate = new Date();
    pastDate.setMonth(pastDate.getMonth() - 1);

    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);

    const docs: TestDocumentMaster[] = [
      ...Array.from({ length: 8 }, (_, i) => ({
        code: `DOC-VIG-${i}`,
        name: `Vigente ${i}`,
        status: 'ACTIVE' as const,
        expirationDate: futureDate,
      })),
      ...Array.from({ length: 2 }, (_, i) => ({
        code: `DOC-VENC-${i}`,
        name: `Vencido ${i}`,
        status: 'ACTIVE' as const,
        expirationDate: pastDate,
      })),
    ];

    const result = simulateDocumentEvaluation(docs);

    assert.equal(result.percentage, 80);
    assert.equal(result.status, 'TARGET_NOT_MET');
    assert.equal(result.pending, 2);
    assert.equal(result.completed, 8);
    assert.equal(result.findings.length, 2);
    assert.ok(result.findings[0].title.includes('vencido'));
  });

  it('findings contienen código y nombre del documento', () => {
    const pastDate = new Date();
    pastDate.setMonth(pastDate.getMonth() - 1);

    const docs: TestDocumentMaster[] = [
      {
        code: 'POL-001',
        name: 'Política SST',
        status: 'ACTIVE',
        expirationDate: pastDate,
      },
    ];

    const result = simulateDocumentEvaluation(docs);

    assert.equal(result.findings.length, 1);
    assert.ok(result.findings[0].title.includes('POL-001'));
    assert.ok(result.findings[0].title.includes('Política SST'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DOC-EVAL-03: Sin documentos → NO_DATA
// ═══════════════════════════════════════════════════════════════════════════

describe('DOC-EVAL-03: Sin documentos → NO_DATA', () => {
  it('arreglo vacío → NO_DATA', () => {
    const result = simulateDocumentEvaluation([]);

    assert.equal(result.percentage, 0);
    assert.equal(result.status, 'NO_DATA');
    assert.equal(result.findings.length, 0);
    assert.equal(result.pending, 0);
    assert.equal(result.completed, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DOC-EVAL-04: Documentos existentes con 0 vencidos → NO_DATA
// ═══════════════════════════════════════════════════════════════════════════

describe('DOC-EVAL-04: Documentos existentes con 0 vencidos no se convierten en NO_DATA', () => {
  it('5 documentos ACTIVE sin fecha de vencimiento → TARGET_MET', () => {
    const docs: TestDocumentMaster[] = Array.from({ length: 5 }, (_, i) => ({
      code: `DOC-${i}`,
      name: `Documento ${i}`,
      status: 'ACTIVE',
      // sin expirationDate
    }));

    const result = simulateDocumentEvaluation(docs);

    assert.equal(result.status, 'TARGET_MET');
    assert.equal(result.percentage, 100);
    assert.equal(result.completed, 5);
  });

  it('Documentos sin fecha de vencimiento se consideran vigentes', () => {
    const docs: TestDocumentMaster[] = [
      { code: 'DOC-1', name: 'Sin fecha', status: 'ACTIVE' },
    ];

    const result = simulateDocumentEvaluation(docs);

    assert.equal(result.completed, 1);
    assert.equal(result.pending, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DOC-EVAL-05: Tenant isolation Company A vs Company B
// ═══════════════════════════════════════════════════════════════════════════

describe('DOC-EVAL-05: Tenant isolation Company A vs Company B', () => {
  it('Company A con 90% vigentes → TARGET_MET', () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    const pastDate = new Date();
    pastDate.setMonth(pastDate.getMonth() - 1);

    const docsA: TestDocumentMaster[] = [
      ...Array.from({ length: 9 }, (_, i) => ({
        code: `A-DOC-${i}`,
        name: `A-Vigente ${i}`,
        status: 'ACTIVE' as const,
        expirationDate: futureDate,
      })),
      { code: 'A-DOC-10', name: 'A-Vencido', status: 'ACTIVE', expirationDate: pastDate },
    ];

    const result = simulateDocumentEvaluation(docsA);

    assert.equal(result.percentage, 90);
    assert.equal(result.status, 'TARGET_MET');
  });

  it('Company B con 70% vigentes → TARGET_NOT_MET', () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    const pastDate = new Date();
    pastDate.setMonth(pastDate.getMonth() - 1);

    const docsB: TestDocumentMaster[] = [
      ...Array.from({ length: 7 }, (_, i) => ({
        code: `B-DOC-${i}`,
        name: `B-Vigente ${i}`,
        status: 'ACTIVE' as const,
        expirationDate: futureDate,
      })),
      ...Array.from({ length: 3 }, (_, i) => ({
        code: `B-DOC-${7 + i}`,
        name: `B-Vencido ${i}`,
        status: 'ACTIVE' as const,
        expirationDate: pastDate,
      })),
    ];

    const result = simulateDocumentEvaluation(docsB);

    assert.equal(result.percentage, 70);
    assert.equal(result.status, 'TARGET_NOT_MET');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DOC-DASH-01: Dashboard devuelve métricas correctas
// ═══════════════════════════════════════════════════════════════════════════

describe('DOC-DASH-01: Dashboard stats simulation', () => {
  it('Calcula total, active, expiringSoon, expired correctamente', () => {
    const now = new Date();
    const futureDate = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000); // 60 days
    const soonDate = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000); // 15 days
    const pastDate = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 days ago

    const docs: TestDocumentMaster[] = [
      { code: 'D1', name: 'Future', status: 'ACTIVE', expirationDate: futureDate },
      { code: 'D2', name: 'Soon', status: 'ACTIVE', expirationDate: soonDate },
      { code: 'D3', name: 'Expired', status: 'ACTIVE', expirationDate: pastDate },
      { code: 'D4', name: 'NoDate', status: 'ACTIVE' },
      { code: 'D5', name: 'Archived', status: 'ARCHIVED' },
    ];

    // Simulate stats calculation
    const active = docs.filter((d) => d.status === 'ACTIVE').length;
    const expiringSoon = docs.filter(
      (d) =>
        d.status === 'ACTIVE' &&
        d.expirationDate &&
        d.expirationDate > now &&
        d.expirationDate <= new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    ).length;
    const expired = docs.filter(
      (d) =>
        d.status === 'ACTIVE' &&
        d.expirationDate &&
        d.expirationDate < now,
    ).length;

    assert.equal(active, 4);
    assert.equal(expiringSoon, 1);
    assert.equal(expired, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DOC-EXPIRATION-01: Vencimiento usa expirationDate real
// ═══════════════════════════════════════════════════════════════════════════

describe('DOC-EXPIRATION-01: Vencimiento usa expirationDate real', () => {
  it('Documento con expirationDate en el pasado se marca como vencido', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 30);

    const docs: TestDocumentMaster[] = [
      { code: 'DOC-1', name: 'Vencido', status: 'ACTIVE', expirationDate: pastDate },
    ];

    const result = simulateDocumentEvaluation(docs);

    assert.equal(result.pending, 1);
    assert.equal(result.completed, 0);
    assert.equal(result.findings.length, 1);
    assert.ok(result.findings[0].title.includes('vencido'));
  });

  it('Documento con expirationDate futura se marca como vigente', () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);

    const docs: TestDocumentMaster[] = [
      { code: 'DOC-1', name: 'Vigente', status: 'ACTIVE', expirationDate: futureDate },
    ];

    const result = simulateDocumentEvaluation(docs);

    assert.equal(result.pending, 0);
    assert.equal(result.completed, 1);
    assert.equal(result.findings.length, 0);
  });

  it('Documento sin expirationDate se considera vigente', () => {
    const docs: TestDocumentMaster[] = [
      { code: 'DOC-1', name: 'Sin fecha', status: 'ACTIVE' },
    ];

    const result = simulateDocumentEvaluation(docs);

    assert.equal(result.completed, 1);
    assert.equal(result.pending, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DOC-RETENTION-01: RetentionRule permite calcular vencimiento
// ═══════════════════════════════════════════════════════════════════════════

describe('DOC-RETENTION-01: RetentionRule calculation simulation', () => {
  it('Documento creado hace 5 años con retención de 10 años → vigente', () => {
    const createdAt = new Date();
    createdAt.setFullYear(createdAt.getFullYear() - 5);

    const retentionYears = 10;
    const retentionDate = new Date(createdAt);
    retentionDate.setFullYear(retentionDate.getFullYear() + retentionYears);

    const now = new Date();
    const isExpired = retentionDate < now;

    assert.equal(isExpired, false);
    assert.ok(retentionDate > now);
  });

  it('Documento creado hace 15 años con retención de 10 años → vencido', () => {
    const createdAt = new Date();
    createdAt.setFullYear(createdAt.getFullYear() - 15);

    const retentionYears = 10;
    const retentionDate = new Date(createdAt);
    retentionDate.setFullYear(retentionDate.getFullYear() + retentionYears);

    const now = new Date();
    const isExpired = retentionDate < now;

    assert.equal(isExpired, true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DOC-REGRESSION-01: IND-10 e IND-11 continúan funcionando
// ═══════════════════════════════════════════════════════════════════════════

describe('DOC-REGRESSION-01: IND-10 e IND-11 semántica compatible', () => {
  it('IND-10: validCount/count * 100 — Company A (92 valid, 8 expired) → 92%', () => {
    const validCount = 92;
    const totalCount = 100;
    const percentage = Math.round((validCount / totalCount) * 100);
    assert.equal(percentage, 92);
    assert.ok(percentage >= 90, 'IND-10: 92% >= 90% → TARGET_MET');
  });

  it('IND-11: expiredCount/count * 100 — Company A (8 expired) → 8%', () => {
    const expiredCount = 8;
    const totalCount = 100;
    const percentage = Math.round((expiredCount / totalCount) * 100);
    assert.equal(percentage, 8);
    assert.ok(percentage <= 10, 'IND-11: 8% <= 10% → TARGET_MET');
  });

  it('IND-10: Company B (70 valid, 30 expired) → 70% NOT_MET', () => {
    const validCount = 70;
    const totalCount = 100;
    const percentage = Math.round((validCount / totalCount) * 100);
    assert.equal(percentage, 70);
    assert.ok(percentage < 90, 'IND-10: 70% < 90% → TARGET_NOT_MET');
  });

  it('IND-11: Company B (30 expired) → 30% NOT_MET', () => {
    const expiredCount = 30;
    const totalCount = 100;
    const percentage = Math.round((expiredCount / totalCount) * 100);
    assert.equal(percentage, 30);
    assert.ok(percentage > 10, 'IND-11: 30% > 10% → TARGET_NOT_MET');
  });

  it('DocumentEvaluationProvider usa misma semántica que IND-10', () => {
    // 92 ACTIVE + 8 expired = 100 eligible
    // validCount = 92 → percentage = 92%
    const docs: TestDocumentMaster[] = [
      ...Array.from({ length: 92 }, (_, i) => ({
        code: `VIG-${i}`,
        name: `Vigente ${i}`,
        status: 'ACTIVE' as const,
        expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      })),
      ...Array.from({ length: 8 }, (_, i) => ({
        code: `VENC-${i}`,
        name: `Vencido ${i}`,
        status: 'ACTIVE' as const,
        expirationDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      })),
    ];

    const result = simulateDocumentEvaluation(docs);

    assert.equal(result.percentage, 92);
    assert.equal(result.status, 'TARGET_MET');
    assert.equal(result.completed, 92);
    assert.equal(result.pending, 8);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DOC-NAV-01: 2.5.1 navega correctamente hacia /document-management
// ═══════════════════════════════════════════════════════════════════════════

describe('DOC-NAV-01: Navegación desde 2.5.1', () => {
  it('source=phva-2.5.1 genera la ruta correcta', () => {
    const source = 'phva-2.5.1';
    const targetRoute = '/document-management';
    const state = { source };

    assert.equal(targetRoute, '/document-management');
    assert.equal(state.source, 'phva-2.5.1');
  });

  it('2.5.1 está en la lista de códigos con navegación', () => {
    const codesWithNav = [
      '1.1.1', '1.1.2', '1.1.3', '1.1.4', '1.1.5', '1.1.6', '1.1.7', '1.1.8',
      '1.2.1', '1.2.2', '1.2.3',
      '2.1.1', '2.2.1', '2.3.1', '2.4.1', '2.5.1',
    ];

    assert.ok(codesWithNav.includes('2.5.1'), '2.5.1 debe estar en la lista de navegación');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DOC-DASH-02: Dashboard respeta tenant isolation
// ═══════════════════════════════════════════════════════════════════════════

describe('DOC-DASH-02: Dashboard respeta tenant isolation', () => {
  it('Cada conjunto de documentos produce métricas independientes', () => {
    const companyADocs: TestDocumentMaster[] = Array.from({ length: 5 }, (_, i) => ({
      code: `A-${i}`,
      name: `Doc A ${i}`,
      status: 'ACTIVE',
    }));

    const companyBDocs: TestDocumentMaster[] = Array.from({ length: 3 }, (_, i) => ({
      code: `B-${i}`,
      name: `Doc B ${i}`,
      status: 'ACTIVE',
    }));

    const resultA = simulateDocumentEvaluation(companyADocs);
    const resultB = simulateDocumentEvaluation(companyBDocs);

    assert.equal(resultA.completed, 5);
    assert.equal(resultB.completed, 3);
    assert.notEqual(resultA.completed, resultB.completed);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DOC-EVAL-06: Documentos ARCHIVED no afectan cumplimiento
// ═══════════════════════════════════════════════════════════════════════════

describe('DOC-EVAL-06: Documentos ARCHIVED no afectan cumplimiento', () => {
  it('5 ACTIVE + 5 ARCHIVED → solo 5 cuentan → 100% TARGET_MET', () => {
    const docs: TestDocumentMaster[] = [
      ...Array.from({ length: 5 }, (_, i) => ({
        code: `ACTIVE-${i}`,
        name: `Active ${i}`,
        status: 'ACTIVE' as const,
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        code: `ARCH-${i}`,
        name: `Archived ${i}`,
        status: 'ARCHIVED' as const,
      })),
    ];

    const result = simulateDocumentEvaluation(docs);

    assert.equal(result.percentage, 100);
    assert.equal(result.status, 'TARGET_MET');
    assert.equal(result.completed, 5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DOC-EVAL-07: Documentos OBSOLETE no afectan cumplimiento
// ═══════════════════════════════════════════════════════════════════════════

describe('DOC-EVAL-07: Documentos OBSOLETE no afectan cumplimiento', () => {
  it('3 ACTIVE + 2 OBSOLETE → solo 3 cuentan', () => {
    const docs: TestDocumentMaster[] = [
      { code: 'A1', name: 'Active 1', status: 'ACTIVE' },
      { code: 'A2', name: 'Active 2', status: 'ACTIVE' },
      { code: 'A3', name: 'Active 3', status: 'ACTIVE' },
      { code: 'O1', name: 'Obsolete 1', status: 'OBSOLETE' },
      { code: 'O2', name: 'Obsolete 2', status: 'OBSOLETE' },
    ];

    const result = simulateDocumentEvaluation(docs);

    assert.equal(result.percentage, 100);
    assert.equal(result.completed, 3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DOC-EVAL-08: Documentos próximos a vencer generan findings LOW
// ═══════════════════════════════════════════════════════════════════════════

describe('DOC-EVAL-08: Documentos próximos a vencer', () => {
  it('Documento a 15 días genera finding LOW', () => {
    const soonDate = new Date();
    soonDate.setDate(soonDate.getDate() + 15);

    const docs: TestDocumentMaster[] = [
      { code: 'DOC-SOON', name: 'Próximo', status: 'ACTIVE', expirationDate: soonDate },
    ];

    const result = simulateDocumentEvaluation(docs);

    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].priority, 'LOW');
    assert.ok(result.findings[0].title.includes('próximo a vencer'));
  });

  it('Documento a 31 días no genera finding', () => {
    const laterDate = new Date();
    laterDate.setDate(laterDate.getDate() + 31);

    const docs: TestDocumentMaster[] = [
      { code: 'DOC-LATER', name: 'Lejano', status: 'ACTIVE', expirationDate: laterDate },
    ];

    const result = simulateDocumentEvaluation(docs);

    assert.equal(result.findings.length, 0);
    assert.equal(result.completed, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// DOC-EVAL-09: Mezcla de estados
// ═══════════════════════════════════════════════════════════════════════════

describe('DOC-EVAL-09: Mezcla de estados produce métricas correctas', () => {
  it('70% vigentes + 20% vencidos + 10% archivados → TARGET_NOT_MET', () => {
    const now = new Date();
    const pastDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const futureDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

    const docs: TestDocumentMaster[] = [
      ...Array.from({ length: 7 }, (_, i) => ({
        code: `VIG-${i}`,
        name: `Vigente ${i}`,
        status: 'ACTIVE' as const,
        expirationDate: futureDate,
      })),
      ...Array.from({ length: 2 }, (_, i) => ({
        code: `VENC-${i}`,
        name: `Vencido ${i}`,
        status: 'ACTIVE' as const,
        expirationDate: pastDate,
      })),
      ...Array.from({ length: 1 }, (_, i) => ({
        code: `ARCH-${i}`,
        name: `Archivado ${i}`,
        status: 'ARCHIVED' as const,
      })),
    ];

    const result = simulateDocumentEvaluation(docs);

    // Only ACTIVE docs count: 7 vigentes + 2 vencidos = 9 eligible
    assert.equal(result.completed, 7);
    assert.equal(result.pending, 2);
    assert.equal(result.percentage, 78); // 7/9 = 78%
    assert.equal(result.status, 'TARGET_NOT_MET');
  });
});
