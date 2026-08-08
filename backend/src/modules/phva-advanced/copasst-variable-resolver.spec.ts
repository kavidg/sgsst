import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

import { CopasstVariableResolverService } from './copasst-variable-resolver.service';
import { CopasstPeriodDocument } from '../copasst/schemas/copasst.schema';

const COMPANY_ID = '64b000000000000000000001';
const PERIOD_ID = '64b000000000000000000002';

/** Periodo COPASST con integrantes mixtos (empleador + trabajador). */
function buildPeriod(): CopasstPeriodDocument {
  return {
    _id: new Types.ObjectId(PERIOD_ID),
    companyId: new Types.ObjectId(COMPANY_ID),
    periodName: 'Periodo 2024-2026',
    startDate: new Date('2024-01-01T00:00:00.000Z'),
    endDate: new Date('2026-12-31T00:00:00.000Z'),
    status: 'ACTIVO',
    currentVersion: '1.2',
    members: [
      {
        userId: new Types.ObjectId(),
        userName: 'Ana Gómez',
        committeeRole: 'PRESIDENTE',
        representationType: 'EMPLEADOR',
        principalType: 'PRINCIPAL',
        startDate: new Date('2024-01-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        status: 'ACTIVO',
      },
      {
        userId: new Types.ObjectId(),
        userName: 'Luis Pérez',
        committeeRole: 'SECRETARIO',
        representationType: 'TRABAJADOR',
        principalType: 'PRINCIPAL',
        startDate: new Date('2024-01-01T00:00:00.000Z'),
        endDate: new Date('2026-12-31T00:00:00.000Z'),
        status: 'ACTIVO',
      },
    ],
  } as unknown as CopasstPeriodDocument;
}

describe('CopasstVariableResolverService', () => {
  function buildResolver(overrides?: {
    period?: CopasstPeriodDocument | null;
    company?: Record<string, unknown> | null;
  }): CopasstVariableResolverService {
    // Stub del modelo CopasstPeriod. Solo el caso explícito undefined usa el
    // periodo por defecto; null debe devolver null para ejercitar el NotFound
    // del resolver (?? trataría null como ausente).
    const periodModel = {
      findById: () => ({
        exec: async () =>
          overrides?.period === undefined ? buildPeriod() : overrides.period,
      }),
    };
    const companyModel = {
      findById: () => ({
        exec: async () =>
          overrides?.company ?? {
            name: 'Empresa SAS',
            nit: '900123456',
            employeeCount: 42,
          },
      }),
    };
    return new CopasstVariableResolverService(
      periodModel as never,
      companyModel as never,
    );
  }

  it('resuelve los datos de la empresa (nombre, nit, workerCount)', async () => {
    const resolver = buildResolver();

    const context = await resolver.resolve(
      new Types.ObjectId(COMPANY_ID),
      new Types.ObjectId(PERIOD_ID),
    );

    assert.equal(context.company.name, 'Empresa SAS');
    assert.equal(context.company.nit, '900123456');
    assert.equal(context.company.workerCount, 42);
    // El schema de Company no persiste dirección: null → cadena vacía.
    assert.equal(context.company.address, null);
  });

  it('resuelve las fechas y el nombre del periodo COPASST', async () => {
    const resolver = buildResolver();

    const context = await resolver.resolve(
      new Types.ObjectId(COMPANY_ID),
      new Types.ObjectId(PERIOD_ID),
    );

    assert.equal(context.copasst.startDate, '2024-01-01');
    assert.equal(context.copasst.endDate, '2026-12-31');
    assert.equal(context.copasst.period, 'Periodo 2024-2026');
  });

  it('separa representantes del empleador y de los trabajadores', async () => {
    const resolver = buildResolver();

    const context = await resolver.resolve(
      new Types.ObjectId(COMPANY_ID),
      new Types.ObjectId(PERIOD_ID),
    );

    assert.equal(context.members.length, 2);
    assert.deepEqual(context.employerRepresentatives, [
      'Ana Gómez — PRESIDENTE',
    ]);
    assert.deepEqual(context.workerRepresentatives, [
      'Luis Pérez — SECRETARIO',
    ]);
  });

  it('entrega funciones normativas por defecto (Resolución 2013 de 1986)', async () => {
    const resolver = buildResolver();

    const context = await resolver.resolve(
      new Types.ObjectId(COMPANY_ID),
      new Types.ObjectId(PERIOD_ID),
    );

    assert.ok(context.functions.length > 0);
    assert.ok(context.functions[0].toLowerCase().includes('proponer'));
  });

  it('lanza NotFound si el periodo no existe', async () => {
    const resolver = buildResolver({ period: null });

    await assert.rejects(
      () =>
        resolver.resolve(
          new Types.ObjectId(COMPANY_ID),
          new Types.ObjectId(PERIOD_ID),
        ),
      NotFoundException,
    );
  });

  it('lanza NotFound si el periodo pertenece a otra empresa (companyId incorrecto)', async () => {
    const resolver = buildResolver({
      period: {
        ...buildPeriod(),
        companyId: new Types.ObjectId('64b0000000000000000000ff'),
      } as unknown as CopasstPeriodDocument,
    });

    await assert.rejects(
      () =>
        resolver.resolve(
          new Types.ObjectId(COMPANY_ID),
          new Types.ObjectId(PERIOD_ID),
        ),
      NotFoundException,
    );
  });
});
