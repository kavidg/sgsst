import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CompanyProfileService, COMPANY_PROFILE_REQUIRED_FIELDS } from '../../company-profile/company-profile.service';
import { CompanyInfoProvider } from './company-info.provider';

/**
 * Verifica que el paso `company_info` del Centro de Implementación consuma
 * correctamente el porcentaje DERIVADO de CompanyProfile (post-fix ya no es
 * siempre 0) y que deriveStepStatus siga clasificando sin regresión:
 * >=80 COMPLETED · >0 IN_PROGRESS · 0 PENDING.
 */
function buildProfile(overrides: Record<string, unknown> = {}) {
  return {
    workCenters: [],
    contacts: [],
    companyDocuments: [],
    responsibleSstUserId: null,
    ...overrides,
  } as never;
}

function buildService(handler: () => Promise<unknown>) {
  return { getProfile: handler } as unknown as CompanyProfileService;
}

/** ObjectId válido de 24 hex (el provider lo parsea antes de consultar). */
const COMPANY_ID = '64b0000000000000000000a1';

describe('CompanyInfoProvider · paso company_info del wizard (post-fix %)', () => {
  it('WIZ-1 · perfil al 80% → IN_PROGRESS→COMPLETED boundary: percentage 80, status COMPLETED', async () => {
    const provider = new CompanyInfoProvider(
      buildService(async () => buildProfile({ completionPercentage: 80 })),
    );
    const result = await provider.getValidation(COMPANY_ID);
    assert.equal(result.stepId, 'company_info');
    assert.equal(result.percentage, 80);
    assert.equal(result.status, 'COMPLETED');
    assert.match(result.details!, /80%/);
  });

  it('WIZ-2 · perfil al 15% (configuración parcial real) → status IN_PROGRESS, no subestima a PENDING', async () => {
    const provider = new CompanyInfoProvider(
      buildService(async () => buildProfile({ completionPercentage: 15 })),
    );
    const result = await provider.getValidation(COMPANY_ID);
    assert.equal(result.percentage, 15);
    assert.equal(result.status, 'IN_PROGRESS');
  });

  it('WIZ-3 · perfil vacío 0% → status PENDING', async () => {
    const provider = new CompanyInfoProvider(
      buildService(async () => buildProfile({ completionPercentage: 0 })),
    );
    const result = await provider.getValidation(COMPANY_ID);
    assert.equal(result.percentage, 0);
    assert.equal(result.status, 'PENDING');
  });

  it('WIZ-4 · perfil completo → 100% COMPLETED con todos los criterios y pendingCriteria vacío', async () => {
    const allRequired = Object.fromEntries(
      COMPANY_PROFILE_REQUIRED_FIELDS.map((field) => [field, field === 'totalEmployees' || field === 'directEmployees' ? 5 : 'v']),
    );
    const provider = new CompanyInfoProvider(
      buildService(async () => buildProfile({
        completionPercentage: 100,
        ...allRequired,
        workCenters: [{ name: 'Sede' }],
        contacts: [{ type: 'HR' }],
        companyDocuments: [{ type: 'RUT' }],
        responsibleSstUserId: 'u1',
      })),
    );
    const result = await provider.getValidation(COMPANY_ID);
    assert.equal(result.percentage, 100);
    assert.equal(result.status, 'COMPLETED');
    assert.equal(result.pendingCriteria!.length, 0);
    const criteria = result.criteria!;
    assert.ok(criteria.some((entry) => entry.includes(`${COMPANY_PROFILE_REQUIRED_FIELDS.length} de ${COMPANY_PROFILE_REQUIRED_FIELDS.length}`)));
    assert.ok(criteria.includes('Centros de trabajo registrados'));
    assert.ok(criteria.includes('Contactos registrados'));
    assert.ok(criteria.includes('Documentos de empresa adjuntos'));
    assert.ok(criteria.includes('Responsable SST asignado'));
  });

  it('WIZ-5 · getProfile falla → fallback PENDING 0% (sin romper el wizard)', async () => {
    const provider = new CompanyInfoProvider(
      buildService(async () => {
        throw new Error('db down');
      }),
    );
    const result = await provider.getValidation(COMPANY_ID);
    assert.equal(result.stepId, 'company_info');
    assert.equal(result.percentage, 0);
    assert.equal(result.status, 'PENDING');
  });
});
