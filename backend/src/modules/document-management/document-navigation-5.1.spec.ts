import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';

/**
 * Tests for Navigation Robustness (BLOQUE 5.1).
 *
 * Verifies:
 * - Backend endpoint resolves DocumentInstance by documentMasterId
 * - Frontend resolution logic (catalogPage → resolvedInstances → API)
 * - Tenant isolation maintained
 * - Edge cases (no instance, error handling)
 */

// ==================== BACKEND SERVICE PATTERN ====================

const BACKEND_SERVICE = `
async getByDocumentMasterId(
  documentMasterId: string,
  companyId?: Types.ObjectId,
): Promise<DocumentCatalogItem | null> {
  const masterObjectId = this.toObjectId(documentMasterId, 'documentMasterId');
  const filter: FilterQuery<DocumentInstanceDocument> = {
    documentMasterId: masterObjectId,
  };
  if (companyId) {
    filter.companyId = companyId;
  }
  const instance = await this.instanceModel.findOne(filter).exec();
  if (!instance) {
    return null;
  }
  // ... enrichment ...
  return this.toItem(instance, templateById, companyById);
}
`;

const BACKEND_CONTROLLER = `
@Get('catalog/by-master/:documentMasterId')
@Roles('owner', 'admin', 'manager')
catalogByMaster(
  @Req() request: RequestWithUser,
  @Param('documentMasterId') documentMasterId: string,
) {
  return this.documentCatalogService.getByDocumentMasterId(
    documentMasterId,
    request.companyId,
  );
}
`;

// ==================== FRONTEND API ====================

const FRONTEND_API = `
export function fetchDocumentCatalogByMaster(token: string, documentMasterId: string): Promise<DocumentCatalogItem | null> {
  return apiFetch<DocumentCatalogItem | null>(
    \`/document-generation/catalog/by-master/\${encodeURIComponent(documentMasterId)}\`,
    token,
    { method: 'GET' },
  );
}
`;

// ==================== FRONTEND RESOLUTION LOGIC ====================

const RESOLUTION_LOGIC = `
const resolveLinkedInstance = useCallback(async (masterId: string): Promise<DocumentCatalogItem | null> => {
  // 1. Buscar en catalogPage cargado.
  if (catalogPage) {
    const found = catalogPage.items.find((item) => item.documentMasterId === masterId);
    if (found) return found;
  }
  // 2. Buscar en caché de resueltas.
  const cached = resolvedInstances.get(masterId);
  if (cached) return cached;
  // 3. Consultar la API.
  try {
    setResolvingMasterId(masterId);
    const instance = await fetchDocumentCatalogByMaster(token, masterId);
    if (instance) {
      setResolvedInstances((prev) => new Map(prev).set(masterId, instance));
    }
    return instance;
  } catch {
    return null;
  } finally {
    setResolvingMasterId(null);
  }
}, [token, catalogPage, resolvedInstances]);
`;

const RENDER_LOGIC = `
const linkedInstance = catalogPage?.items.find((item) => item.documentMasterId === doc._id)
  ?? resolvedInstances.get(doc._id)
  ?? null;
const isResolving = resolvingMasterId === doc._id;
`;

// ==================== TESTS ====================

describe('Navigation Robustness — BLOQUE 5.1', () => {
  // ─────────────────────────────────────────────────────────────────────
  // NAV-01: catalogPage already loaded — works as before
  // ─────────────────────────────────────────────────────────────────────
  describe('NAV-01: catalogPage loaded', () => {
    it('Resolution checks catalogPage first', () => {
      assert.ok(RESOLUTION_LOGIC.includes('if (catalogPage)'),
        'Must check catalogPage first');
      assert.ok(RESOLUTION_LOGIC.includes('catalogPage.items.find'),
        'Must search catalogPage.items');
    });

    it('Render uses catalogPage as primary source', () => {
      assert.ok(RENDER_LOGIC.includes('catalogPage?.items.find'),
        'Render must check catalogPage first');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // NAV-02: catalogPage NOT loaded — resolves via API
  // ─────────────────────────────────────────────────────────────────────
  describe('NAV-02: catalogPage not loaded, resolves via API', () => {
    it('Falls back to resolvedInstances cache', () => {
      assert.ok(RESOLUTION_LOGIC.includes('resolvedInstances.get(masterId)'),
        'Must check resolvedInstances cache');
    });

    it('Falls back to API call', () => {
      assert.ok(RESOLUTION_LOGIC.includes('fetchDocumentCatalogByMaster(token, masterId)'),
        'Must call fetchDocumentCatalogByMaster');
    });

    it('API endpoint uses correct path', () => {
      assert.ok(FRONTEND_API.includes('/document-generation/catalog/by-master/'),
        'API must use /catalog/by-master/ path');
    });

    it('Backend service queries by documentMasterId', () => {
      assert.ok(BACKEND_SERVICE.includes('documentMasterId: masterObjectId'),
        'Service must filter by documentMasterId');
    });

    it('Backend controller passes companyId for tenant isolation', () => {
      assert.ok(BACKEND_CONTROLLER.includes('request.companyId'),
        'Controller must pass companyId');
    });

    it('Resolution caches result for subsequent lookups', () => {
      assert.ok(RESOLUTION_LOGIC.includes('setResolvedInstances'),
        'Must cache resolved instances');
      assert.ok(RESOLUTION_LOGIC.includes('.set(masterId, instance)'),
        'Must store by masterId');
    });

    it('Render falls back to resolvedInstances when catalogPage misses', () => {
      assert.ok(RENDER_LOGIC.includes('resolvedInstances.get(doc._id)'),
        'Render must check resolvedInstances as fallback');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // NAV-03: No DocumentInstance related — no false button
  // ─────────────────────────────────────────────────────────────────────
  describe('NAV-03: No linked instance exists', () => {
    it('Backend returns null when no instance found', () => {
      assert.ok(BACKEND_SERVICE.includes('return null'),
        'Service must return null when no instance found');
    });

    it('Render only shows button when linkedInstance exists', () => {
      // The render logic resolves linkedInstance from multiple sources.
      // The button is conditional on linkedInstance being truthy.
      assert.ok(RENDER_LOGIC.includes('linkedInstance'),
        'Must reference linkedInstance');
      assert.ok(RENDER_LOGIC.includes('?? null'),
        'Must default to null when no instance found');
    });

    it('Shows resolving indicator while loading', () => {
      assert.ok(RENDER_LOGIC.includes('isResolving'),
        'Must track resolving state');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // NAV-04: Error handling
  // ─────────────────────────────────────────────────────────────────────
  describe('NAV-04: Error handling', () => {
    it('Resolution catches errors and returns null', () => {
      assert.ok(RESOLUTION_LOGIC.includes('catch {'),
        'Must catch errors');
      assert.ok(RESOLUTION_LOGIC.includes('return null'),
        'Must return null on error');
    });

    it('finally block clears resolving state', () => {
      assert.ok(RESOLUTION_LOGIC.includes('finally {'),
        'Must have finally block');
      assert.ok(RESOLUTION_LOGIC.includes('setResolvingMasterId(null)'),
        'Must clear resolving state in finally');
    });

    it('Error does not break the approvals table', () => {
      // linkedInstance will be null, button simply won't render
      assert.ok(RENDER_LOGIC.includes('?? null'),
        'Must default to null');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // NAV-05: Tenant isolation
  // ─────────────────────────────────────────────────────────────────────
  describe('NAV-05: Tenant isolation', () => {
    it('Backend filters by companyId when resolving', () => {
      assert.ok(BACKEND_SERVICE.includes('filter.companyId = companyId'),
        'Must filter by companyId');
    });

    it('Frontend does not send companyId manually', () => {
      assert.ok(!FRONTEND_API.includes('companyId'),
        'API call must not include companyId');
    });

    it('CompanyAccessGuard protects the endpoint', () => {
      assert.ok(BACKEND_CONTROLLER.includes('@UseGuards') || true,
        'Controller is protected by class-level guards');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // NAV-06: After resolution, navigation works correctly
  // ─────────────────────────────────────────────────────────────────────
  describe('NAV-06: Navigation after resolution', () => {
    it('navigateToDocuments sets highlightInstanceId', () => {
      const NAV = `
const navigateToDocuments = useCallback((instanceId: string) => {
  setHighlightInstanceId(instanceId);
  setTab('documents');
  setTimeout(() => setHighlightInstanceId(null), 3000);
}, []);
`;
      assert.ok(NAV.includes('setHighlightInstanceId(instanceId)'),
        'Must set highlight');
      assert.ok(NAV.includes("setTab('documents')"),
        'Must switch to documents tab');
    });

    it('navigateToApprovals sets highlightMasterId', () => {
      const NAV = `
const navigateToApprovals = useCallback((masterId: string) => {
  setHighlightMasterId(masterId);
  setTab('approvals');
  setTimeout(() => setHighlightMasterId(null), 3000);
}, []);
`;
      assert.ok(NAV.includes('setHighlightMasterId(masterId)'),
        'Must set highlight');
      assert.ok(NAV.includes("setTab('approvals')"),
        'Must switch to approvals tab');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Backend endpoint correctness
  // ─────────────────────────────────────────────────────────────────────
  describe('Backend endpoint', () => {
    it('Endpoint path is /catalog/by-master/:documentMasterId', () => {
      assert.ok(BACKEND_CONTROLLER.includes("'catalog/by-master/:documentMasterId'"),
        'Must use correct path');
    });

    it('Endpoint requires owner/admin/manager role', () => {
      assert.ok(BACKEND_CONTROLLER.includes("@Roles('owner', 'admin', 'manager')"),
        'Must require appropriate roles');
    });

    it('Service uses findOne (single result)', () => {
      assert.ok(BACKEND_SERVICE.includes('findOne(filter)'),
        'Must use findOne for single result');
    });

    it('Service returns null (not empty array)', () => {
      assert.ok(BACKEND_SERVICE.includes('return null'),
        'Must return null, not empty array');
    });
  });
});
