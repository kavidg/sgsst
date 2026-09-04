import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';
import { AcquisitionEvidenceAdapter, AcquisitionCountQueries, SupplierCountQueries } from './acquisition-evidence.adapter';
import { StandardAnalysisService } from '../standard-analysis.service';
import { ComplianceEngineService } from '../../../compliance-engine/compliance-engine.service';
import { DocumentMasterService } from '../../../document-management/services/document-master.service';

const COMPANY_A = '64b000000000000000000001';
const COMPANY_B = '64b000000000000000000002';

function buildDocMasterService(overrides?: {
  countByStandardCode?: { total: number; active: number; expired: number; expiringSoon: number; pendingApproval: number };
}) {
  return {
    countByStandardCode: async () => overrides?.countByStandardCode ?? { total: 0, active: 0, expired: 0, expiringSoon: 0, pendingApproval: 0 },
    findAcquisitionIdsWithDocuments: async () => [],
    findSupplierIdsWithDocuments: async () => [],
  } as unknown as DocumentMasterService;
}

function buildAcquisitionQueries(count?: number) {
  return {
    countByCompany: async () => count ?? 0,
  } as AcquisitionCountQueries;
}

function buildSupplierQueries(count?: number) {
  return {
    countByCompany: async () => count ?? 0,
  } as SupplierCountQueries;
}

function buildAdapter(overrides?: {
  docServiceOverrides?: Parameters<typeof buildDocMasterService>[0];
  acquisitionCount?: number;
  acquisitionIdsWithDocs?: string[];
  supplierCount?: number;
  supplierIdsWithDocs?: string[];
}) {
  // Para los tests, inyectamos los IDs con documentos vía DocumentMasterService mock
  const docService = {
    countByStandardCode: async () => overrides?.docServiceOverrides?.countByStandardCode ?? { total: 0, active: 0, expired: 0, expiringSoon: 0, pendingApproval: 0 },
    findAcquisitionIdsWithDocuments: async () => (overrides?.acquisitionIdsWithDocs ?? []).map((id) => new Types.ObjectId(id)),
    findSupplierIdsWithDocuments: async () => (overrides?.supplierIdsWithDocs ?? []).map((id) => new Types.ObjectId(id)),
  } as unknown as DocumentMasterService;

  return new AcquisitionEvidenceAdapter(
    docService,
    buildAcquisitionQueries(overrides?.acquisitionCount ?? 0),
    buildSupplierQueries(overrides?.supplierCount ?? 0),
  );
}

function buildServiceWithEvidence(overviewOverride: Record<string, unknown>, adapterOverrides?: Parameters<typeof buildDocMasterService>[0]) {
  const complianceEngineService = {
    getOverview: async () => overviewOverride,
  } as unknown as ComplianceEngineService;

  const adapter = buildAdapter({ docServiceOverrides: adapterOverrides });
  const service = new StandardAnalysisService(complianceEngineService);
  service.registerEvidenceAdapter(adapter);

  return { service, adapter };
}

// ═══════════════════════════════════════════════════════════════════════════
// EVIDENCE-01: Adapter retorna contexto correcto para empresa con documentos
// ═══════════════════════════════════════════════════════════════════════════

describe('EVIDENCE-01: Adapter retorna contexto correcto', () => {
  it('retorna métricas correctas cuando hay documentos y adquisiciones', async () => {
    const adapter = buildAdapter({
      docServiceOverrides: {
        countByStandardCode: { total: 5, active: 3, expired: 1, expiringSoon: 1, pendingApproval: 1 },
      },
      acquisitionCount: 10,
      acquisitionIdsWithDocs: ['64b000000000000000000010', '64b000000000000000000011'],
      supplierCount: 4,
      supplierIdsWithDocs: ['64b000000000000000000020'],
    });

    const context = await adapter.getEvidenceContext(COMPANY_A);

    assert.equal(context.standardCode, '2.9.1');
    assert.equal(context.totalDocuments, 5);
    assert.equal(context.activeDocuments, 3);
    assert.equal(context.expiredDocuments, 1);
    assert.equal(context.expiringDocuments, 1);
    assert.equal(context.pendingApprovalDocuments, 1);
    assert.equal(context.acquisitionsWithDocuments, 2);
    assert.equal(context.acquisitionsWithoutDocuments, 8);
    assert.equal(context.suppliersWithDocuments, 1);
    assert.equal(context.suppliersWithoutDocuments, 3);
    assert.equal(context.documentCoveragePercentage, 20); // 2/10 = 20%
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EVIDENCE-02: Adapter retorna contexto vacío cuando no existen documentos
// ═══════════════════════════════════════════════════════════════════════════

describe('EVIDENCE-02: Adapter retorna contexto vacío', () => {
  it('retorna ceros cuando no hay documentos ni adquisiciones', async () => {
    const adapter = buildAdapter();
    const context = await adapter.getEvidenceContext(COMPANY_A);

    assert.equal(context.totalDocuments, 0);
    assert.equal(context.activeDocuments, 0);
    assert.equal(context.expiredDocuments, 0);
    assert.equal(context.acquisitionsWithDocuments, 0);
    assert.equal(context.acquisitionsWithoutDocuments, 0);
    assert.equal(context.documentCoveragePercentage, 0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EVIDENCE-03: Tenant isolation
// ═══════════════════════════════════════════════════════════════════════════

describe('EVIDENCE-03: Tenant isolation', () => {
  it('companyId se pasa correctamente al DocumentMasterService', async () => {
    const receivedCompanyIds: string[] = [];
    const docService = {
      countByStandardCode: async (companyId: Types.ObjectId) => {
        receivedCompanyIds.push(companyId.toString());
        return { total: 0, active: 0, expired: 0, expiringSoon: 0, pendingApproval: 0 };
      },
      findAcquisitionIdsWithDocuments: async () => [],
      findSupplierIdsWithDocuments: async () => [],
    } as unknown as DocumentMasterService;

    const adapter = new AcquisitionEvidenceAdapter(
      docService,
      buildAcquisitionQueries(0),
      buildSupplierQueries(0),
    );

    await adapter.getEvidenceContext(COMPANY_A);

    assert.equal(receivedCompanyIds.length, 1);
    assert.equal(receivedCompanyIds[0], COMPANY_A);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EVIDENCE-04: Adapter genera hallazgos cuando hay documentos vencidos
// ═══════════════════════════════════════════════════════════════════════════

describe('EVIDENCE-04: Hallazgos de documentos vencidos', () => {
  it('genera expired_document finding cuando expired > 0', async () => {
    const adapter = buildAdapter({
      docServiceOverrides: {
        countByStandardCode: { total: 2, active: 1, expired: 1, expiringSoon: 0, pendingApproval: 0 },
      },
      acquisitionCount: 5,
      acquisitionIdsWithDocs: ['64b000000000000000000010'],
    });

    const context = await adapter.getEvidenceContext(COMPANY_A);

    assert.ok(context.evidenceFindings.length > 0);
    const expiredFinding = context.evidenceFindings.find((f) => f.type === 'expired_document');
    assert.ok(expiredFinding, 'Should have expired_document finding');
    assert.ok(expiredFinding!.description.includes('1'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EVIDENCE-05: Finding contextual sin evidencia
// ═══════════════════════════════════════════════════════════════════════════

describe('EVIDENCE-05: Finding contextual sin evidencia', () => {
  it('genera no_documents cuando hay adquisiciones pero sin documentos', async () => {
    const adapter = buildAdapter({
      acquisitionCount: 5,
      supplierCount: 3,
    });

    const context = await adapter.getEvidenceContext(COMPANY_A);

    const noDocsFinding = context.evidenceFindings.find((f) => f.type === 'no_documents');
    assert.ok(noDocsFinding, 'Should have no_documents finding');
    assert.ok(noDocsFinding!.description.includes('evidencia'));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EVIDENCE-06: compliancePercentage no se modifica
// ═══════════════════════════════════════════════════════════════════════════

describe('EVIDENCE-06: compliancePercentage no se modifica', () => {
  it('el score viene de ComplianceEngine sin importar la evidencia', async () => {
    const overview = {
      overallCompliance: 73,
      phaseCompliance: { plan: 73, do: 73, check: 73, act: 73 },
      moduleCompliance: [
        { module: 'acquisitions', compliance: 73, level: 'HIGH', lastUpdated: new Date().toISOString() },
      ],
      findings: [],
      recommendations: [],
      alerts: [],
      prediction: null,
      trend: null,
      executiveSummary: '',
      lastUpdated: new Date().toISOString(),
    };

    const { service } = buildServiceWithEvidence(overview);
    const result = await service.analyze('2.9.1', COMPANY_A);

    assert.equal(result.compliancePercentage, 73, 'Score must be exactly from ComplianceEngine');
    assert.equal(result.level, 'HIGH');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EVIDENCE-07: Contexto sin PII
// ═══════════════════════════════════════════════════════════════════════════

describe('EVIDENCE-07: Contexto sin PII', () => {
  it('evidenceFindings no contiene emails ni teléfonos', async () => {
    const adapter = buildAdapter({
      docServiceOverrides: {
        countByStandardCode: { total: 3, active: 2, expired: 1, expiringSoon: 0, pendingApproval: 0 },
      },
      acquisitionCount: 5,
      supplierCount: 3,
    });

    const context = await adapter.getEvidenceContext(COMPANY_A);

    const allText = context.evidenceFindings.map((f) => f.description).join(' ').toLowerCase();
    assert.ok(!allText.includes('@'), 'Should not contain email addresses');
    assert.ok(!allText.match(/\d{3}-\d{3}-\d{4}/), 'Should not contain phone numbers');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EVIDENCE-08: standardCode 2.9.1 detectado correctamente
// ═══════════════════════════════════════════════════════════════════════════

describe('EVIDENCE-08: standardCode 2.9.1 detectado', () => {
  it('supports retorna true para 2.9.1 y false para otros', () => {
    const adapter = buildAdapter();
    assert.ok(adapter.supports('2.9.1'));
    assert.ok(!adapter.supports('2.7.1'));
    assert.ok(!adapter.supports('1.1.1'));
    assert.ok(!adapter.supports(''));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EVIDENCE-09: Documento de otra empresa no aparece
// ═══════════════════════════════════════════════════════════════════════════

describe('EVIDENCE-09: Tenant isolation estricto', () => {
  it('companyId de Company A se usa en todas las queries', async () => {
    const queries: string[] = [];
    const docService = {
      countByStandardCode: async (companyId: Types.ObjectId) => {
        queries.push(`count:${companyId}`);
        return { total: 0, active: 0, expired: 0, expiringSoon: 0, pendingApproval: 0 };
      },
      findAcquisitionIdsWithDocuments: async () => [],
      findSupplierIdsWithDocuments: async () => [],
    } as unknown as DocumentMasterService;

    const adapter = new AcquisitionEvidenceAdapter(
      docService,
      buildAcquisitionQueries(0),
      buildSupplierQueries(0),
    );

    await adapter.getEvidenceContext(COMPANY_A);

    for (const q of queries) {
      assert.ok(q.includes(COMPANY_A), `Query should use COMPANY_A: ${q}`);
      assert.ok(!q.includes(COMPANY_B), `Query should NOT use COMPANY_B: ${q}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EVIDENCE-10: Documento vencido genera contexto de evidencia vencida
// ═══════════════════════════════════════════════════════════════════════════

describe('EVIDENCE-10: Documento vencido genera contexto', () => {
  it('expiredDocuments > 0 genera finding de tipo expired_document', async () => {
    const adapter = buildAdapter({
      docServiceOverrides: {
        countByStandardCode: { total: 4, active: 2, expired: 2, expiringSoon: 0, pendingApproval: 0 },
      },
      acquisitionCount: 5,
      supplierCount: 3,
    });

    const context = await adapter.getEvidenceContext(COMPANY_A);

    assert.equal(context.expiredDocuments, 2);
    const expiredFinding = context.evidenceFindings.find((f) => f.type === 'expired_document');
    assert.ok(expiredFinding, 'Should have expired_document finding');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EVIDENCE-11: Documento pendiente de aprobación
// ═══════════════════════════════════════════════════════════════════════════

describe('EVIDENCE-11: Documento pendiente de aprobación', () => {
  it('pendingApprovalDocuments > 0 genera finding correspondiente', async () => {
    const adapter = buildAdapter({
      docServiceOverrides: {
        countByStandardCode: { total: 3, active: 1, expired: 0, expiringSoon: 0, pendingApproval: 2 },
      },
      acquisitionCount: 5,
      supplierCount: 3,
    });

    const context = await adapter.getEvidenceContext(COMPANY_A);

    assert.equal(context.pendingApprovalDocuments, 2);
    const pendingFinding = context.evidenceFindings.find((f) => f.type === 'pending_approval');
    assert.ok(pendingFinding, 'Should have pending_approval finding');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EVIDENCE-12: Documentos existentes sin nuevos campos continúan funcionando
// ═══════════════════════════════════════════════════════════════════════════

describe('EVIDENCE-12: Compatibilidad retroactiva', () => {
  it('adapter funciona correctamente cuando no hay documentos con los nuevos campos', async () => {
    const adapter = buildAdapter({
      acquisitionCount: 0,
      supplierCount: 0,
    });

    const context = await adapter.getEvidenceContext(COMPANY_A);

    assert.equal(context.totalDocuments, 0);
    assert.equal(context.acquisitionsWithDocuments, 0);
    assert.equal(context.documentCoveragePercentage, 0);
    assert.equal(context.evidenceFindings.length, 0);
  });

  it('StandardAnalysisService sigue funcionando sin adapter registrado', async () => {
    const overview = {
      overallCompliance: 60,
      phaseCompliance: { plan: 60, do: 60, check: 60, act: 60 },
      moduleCompliance: [
        { module: 'acquisitions', compliance: 60, level: 'MEDIUM', lastUpdated: new Date().toISOString() },
      ],
      findings: [],
      recommendations: [],
      alerts: [],
      prediction: null,
      trend: null,
      executiveSummary: '',
      lastUpdated: new Date().toISOString(),
    };

    const complianceEngineService = {
      getOverview: async () => overview,
    } as unknown as ComplianceEngineService;

    const service = new StandardAnalysisService(complianceEngineService);
    const result = await service.analyze('2.9.1', COMPANY_A);

    assert.equal(result.compliancePercentage, 60);
    assert.equal(result.dataAvailable, true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// EVIDENCE-13: standardCode filter in DocumentMasterService
// ═══════════════════════════════════════════════════════════════════════════

describe('EVIDENCE-13: DocumentMasterService filters by standardCode', () => {
  it('findAcquisitionIdsWithDocuments aggregates only standardCode 2.9.1', () => {
    const fs = require('fs');
    const pathMod = require('path');
    const source = fs.readFileSync(
      pathMod.resolve(__dirname, '../../../document-management/services/document-master.service.ts'),
      'utf8',
    );
    // Verify the aggregation pipeline includes standardCode filter
    assert.ok(
      source.includes("standardCode: '2.9.1'"),
      'findAcquisitionIdsWithDocuments must filter by standardCode 2.9.1',
    );
  });

  it('findSupplierIdsWithDocuments aggregates only standardCode 2.9.1', () => {
    const fs = require('fs');
    const pathMod = require('path');
    const source = fs.readFileSync(
      pathMod.resolve(__dirname, '../../../document-management/services/document-master.service.ts'),
      'utf8',
    );
    assert.ok(
      source.includes("standardCode: '2.9.1'"),
      'findSupplierIdsWithDocuments must filter by standardCode 2.9.1',
    );
  });

  it('aggregation includes companyId, acquisitionId, and standardCode', () => {
    const fs = require('fs');
    const pathMod = require('path');
    const source = fs.readFileSync(
      pathMod.resolve(__dirname, '../../../document-management/services/document-master.service.ts'),
      'utf8',
    );
    // Both methods should have companyId in their $match
    const acqMatch = source.includes('companyId, acquisitionId: { $exists: true, $ne: null }, standardCode');
    const supMatch = source.includes('companyId, supplierId: { $exists: true, $ne: null }, standardCode');
    assert.ok(acqMatch, 'Acquisition aggregation must match companyId + acquisitionId + standardCode');
    assert.ok(supMatch, 'Supplier aggregation must match companyId + supplierId + standardCode');
  });
});
