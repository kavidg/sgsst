import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  INSPECTION_STATUS,
  isInspectionCompleted,
  normalizeInspectionStatus,
  withCanonicalInspectionStatus,
} from './inspection-status.util';

/**
 * Tests del helper único de normalización de InspectionActivity.status.
 * Fijan el contrato canónico (PENDING | COMPLETED) y la tolerancia de lectura
 * con los datos históricos detectados en la auditoría.
 */

const completedVariants: Array<string | boolean> = [
  'completada',
  'Completada',
  'COMPLETADA',
  'completed',
  'Completed',
  'COMPLETED',
  'completa',
  'COMPLETA',
  'complete',
  'COMPLETE',
  'ejecutada',
  'EJECUTADA',
  'finalizada',
  'FINALIZADA',
  'closed',
  'CLOSED',
  'cerrada',
  'CERRADA',
  'aprobada',
  'APROBADA',
  'approved',
  'APPROVED',
  true,
  'true',
];

const pendingVariants: Array<string | boolean> = [
  'pendiente',
  'PENDIENTE',
  'pending',
  'PENDING',
  false,
  'false',
];

const unknownVariants: unknown[] = [
  undefined,
  null,
  '',
  '   ',
  'xyz',
  'en proceso',
  0,
  1,
];

describe('normalizeInspectionStatus', () => {
  describe('variantes COMPLETED', () => {
    for (const variant of completedVariants) {
      it(`"${String(variant)}" → COMPLETED`, () => {
        assert.equal(normalizeInspectionStatus(variant), 'COMPLETED');
      });
    }
  });

  describe('variantes PENDING', () => {
    for (const variant of pendingVariants) {
      it(`"${String(variant)}" → PENDING`, () => {
        assert.equal(normalizeInspectionStatus(variant), 'PENDING');
      });
    }
  });

  describe('valores desconocidos/ausentes → PENDING', () => {
    for (const variant of unknownVariants) {
      it(`"${String(variant)}" → PENDING`, () => {
        assert.equal(normalizeInspectionStatus(variant as never), 'PENDING');
      });
    }
  });
  it('es tolerante a espacios en blanco', () => {
    assert.equal(normalizeInspectionStatus('  Completada  '), 'COMPLETED');
    assert.equal(normalizeInspectionStatus(' pending '), 'PENDING');
  });

  it('no lanza con inputs extremos', () => {
    assert.doesNotThrow(() => normalizeInspectionStatus({} as never));
    assert.doesNotThrow(() => normalizeInspectionStatus([] as never));
  });

  it('expone las constantes canónicas', () => {
    assert.deepEqual(INSPECTION_STATUS, { PENDING: 'PENDING', COMPLETED: 'COMPLETED' });
  });
});

describe('isInspectionCompleted', () => {
  it('reconoce variantes históricas de completado', () => {
    assert.equal(isInspectionCompleted('completed'), true);
    assert.equal(isInspectionCompleted('ejecutada'), true);
    assert.equal(isInspectionCompleted('Completada'), true);
    assert.equal(isInspectionCompleted(true), true);
  });

  it('no reconoce pendientes ni desconocidos', () => {
    assert.equal(isInspectionCompleted('pendiente'), false);
    assert.equal(isInspectionCompleted(''), false);
    assert.equal(isInspectionCompleted(undefined), false);
  });
});

describe('withCanonicalInspectionStatus', () => {
  it('normaliza variantes al persistir', () => {
    assert.deepEqual(
      withCanonicalInspectionStatus({ title: 'A', status: 'completed' }),
      { title: 'A', status: 'COMPLETED' },
    );
    assert.deepEqual(
      withCanonicalInspectionStatus({ title: 'B', status: 'ejecutada' }),
      { title: 'B', status: 'COMPLETED' },
    );
    assert.deepEqual(
      withCanonicalInspectionStatus({ title: 'C', status: 'pendiente' }),
      { title: 'C', status: 'PENDING' },
    );
  });

  it('aplica PENDING cuando el status viene ausente', () => {
    assert.deepEqual(
      withCanonicalInspectionStatus({ title: 'D' }),
      { title: 'D', status: 'PENDING' },
    );
  });});
