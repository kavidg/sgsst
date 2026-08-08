import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

import { ResourceAssignmentVariableResolverService } from './resource-assignment-variable-resolver.service';
import { PhvaAdvancedResourceAssignmentDocument } from './schemas/phva-advanced-resource-assignment.schema';

const COMPANY_ID = '64b000000000000000000001';
const RECORD_ID = '64b000000000000000000002';

/** Registro 1.1.3 con recursos humanos, técnicos, financieros y evidencias. */
function buildRecord(): PhvaAdvancedResourceAssignmentDocument {
  return {
    _id: new Types.ObjectId(RECORD_ID),
    companyId: new Types.ObjectId(COMPANY_ID),
    itemCode: '1.1.3',
    approvalStatus: 'APPROVED',
    currentVersion: '1.2',
    humanResources: [
      { employeeId: 'emp-1', role: 'Profesional SST', responsibilities: [], active: true },
      { employeeId: 'emp-2', role: 'Técnico SST', responsibilities: [], active: false },
    ],
    technicalResources: [
      { name: 'Software SG-SST', status: 'OPERATIVO', quantity: 2, responsible: '' },
    ],
    financialResources: [
      { concept: 'Capacitación', description: '', value: 5000000, status: 'APROBADO', responsible: '' },
    ],
    evidences: [{ fileName: 'evidencia-presupuesto.pdf', fileUrl: 'https://bucket/x' }],
    approvedBy: {
      userId: '64b00000000000000000000a',
      email: 'manager@empresa.com',
      role: 'manager',
      timestamp: '2026-01-02T00:00:00.000Z',
    },
  } as unknown as PhvaAdvancedResourceAssignmentDocument;
}

describe('ResourceAssignmentVariableResolverService', () => {
  function buildResolver(overrides?: {
    record?: PhvaAdvancedResourceAssignmentDocument | null;
    company?: Record<string, unknown> | null;
  }): ResourceAssignmentVariableResolverService {
    const resourceAssignmentModel = {
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
    return new ResourceAssignmentVariableResolverService(
      resourceAssignmentModel as never,
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

  it('resuelve recursos humanos solo activos', async () => {
    const resolver = buildResolver();

    const context = await resolver.resolve(
      new Types.ObjectId(COMPANY_ID),
      new Types.ObjectId(RECORD_ID),
    );

    assert.equal(context.resources.human.length, 1);
    assert.ok(context.resources.human[0].includes('Profesional SST'));
  });

  it('resuelve recursos técnicos con cantidad y estado', async () => {
    const resolver = buildResolver();

    const context = await resolver.resolve(
      new Types.ObjectId(COMPANY_ID),
      new Types.ObjectId(RECORD_ID),
    );

    assert.equal(context.resources.technical.length, 1);
    assert.ok(context.resources.technical[0].includes('Software SG-SST'));
    assert.ok(context.resources.technical[0].includes('(2)'));
  });

  it('resuelve recursos financieros con valor y estado', async () => {
    const resolver = buildResolver();

    const context = await resolver.resolve(
      new Types.ObjectId(COMPANY_ID),
      new Types.ObjectId(RECORD_ID),
    );

    assert.equal(context.resources.financial.length, 1);
    assert.ok(context.resources.financial[0].includes('Capacitación'));
    assert.ok(context.resources.financial[0].includes('5.000.000'));
  });

  it('resuelve recursos físicos desde las evidencias cargadas', async () => {
    const resolver = buildResolver();

    const context = await resolver.resolve(
      new Types.ObjectId(COMPANY_ID),
      new Types.ObjectId(RECORD_ID),
    );

    assert.equal(context.resources.physical.length, 1);
    assert.ok(
      context.resources.physical[0].includes('evidencia-presupuesto.pdf'),
    );
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
      } as unknown as PhvaAdvancedResourceAssignmentDocument,
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
