import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

import { SstPolicyVariableResolverService } from './sst-policy-variable-resolver.service';

const COMPANY_ID = '64b000000000000000000001';
const POLICY_ID = '64b000000000000000000002';

/** Registro SstPolicy aprobado con contenido y versión vigente. */
function buildPolicy(overrides?: Record<string, unknown>) {
  return {
    _id: new Types.ObjectId(POLICY_ID),
    companyId: new Types.ObjectId(COMPANY_ID),
    itemCode: '2.1.1',
    documentCode: 'SST-POL-001',
    documentName: 'Política de Seguridad y Salud en el Trabajo',
    currentVersion: '1.0',
    status: 'Aprobado',
    content:
      'La empresa se compromete a implementar el SG-SST garantizando la salud y seguridad de sus trabajadores.',
    versions: [
      {
        version: '1.0',
        content: 'Contenido vigente',
        status: 'Aprobado',
        issuedAt: new Date('2026-01-01T00:00:00.000Z'),
        approvedAt: new Date('2026-01-02T00:00:00.000Z'),
        expiresAt: new Date('2027-01-02T00:00:00.000Z'),
        archived: false,
      },
    ],
    ...overrides,
  };
}

describe('SstPolicyVariableResolverService', () => {
  function buildResolver(overrides?: {
    policy?: Record<string, unknown> | null;
    company?: Record<string, unknown> | null;
  }): {
    resolver: SstPolicyVariableResolverService;
  } {
    const policy = overrides?.policy === null ? null : { ...buildPolicy(), ...overrides?.policy };
    const company = overrides?.company === null ? null : {
      name: 'Empresa SAS',
      nit: '900123456',
      ...overrides?.company,
    };

    const sstPolicyModel = {
      findById: () => ({ exec: async () => policy }),
    };
    const companyModel = {
      findById: () => ({ exec: async () => company }),
    };

    const resolver = new SstPolicyVariableResolverService(
      sstPolicyModel as never,
      companyModel as never,
    );

    return { resolver };
  }

  it('resuelve empresa y contenido de la política', async () => {
    const { resolver } = buildResolver();

    const context = await resolver.resolve(
      new Types.ObjectId(COMPANY_ID),
      new Types.ObjectId(POLICY_ID),
    );

    assert.equal(context.company.name, 'Empresa SAS');
    assert.equal(context.company.nit, '900123456');
    assert.ok(context.policy.content?.includes('implementar el SG-SST'));
  });

  it('resuelve la versión vigente y la fecha de revisión (expiresAt)', async () => {
    const { resolver } = buildResolver();

    const context = await resolver.resolve(
      new Types.ObjectId(COMPANY_ID),
      new Types.ObjectId(POLICY_ID),
    );

    assert.equal(context.policy.version, '1.0');
    assert.equal(context.policy.reviewDate, '2027-01-02T00:00:00.000Z');
  });

  it('devuelve null para secciones que el módulo no persiste como campos propios', async () => {
    const { resolver } = buildResolver();

    const context = await resolver.resolve(
      new Types.ObjectId(COMPANY_ID),
      new Types.ObjectId(POLICY_ID),
    );

    assert.equal(context.policy.objective, null);
    assert.equal(context.policy.scope, null);
    assert.equal(context.policy.commitments, null);
    assert.equal(context.policy.legalFramework, null);
    assert.equal(context.company.address, null);
    assert.equal(context.company.city, null);
  });

  it('lanza NotFound si la política pertenece a otra empresa', async () => {
    const { resolver } = buildResolver({
      policy: { companyId: new Types.ObjectId('64b0000000000000000000ff') },
    });

    await assert.rejects(
      () =>
        resolver.resolve(
          new Types.ObjectId(COMPANY_ID),
          new Types.ObjectId(POLICY_ID),
        ),
      NotFoundException,
    );
  });

  it('lanza NotFound si la política no existe', async () => {
    const { resolver } = buildResolver({ policy: null });

    await assert.rejects(
      () =>
        resolver.resolve(
          new Types.ObjectId(COMPANY_ID),
          new Types.ObjectId(POLICY_ID),
        ),
      NotFoundException,
    );
  });

  it('devuelve null si la empresa no existe o no hay versión vigente con expiresAt', async () => {
    const { resolver } = buildResolver({
      company: null,
      policy: { versions: [] },
    });

    const context = await resolver.resolve(
      new Types.ObjectId(COMPANY_ID),
      new Types.ObjectId(POLICY_ID),
    );

    assert.equal(context.company.name, null);
    assert.equal(context.company.nit, null);
    assert.equal(context.policy.reviewDate, null);
  });
});
