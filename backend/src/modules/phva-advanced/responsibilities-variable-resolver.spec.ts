import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

import { ResponsibilitiesVariableResolverService } from './responsibilities-variable-resolver.service';
import { PhvaAdvancedResponsibilitiesDocument } from './schemas/phva-advanced-responsibilities.schema';

const COMPANY_ID = '64b000000000000000000001';
const RECORD_ID = '64b000000000000000000002';

/** Registro 1.1.2 con filas de responsabilidad + __META__ aprobado y con
 * representante legal firmado (equivalente a approveResponsibilities). */
function buildRecord(): PhvaAdvancedResponsibilitiesDocument {
  return {
    _id: new Types.ObjectId(RECORD_ID),
    companyId: new Types.ObjectId(COMPANY_ID),
    itemCode: '1.1.2',
    complianceStatus: 'COMPLIES',
    complianceReason: 'Cumple con responsabilidades, asignaciones y firmas requeridas.',
    updatedBy: new Types.ObjectId('64b00000000000000000000a'),
    responsibilities: [
      {
        title: 'Responsable del SG-SST',
        category: 'Dirección',
        role: 'MANAGER',
        employeeId: new Types.ObjectId('64b00000000000000000000b'),
        active: true,
        requiresSignature: true,
        status: 'PENDING',
        signature: { accepted: true, signedAt: new Date(), version: 1 },
      },
      {
        title: 'Vigilancia y control',
        category: 'Operativo',
        role: 'ADMIN',
        employeeId: undefined,
        active: true,
        requiresSignature: false,
        status: 'PENDING',
        signature: { accepted: false, version: 1 },
      },
      {
        title: '__META__',
        category: JSON.stringify({
          approvalStatus: 'APPROVED_AND_SIGNED',
          locked: true,
          currentVersion: '1.2',
          legalRepresentativeSigned: true,
          legalRepresentativeName: 'Ana Gómez',
          legalRepresentativeSignedAt: '2026-01-02T00:00:00.000Z',
        }),
        role: 'SYSTEM',
        active: false,
        requiresSignature: false,
        status: 'PENDIENTE',
        signature: { accepted: false, version: 1 },
      },
    ],
    alerts: [],
    auditHistory: [],
  } as unknown as PhvaAdvancedResponsibilitiesDocument;
}

describe('ResponsibilitiesVariableResolverService', () => {
  function buildResolver(overrides?: {
    record?: PhvaAdvancedResponsibilitiesDocument | null;
    company?: Record<string, unknown> | null;
  }): ResponsibilitiesVariableResolverService {
    const responsibilitiesModel = {
      findById: () => ({
        exec: async () =>
          overrides?.record === undefined ? buildRecord() : overrides.record,
      }),
    };
    const companyModel = {
      findById: () => ({
        exec: async () =>
          overrides?.company ?? {
            name: 'Empresa SAS',
            nit: '900123456',
          },
      }),
    };
    return new ResponsibilitiesVariableResolverService(
      responsibilitiesModel as never,
      companyModel as never,
    );
  }

  it('resuelve los datos de la empresa (nombre, nit)', async () => {
    const resolver = buildResolver();

    const context = await resolver.resolve(
      new Types.ObjectId(COMPANY_ID),
      new Types.ObjectId(RECORD_ID),
    );

    assert.equal(context.company.name, 'Empresa SAS');
    assert.equal(context.company.nit, '900123456');
  });

  it('resuelve título y descripción de las responsabilidades', async () => {
    const resolver = buildResolver();

    const context = await resolver.resolve(
      new Types.ObjectId(COMPANY_ID),
      new Types.ObjectId(RECORD_ID),
    );

    assert.equal(
      context.responsibilities.title,
      'Matriz de Responsabilidades del SG-SST',
    );
    assert.ok(context.responsibilities.description?.includes('Cumple'));
  });

  it('resuelve el representante legal desde el __META__ cuando está firmado', async () => {
    const resolver = buildResolver();

    const context = await resolver.resolve(
      new Types.ObjectId(COMPANY_ID),
      new Types.ObjectId(RECORD_ID),
    );

    assert.equal(context.responsible.name, 'Ana Gómez');
    assert.equal(context.responsible.position, 'Representante Legal');
    assert.equal(context.legalRepresentative.name, 'Ana Gómez');
    assert.equal(context.legalRepresentative.signed, true);
  });

  it('excluye la fila __META__ de responsiblePersons y assignments', async () => {
    const resolver = buildResolver();

    const context = await resolver.resolve(
      new Types.ObjectId(COMPANY_ID),
      new Types.ObjectId(RECORD_ID),
    );

    assert.equal(context.responsiblePersons.length, 2);
    assert.ok(
      !context.responsiblePersons.some((entry) => entry.includes('__META__')),
    );
    assert.ok(context.responsiblePersons[0].includes('Responsable del SG-SST'));
    // Las asignaciones marcan estado de firma.
    assert.ok(context.assignments[0].includes('asignado'));
    assert.ok(context.assignments[0].includes('firmado'));
  });

  it('lanza NotFound si el registro no existe', async () => {
    const resolver = buildResolver({ record: null });

    await assert.rejects(
      () =>
        resolver.resolve(
          new Types.ObjectId(COMPANY_ID),
          new Types.ObjectId(RECORD_ID),
        ),
      NotFoundException,
    );
  });

  it('lanza NotFound si el registro pertenece a otra empresa', async () => {
    const resolver = buildResolver({
      record: {
        ...buildRecord(),
        companyId: new Types.ObjectId('64b0000000000000000000ff'),
      } as unknown as PhvaAdvancedResponsibilitiesDocument,
    });

    await assert.rejects(
      () =>
        resolver.resolve(
          new Types.ObjectId(COMPANY_ID),
          new Types.ObjectId(RECORD_ID),
        ),
      NotFoundException,
    );
  });
});
