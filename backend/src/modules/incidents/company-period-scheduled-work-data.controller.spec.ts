import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { Types } from 'mongoose';
import { ForbiddenException } from '@nestjs/common';
import { CompanyPeriodScheduledWorkDataController } from './company-period-scheduled-work-data.controller';

/**
 * FASE 35E-2 — Tests del controller del denominador de 3.3.6.
 *
 * Verifica: companyId SIEMPRE server-side (request.companyId), rechazo de
 * companyId del payload de otro tenant, y reglas de roles declaradas.
 */

const COMPANY = new Types.ObjectId('64b0000000000000000000a1');
const OTHER = new Types.ObjectId('64b0000000000000000000b2');
const USER_ID = '64b0000000000000000000c3';

function buildRequest(overrides: {
  companyId?: Types.ObjectId | undefined;
  payloadCompanyId?: string;
} = {}) {
  return {
    companyId: overrides.companyId !== undefined ? overrides.companyId : COMPANY,
    user: { uid: 'firebase-uid', _id: USER_ID },
    headers: {},
  } as never;
}

function buildController() {
  const service = {
    upsert: mock.fn((..._args: unknown[]) => Promise.resolve({ ok: true })),
    findAll: mock.fn((..._args: unknown[]) => Promise.resolve([])),
    findByPeriod: mock.fn((..._args: unknown[]) => Promise.resolve(null)),
    remove: mock.fn((..._args: unknown[]) => Promise.resolve(undefined)),
  };
  const controller = new CompanyPeriodScheduledWorkDataController(service as never);
  return { controller, service };
}

describe('FASE 35E-2 — CompanyPeriodScheduledWorkDataController', () => {
  it('SWD-017: upsert usa el tenant resuelto server-side (payload sin companyId)', async () => {
    const { controller, service } = buildController();
    const req = buildRequest();
    // El frontend NUNCA decide el companyId: sin companyId en el payload, el
    // registro se crea bajo el tenant resuelto por CompanyAccessGuard.
    await controller.upsert(req, { period: '2026-08', scheduledWorkDays: 210 });
    const arg0 = (service.upsert.mock.calls[0].arguments[0] as unknown as Types.ObjectId).toString();
    assert.equal(arg0, COMPANY.toString(), 'el companyId autoritativo es request.companyId');
  });

  it('SWD-018: rechaza payload con companyId de OTRO tenant (cross-tenant)', async () => {
    const { controller } = buildController();
    const req = buildRequest({ payloadCompanyId: OTHER.toString() });
    await assert.rejects(
      () =>
        controller.upsert(req as never, {
          period: '2026-08',
          scheduledWorkDays: 210,
          companyId: OTHER.toString(),
        }),
      ForbiddenException,
    );
  });

  it('SWD-019: acepta payload con companyId que coincide con el tenant resuelto', async () => {
    const { controller, service } = buildController();
    const req = buildRequest({ payloadCompanyId: COMPANY.toString() });
    await controller.upsert(req as never, {
      period: '2026-08',
      scheduledWorkDays: 210,
      companyId: COMPANY.toString(),
    });
    assert.equal(service.upsert.mock.calls.length, 1);
  });

  it('SWD-020: sin tenant resuelto → Forbidden', async () => {
    const { controller } = buildController();
    // Request literal SIN companyId (guard no resolvió tenant).
    const req = { user: { uid: 'firebase-uid', _id: USER_ID }, headers: {} } as never;
    await assert.rejects(
      () => controller.upsert(req, { period: '2026-08', scheduledWorkDays: 210 }),
      ForbiddenException,
    );
  });

  it('SWD-021: propaga actor autenticado (trazabilidad createdBy/updatedBy)', async () => {
    const { controller, service } = buildController();
    await controller.upsert(buildRequest() as never, { period: '2026-08', scheduledWorkDays: 210 });
    const actor = service.upsert.mock.calls[0].arguments[3] as unknown as Types.ObjectId;
    assert.equal(actor?.toString(), USER_ID);
  });

  it('SWD-022: findAll/findByPeriod/remove filtran por el tenant resuelto', async () => {
    const { controller, service } = buildController();
    await controller.findAll(buildRequest() as never);
    await controller.findByPeriod(buildRequest() as never, '2026-08');
    await controller.remove(buildRequest() as never, '2026-08');
    for (const fn of [service.findAll, service.findByPeriod, service.remove]) {
      const arg0 = (fn.mock.calls[0].arguments[0] as unknown as Types.ObjectId).toString();
      assert.equal(arg0, COMPANY.toString());
    }
  });

  it('SWD-023: decoradores de roles — WRITE owner/admin, READ incluye manager', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../../src/modules/incidents/company-period-scheduled-work-data.controller.ts'),
      'utf-8',
    );
    // WRITE (Post/Delete): owner + admin únicamente.
    const postIdx = src.indexOf('@Post()');
    assert.ok(src.slice(postIdx, postIdx + 80).includes("@Roles('owner', 'admin')"));
    const deleteIdx = src.indexOf("@Delete('period/:period')");
    assert.ok(src.slice(deleteIdx, deleteIdx + 80).includes("@Roles('owner', 'admin')"));
    // READ (Get): owner/admin/manager (member sin acceso administrativo).
    const getIdx = src.indexOf('@Get()');
    assert.ok(src.slice(getIdx, getIdx + 100).includes("@Roles('owner', 'admin', 'manager')"));
    // MEMBER nunca aparece.
    assert.doesNotMatch(src, /@Roles\([^)]*'member'/);
  });
});
