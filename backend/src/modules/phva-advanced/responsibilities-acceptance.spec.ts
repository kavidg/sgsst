import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';
import { BadRequestException } from '@nestjs/common';

import { ResponsibilitiesAcceptanceService, RESPONSIBILITIES_SOURCE_MODULE } from './responsibilities-acceptance.service';
import { WorkerSignatureCampaignService } from '../worker-signature-campaign/worker-signature-campaign.service';
import { WorkerStatus } from '../worker-signature-campaign/schemas/worker-signature-campaign.schema';
import { ResponsibilityAssignmentEntry } from './schemas/phva-advanced-responsibilities.schema';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service';

/**
 * Pruebas Fase 1 — "Enviar a aceptación" (1.1.2).
 * Sin MongoDB en memoria (patrón del repo): modelos stub en memoria y los
 * servicios REALES (ResponsibilitiesAcceptanceService + WorkerSignatureCampaignService).
 * Cubre los 9 casos del requerimiento.
 */

const COMPANY_A = new Types.ObjectId();
const COMPANY_B = new Types.ObjectId();

/** Stub mínimo de documento estilo Mongoose. */
function stubDocument<T extends object>(data: Partial<T> & { _id?: Types.ObjectId }): T {
  return Object.assign({ _id: data._id ?? new Types.ObjectId() }, data) as T;
}

/** Comparación tolerante a ObjectId/string (usa toString en objetos). */
function matches(actual: unknown, expected: unknown): boolean {
  if (actual === expected) return true;
  if (actual == null || expected == null) return false;
  const left = typeof actual === 'object' ? (actual as { toString(): string }).toString() : actual;
  const right = typeof expected === 'object' ? (expected as { toString(): string }).toString() : expected;
  return left === right;
}

/** Filtra el seed aplicando un filtro simple estilo Mongo ($in incluido). */
function filterSeed<T extends object>(seed: Array<T & { _id: Types.ObjectId }>, filter: Record<string, unknown>) {
  return seed.filter((doc) => {
    const record = doc as unknown as Record<string, unknown>;
    return Object.entries(filter).every(([key, value]) => {
      if (value && typeof value === 'object' && '$in' in (value as Record<string, unknown>)) {
        const ids = (value as { $in: Array<unknown> }).$in.map((id) => id!.toString());
        const actual = Array.isArray(record[key]) ? (record[key] as unknown[]).map((v) => String(v)) : [String(record[key])];
        return ids.some((id) => actual.includes(id));
      }
      if (value && typeof value === 'object' && '$nin' in (value as Record<string, unknown>)) {
        const ids = (value as { $nin: Array<unknown> }).$nin.map((id) => String(id));
        return !ids.includes(String(record[key]));
      }
      return matches(record[key], value);
    });
  });
}

/**
 * Modelo stub de NotificationDelivery: create simula E11000 cuando la
 * deliveryKey ya existe (semántica del índice único real); updateOne aplica
 * $set; find expone sort/limit/exec.
 */
function buildDeliveryModel<T extends object>(seed: Array<T & { _id: Types.ObjectId }> = []) {
  const model = {
    create: async (data: Record<string, unknown>) => {
      if (seed.some((doc) => (doc as Record<string, unknown>).deliveryKey === data.deliveryKey)) {
        const err = new Error('E11000 duplicate key collection') as Error & { code?: number };
        err.code = 11000;
        throw err;
      }
      const doc: Record<string, unknown> = { ...data, _id: new Types.ObjectId() };
      seed.push(doc as T & { _id: Types.ObjectId });
      return doc;
    },
    updateOne: (filter: Record<string, unknown>, update: Record<string, unknown>) => {
      const chain = {
        exec: async () => {
          const doc = filterSeed(seed, filter)[0] as unknown as Record<string, unknown> | undefined;
          if (doc && update.$set) Object.assign(doc, update.$set);
          return { modifiedCount: doc ? 1 : 0 };
        },
      };
      return chain;
    },
    find: (filter: Record<string, unknown>) => {
      const chain = {
        sort: () => chain,
        limit: () => chain,
        exec: async () => filterSeed(seed, filter),
      };
      return chain;
    },
  };
  return { model: model as unknown as import('mongoose').Model<any>, seed };
}

/**
 * Modelo stub estilo Mongoose: findOne/find devuelven cadenas con .exec() y
 * .sort(); create adjunta save() al documento creado (los servicios del repo
 * hacen doc.save()).
 */
function buildModel<T extends object>(seed: Array<T & { _id: Types.ObjectId }> = []) {
  const model = {
    findOne: (filter: Record<string, unknown>) => {
      const chain = {
        exec: async () => filterSeed(seed, filter)[0] ?? null,
      };
      return chain;
    },
    findById: (id: unknown) => {
      const chain = {
        exec: async () => seed.find((doc) => String((doc as { _id: Types.ObjectId })._id) === String(id)) ?? null,
      };
      return chain;
    },
    /** findOneAndUpdate simplificado: matchea igualdad simple y aplica $set/$inc (new:true). */
    findOneAndUpdate: (filter: Record<string, unknown>, update: Record<string, unknown>) => {
      const chain = {
        exec: async () => {
          const doc = filterSeed(seed, filter)[0] as unknown as Record<string, unknown> | undefined;
          if (!doc) return null;
          if (update.$set) Object.assign(doc, update.$set);
          if (update.$inc) for (const [field, delta] of Object.entries(update.$inc)) {
            doc[field] = ((doc[field] as number) ?? 0) + (delta as number);
          }
          return doc;
        },
      };
      return chain;
    },
    find: (filter: Record<string, unknown>) => {
      const chain = {
        select: () => chain,
        sort: () => chain,
        exec: async () => filterSeed(seed, filter),
      };
      return chain;
    },
    create: async (data: Record<string, unknown>) => {
      const doc: Record<string, unknown> = { ...data, _id: (data._id as Types.ObjectId) ?? new Types.ObjectId() };
      // Defaults equivalentes a los @Prop({ default: ... }) del schema real.
      doc.auditHistory = doc.auditHistory ?? [];
      doc.workers = doc.workers ?? [];
      doc.used = doc.used ?? false;
      doc.save = async () => doc;
      doc.toObject = () => doc;
      seed.push(doc as T & { _id: Types.ObjectId });
      return doc;
    },
  };
  return { model: model as unknown as import('mongoose').Model<any>, seed };
}

// ── Empleados (fuente única: módulo Employees) ──
const EMP_JUAN_ID = new Types.ObjectId();
const JUAN = { _id: EMP_JUAN_ID, companyId: COMPANY_A, status: 'Activo', name: 'Juan Pérez', document: '123456', position: 'Operario', area: 'Producción', corporateEmail: 'juan@empresa.com', mobilePhone: '3001112233' };
const MARIA = { _id: new Types.ObjectId(), companyId: COMPANY_A, status: 'Activo', name: 'María López', document: '789012', position: 'Auxiliar', area: 'Administrativa', corporateEmail: '', mobilePhone: '' };
const CARLOS = { _id: new Types.ObjectId(), companyId: COMPANY_A, status: 'Activo', name: 'Carlos Ruiz', document: '345678', position: 'Operario', area: 'Producción', corporateEmail: 'carlos@empresa.com', mobilePhone: '' };
const PEDRO_INACTIVO = { _id: new Types.ObjectId(), companyId: COMPANY_A, status: 'No activo', name: 'Pedro Retirado', document: '999999', position: 'Operario', area: 'Bodega', corporateEmail: '', mobilePhone: '' };
const EMPLEADO_OTRA_EMPRESA = { _id: new Types.ObjectId(), companyId: COMPANY_B, status: 'Activo', name: 'De Otra Empresa', document: '777777', position: 'Operario', area: 'X', corporateEmail: '', mobilePhone: '' };

// ── Responsabilidades (modelo activo phva-advanced con fila __META__) ──
type Entry = ResponsibilityAssignmentEntry & { assignedDocument?: string };

function entry(data: Partial<Entry>): Entry {
  return stubDocument<Entry>({
    active: true,
    requiresSignature: false,
    status: 'PENDIENTE',
    signature: { accepted: false, version: 1 },
    ...data,
  } as Partial<Entry>);
}

function metaEntry(version: string, approvalStatus = 'APPROVED'): Entry {
  return entry({
    title: '__META__',
    active: false,
    category: JSON.stringify({ currentVersion: version, approvalStatus }),
  });
}

function baseEntries(): Entry[] {
  return [
    metaEntry('1.2'),
    entry({ title: 'Cumplir normas SST', category: 'Trabajadores', role: 'MEMBER', requiresSignature: true, assignedDocument: '123456' }),
    entry({ title: 'Usar EPP', category: 'Trabajadores', role: 'MEMBER', requiresSignature: true, assignedDocument: '123456' }),
    entry({ title: 'Archivo ordenado', category: 'Administrativa', role: 'MEMBER', assignedDocument: '789012' }),
  ];
}

function buildService(
  employees: Array<Record<string, unknown>>,
  responsibilities: Entry[] | null,
  options: {
    /** Stub del proveedor de email (mock del EmailDeliveryProvider). */
    emailProvider?: { send: (input: unknown) => Promise<unknown> };
    /** Fase 3B-1 — mock del WhatsAppDeliveryProvider. */
    whatsappProvider?: { send: (input: unknown) => Promise<unknown> };
    frontendUrl?: string;
  } = {},
) {
  const campaigns = buildModel<any>([]);
  const workers = buildModel<any>([]);
  const tokens = buildModel<any>([]);
  const evidences = buildModel<any>([]);
  const audits = buildModel<any>([]);
  const reminders = buildModel<any>([]);

  // Fase 2 — stubs de las dependencias de seguridad (el flujo de Fase 1 no
  // usa OTP; el rate-limit por defecto de los tests permite el paso).
  const otpChallengeStub = {
    setChallenge: async () => undefined,
    getChallenge: async () => null,
    incrementAttempts: async () => null,
    consumeIfMatches: async () => false,
    deleteChallenge: async () => undefined,
  };
  const otpRateLimitStub = { assertRateLimit: async () => undefined, assertOtpRateLimit: async () => undefined };

  const campaignService = new WorkerSignatureCampaignService(
    campaigns.model, workers.model, tokens.model, evidences.model, audits.model, reminders.model,
    otpChallengeStub as never, otpRateLimitStub as never,
  );
  const responsibilitiesModel = buildModel<any>(
    responsibilities ? [{ _id: new Types.ObjectId(), companyId: COMPANY_A, itemCode: '1.1.2', responsibilities }] : [],
  );
  const employeeModel = buildModel<any>(employees);
  const companyModel = buildModel<any>([{
    _id: COMPANY_A,
    name: 'Empresa Demo SAS',
    nit: '900123456',
    standardsType: '60',
    economicSector: 'Manufactura',
    ownerId: new Types.ObjectId(),
  }]);

  // Fase 3A/3B — NotificationDeliveryService REAL con modelo stub y providers
  // mock (envueltos con un grabador: todas las pruebas pueden inspeccionar .calls).
  const deliveries = buildDeliveryModel<any>([]);
  const innerProvider = options.emailProvider ?? { send: async () => ({ success: true, providerMessageId: 'msg_ok_1', timestamp: new Date() }) };
  const providerCalls: unknown[] = [];
  const emailProviderStub = {
    calls: providerCalls,
    send: async (input: unknown) => {
      providerCalls.push(input);
      return (innerProvider as { send: (i: unknown) => Promise<unknown> }).send(input);
    },
  };
  // Fase 3B-1 — WhatsApp mock con su propio grabador (independiente de email).
  const innerWhatsApp = options.whatsappProvider ?? { send: async () => ({ success: true, providerMessageId: 'mock_wamid.1', timestamp: new Date() }) };
  const whatsappCalls: unknown[] = [];
  const whatsappProviderStub = {
    calls: whatsappCalls,
    send: async (input: unknown) => {
      whatsappCalls.push(input);
      return (innerWhatsApp as { send: (i: unknown) => Promise<unknown> }).send(input);
    },
  };

  // ConfigService stub: FRONTEND_URL configurable por prueba (regla 11).
  const configValues: Record<string, string> = {
    FRONTEND_URL: options.frontendUrl ?? 'http://localhost:5173',
    WHATSAPP_DEFAULT_COUNTRY_CODE: '57',
  };
  const configStub = { get: (key: string) => configValues[key] } as never;

  const notificationDeliveryService = new NotificationDeliveryService(
    deliveries.model,
    otpRateLimitStub as never,
    emailProviderStub as never,
    whatsappProviderStub as never,
  );
  const service = new ResponsibilitiesAcceptanceService(
    responsibilitiesModel.model, employeeModel.model, campaignService,
    notificationDeliveryService, configStub, companyModel.model,
  );
  return {
    service,
    campaignService,
    emailProviderStub,
    whatsappProviderStub,
    configValues,
    seeds: {
      campaigns: campaigns.seed,
      workers: workers.seed,
      tokens: tokens.seed,
      evidences: evidences.seed,
      audits: audits.seed,
      deliveries: deliveries.seed,
    },
  };
}

describe('ResponsibilitiesAcceptanceService — Fase 1 (1.1.2 Enviar a aceptación)', () => {
  it('Caso 1: empleado activo con documento/correo/celular genera campaña + enlace con datos reales del Employee', async () => {
    const { service, seeds } = buildService([JUAN, MARIA], baseEntries());
    const result = await service.sendToAcceptance(COMPANY_A, [EMP_JUAN_ID.toString()]);

    assert.equal(result.version, '1.2');
    assert.equal(result.results.length, 1);
    const dispatch = result.results[0];
    assert.equal(dispatch.reused, false);
    assert.match(dispatch.signUrl, /^\/sign\/[0-9a-f]{64}$/);

    // Worker creado con el mapeo exigido (Employee como fuente, sin User).
    assert.equal(seeds.workers.length, 1);
    const worker = seeds.workers[0] as any;
    assert.equal(worker.employeeId, EMP_JUAN_ID.toString());
    assert.equal(worker.name, 'Juan Pérez');
    assert.equal(worker.identification, '123456'); // documento REAL (no el Mongo _id)
    assert.equal(worker.position, 'Operario');
    assert.equal(worker.area, 'Producción');
    assert.equal(worker.email, 'juan@empresa.com');
    assert.equal(worker.phone, '3001112233');

    // Campaña: fuente, versión y contenido congelado.
    const campaign = seeds.campaigns[0] as any;
    assert.equal(campaign.sourceModule, RESPONSIBILITIES_SOURCE_MODULE);
    assert.equal(campaign.documentVersion, '1.2');
    assert.equal(campaign.status, 'ACTIVE');
    assert.match(campaign.documentContent, /Juan Pérez/);
    assert.match(campaign.documentContent, /123456/);
    assert.match(campaign.documentContent, /Cumplir normas SST/);
    assert.match(campaign.documentContent, /Usar EPP/);
    assert.ok(!campaign.documentContent.includes('Archivo ordenado'), 'solo SUS responsabilidades');

    // Token generado al activar.
    assert.equal(seeds.tokens.length, 1);
    assert.equal((seeds.tokens[0] as any).token, dispatch.token);
  });

  it('Caso 2: empleado activo SIN correo genera campaña', async () => {
    const { service, seeds } = buildService([MARIA], baseEntries());
    const result = await service.sendToAcceptance(COMPANY_A, [(MARIA as any)._id.toString()]);
    assert.equal(result.results.length, 1);
    assert.equal((seeds.workers[0] as any).email, undefined);
  });

  it('Caso 3: empleado activo SIN celular genera campaña', async () => {
    const { service, seeds } = buildService([CARLOS], baseEntries());
    const result = await service.sendToAcceptance(COMPANY_A, [(CARLOS as any)._id.toString()]);
    assert.equal(result.results.length, 1);
    assert.equal((seeds.workers[0] as any).phone, undefined);
  });

  it('Caso 4: empleado inactivo NO se envía a aceptación', async () => {
    const { service, seeds } = buildService([PEDRO_INACTIVO], baseEntries());
    const result = await service.sendToAcceptance(COMPANY_A, [(PEDRO_INACTIVO as any)._id.toString()]);
    assert.equal(result.results.length, 0);
    assert.equal(result.rejected.length, 1);
    assert.equal(seeds.workers.length, 0);
    assert.equal(seeds.campaigns.length, 0);
  });

  it('Caso 5: empleado de otra empresa → rechazado (tenant-safe)', async () => {
    const { service, seeds } = buildService([EMPLEADO_OTRA_EMPRESA], baseEntries());
    const result = await service.sendToAcceptance(COMPANY_A, [(EMPLEADO_OTRA_EMPRESA as any)._id.toString()]);
    assert.equal(result.results.length, 0);
    assert.equal(result.rejected.length, 1);
    assert.equal(seeds.workers.length, 0);
    assert.equal(seeds.campaigns.length, 0);
  });

  it('Caso 6: misma versión dos veces → reutiliza campaña activa (sin duplicados, mismo enlace)', async () => {
    const { service, seeds } = buildService([JUAN], baseEntries());
    const first = await service.sendToAcceptance(COMPANY_A, [EMP_JUAN_ID.toString()]);
    const second = await service.sendToAcceptance(COMPANY_A, [EMP_JUAN_ID.toString()]);
    assert.equal(first.results[0].reused, false);
    assert.equal(second.results[0].reused, true);
    assert.equal(second.results[0].campaignId, first.results[0].campaignId);
    assert.equal(second.results[0].token, first.results[0].token);
    assert.equal(seeds.workers.length, 1);
    assert.equal(seeds.campaigns.length, 1);
  });

  it('Caso 6b: matriz no aprobada → rechaza; sin selección → rechaza', async () => {
    const { BadRequestException } = await import('@nestjs/common');
    const notApproved = buildService([JUAN], [metaEntry('1.2', 'PENDING_APPROVAL'), ...baseEntries().slice(1)]);
    await assert.rejects(notApproved.service.sendToAcceptance(COMPANY_A, [EMP_JUAN_ID.toString()]), BadRequestException);
    const ok = buildService([JUAN], baseEntries());
    await assert.rejects(ok.service.sendToAcceptance(COMPANY_A, []), BadRequestException);
  });

  it('Caso 7: el trabajador se identifica con su documento REAL (validateIdentity)', async () => {
    const { service, campaignService } = buildService([JUAN], baseEntries());
    const { results } = await service.sendToAcceptance(COMPANY_A, [EMP_JUAN_ID.toString()]);
    const token = results[0].token;

    const info = await campaignService.getWorkerByToken(token);
    assert.equal((info.worker as any).identification, '123456');

    await campaignService.validateIdentity(token, { token, identification: '123456' } as any);
    await assert.rejects(
      campaignService.validateIdentity(token, { token, identification: 'otro' } as any),
      /no coinciden/,
    );
  });

  it('Caso 8: aceptación/firma completa deja evidencia (hash, código, versión) y el token se consume', async () => {
    const { service, campaignService, seeds } = buildService([JUAN], baseEntries());
    const { results } = await service.sendToAcceptance(COMPANY_A, [EMP_JUAN_ID.toString()]);
    const token = results[0].token;

    await campaignService.validateIdentity(token, { token, identification: '123456' } as any);
    const sign = await campaignService.signDocument(token, {
      token, hasRead: true, signatureMethod: 'TYPED', signatureData: 'Juan Pérez',
      ipAddress: '10.0.0.8', userAgent: 'spec', browser: 'spec', os: 'spec',
    } as any);
    assert.equal((sign as any).signed, true);

    assert.equal(seeds.evidences.length, 1);
    const evidence = seeds.evidences[0] as any;
    assert.equal(evidence.workerIdentification, '123456');
    assert.equal(evidence.documentVersion, '1.2');
    assert.equal(evidence.otpValidated, false);
    assert.match(evidence.signatureHash, /^[0-9a-f]{64}$/);
    assert.match(evidence.verificationCode, /^[0-9A-F]{8}$/);
    // Fase 2 — integridad: la evidencia nueva queda vinculada al contenido.
    assert.match(evidence.evidencePayloadHash, /^[0-9a-f]{64}$/);
    assert.equal((seeds.workers[0] as any).status, WorkerStatus.SIGNED);
    assert.equal((seeds.tokens[0] as any).used, true);

    // El enlace consumido no permite firmar de nuevo (estado explícito).
    await assert.rejects(
      campaignService.signDocument(token, { token, hasRead: true } as any),
      /ya fue firmado/,
    );
  });

  it('Caso 9: dos trabajadores → enlaces distintos y cada uno ve solo SUS responsabilidades', async () => {
    const { service, seeds } = buildService([JUAN, MARIA], baseEntries());
    const result = await service.sendToAcceptance(COMPANY_A, [EMP_JUAN_ID.toString(), (MARIA as any)._id.toString()]);

    assert.equal(result.results.length, 2);
    const tokens = new Set(result.results.map((dispatch) => dispatch.token));
    assert.equal(tokens.size, 2, 'cada trabajador tiene su propio enlace');

    const byName = new Map(seeds.campaigns.map((campaign) => [(campaign as any).name, campaign as any]));
    const juanCampaign = Array.from(byName.values()).find((campaign) => campaign.documentContent.includes('Juan Pérez'))!;
    const mariaCampaign = Array.from(byName.values()).find((campaign) => campaign.documentContent.includes('María López'))!;
    assert.ok(juanCampaign.documentContent.includes('Usar EPP') && !juanCampaign.documentContent.includes('Archivo ordenado'));
    assert.ok(mariaCampaign.documentContent.includes('Archivo ordenado') && !mariaCampaign.documentContent.includes('Usar EPP'));
  });

  it('Extra: getAcceptanceStatus expone el estado real del worker por documento', async () => {
    const { service } = buildService([JUAN], baseEntries());
    const before = await service.getAcceptanceStatus(COMPANY_A);
    assert.equal(before.statuses.length, 0);

    await service.sendToAcceptance(COMPANY_A, [EMP_JUAN_ID.toString()]);
    const after = await service.getAcceptanceStatus(COMPANY_A);
    assert.equal(after.version, '1.2');
    assert.equal(after.statuses.length, 1);
    assert.equal(after.statuses[0].identification, '123456');
    // Fase 3A — con email enviado exitosamente el worker pasa a LINK_SENT
    // (antes quedaba PENDING; el enum ya contemplaba este estado).
    assert.equal(after.statuses[0].workerStatus, 'LINK_SENT');
    assert.match(after.statuses[0].signUrl, /^\/sign\//);
  });

  it('Extra: worker expirado → una nueva llamada emite campaña nueva (re-emisión)', async () => {
    const { service, seeds } = buildService([JUAN], baseEntries());
    const first = await service.sendToAcceptance(COMPANY_A, [EMP_JUAN_ID.toString()]);
    (seeds.workers[0] as any).status = WorkerStatus.EXPIRED;
    const second = await service.sendToAcceptance(COMPANY_A, [EMP_JUAN_ID.toString()]);
    assert.equal(second.results[0].reused, false);
    assert.notEqual(second.results[0].token, first.results[0].token);
    assert.equal(seeds.campaigns.length, 2);
  });

  // ══════════ Fase 3B-1 — Canal WhatsApp (Meta mockeado) ══════════

  it('Fase 3B WA1: email + WhatsApp → AMBOS envíos con el MISMO token, worker LINK_SENT', async () => {
    const { service, emailProviderStub, whatsappProviderStub, seeds } = buildService([JUAN], baseEntries());
    const result = await service.sendToAcceptance(COMPANY_A, [EMP_JUAN_ID.toString()]);
    const dispatch = result.results[0];

    assert.equal(dispatch.emailDelivery?.status, 'SENT');
    assert.equal(dispatch.whatsappDelivery?.status, 'SENT');
    assert.equal((emailProviderStub.calls as unknown[]).length, 1);
    assert.equal((whatsappProviderStub.calls as unknown[]).length, 1);
    // El acceptanceUrl del WhatsApp es el MISMO token que el email (regla 3/11).
    const waCall = (whatsappProviderStub.calls as Array<{ acceptanceUrl: string }>)[0];
    assert.ok(waCall.acceptanceUrl.endsWith(`/sign/${dispatch.token}`));
    // Worker LINK_SENT (por email, primer canal exitoso) y UNA sola campaña.
    assert.equal((seeds.workers[0] as any).status, WorkerStatus.LINK_SENT);
    assert.equal(seeds.campaigns.length, 1);
    // Auditoría WHATSAPP_SEND_REQUESTED + WHATSAPP_SENT (regla 18).
    const actions = seeds.audits.map((audit) => (audit as any).action);
    assert.ok(actions.includes('WHATSAPP_SEND_REQUESTED'));
    assert.ok(actions.includes('WHATSAPP_SENT'));
  });

  it('Fase 3B WA2: solo email (sin teléfono) → email SENT, WhatsApp RECIPIENT_MISSING sin bloquear', async () => {
    const { service, whatsappProviderStub, seeds } = buildService([CARLOS], baseEntries());
    const result = await service.sendToAcceptance(COMPANY_A, [(CARLOS as any)._id.toString()]);
    const dispatch = result.results[0];

    assert.equal(dispatch.emailDelivery?.status, 'SENT');
    assert.equal(dispatch.whatsappDelivery?.attempted, false);
    assert.equal(dispatch.whatsappDelivery?.errorCode, 'WHATSAPP_RECIPIENT_MISSING');
    assert.equal((whatsappProviderStub.calls as unknown[]).length, 0, 'nunca intenta sin número');
    assert.equal((seeds.workers[0] as any).status, WorkerStatus.LINK_SENT, 'email marcó LINK_SENT');
    assert.equal(seeds.campaigns.length, 1);
  });

  it('Fase 3B WA3: solo WhatsApp (sin email) → WhatsApp SENT, email sin intento', async () => {
    const LUCIA = { _id: new Types.ObjectId(), companyId: COMPANY_A, status: 'Activo', name: 'Lucía Gómez', document: '444555', position: 'Auxiliar', area: 'Logística', corporateEmail: '', mobilePhone: '3114445566' };
    const { service, emailProviderStub, seeds } = buildService([LUCIA], baseEntries());
    const result = await service.sendToAcceptance(COMPANY_A, [(LUCIA as any)._id.toString()]);
    const dispatch = result.results[0];

    assert.equal(dispatch.emailDelivery?.attempted, false, 'sin email no hay intento email');
    assert.equal(dispatch.whatsappDelivery?.status, 'SENT');
    assert.equal((emailProviderStub.calls as unknown[]).length, 0);
    assert.equal((seeds.workers[0] as any).status, WorkerStatus.LINK_SENT);
    assert.equal((seeds.workers[0] as any).deliveryMethod, 'WHATSAPP');
  });

  it('Fase 3B WA4: WhatsApp fallido → campaña ACTIVE, email continúa, sin segunda campaña/token', async () => {
    const waFailing = { send: async () => ({ success: false, errorCode: 'WHATSAPP_AUTH_ERROR', errorMessage: 'credenciales rechazadas', timestamp: new Date() }) };
    const { service, seeds } = buildService([JUAN], baseEntries(), { whatsappProvider: waFailing });
    const result = await service.sendToAcceptance(COMPANY_A, [EMP_JUAN_ID.toString()]);
    const dispatch = result.results[0];

    assert.equal(dispatch.whatsappDelivery?.success, false);
    assert.equal(dispatch.whatsappDelivery?.errorCode, 'WHATSAPP_AUTH_ERROR');
    // Email INDEPENDIENTE sigue funcionando (regla 16).
    assert.equal(dispatch.emailDelivery?.status, 'SENT');
    assert.equal((seeds.campaigns[0] as any).status, 'ACTIVE');
    assert.equal(seeds.campaigns.length, 1, 'NO se crea segunda campaña');
    assert.equal(seeds.tokens.length, 1, 'NO se crea segundo token');
    const actions = seeds.audits.map((audit) => (audit as any).action);
    assert.ok(actions.includes('WHATSAPP_FAILED'));
    assert.ok(actions.includes('EMAIL_SENT'));
  });

  it('Fase 3B WA5: WhatsApp no configurado → fallo controlado y enlace manual disponible', async () => {
    const waUnconfigured = { send: async () => ({ success: false, errorCode: 'WHATSAPP_NOT_CONFIGURED', errorMessage: 'no configurado', timestamp: new Date() }) };
    const { service, seeds } = buildService([JUAN], baseEntries(), { whatsappProvider: waUnconfigured });
    const result = await service.sendToAcceptance(COMPANY_A, [EMP_JUAN_ID.toString()]);
    assert.equal(result.results[0].whatsappDelivery?.errorCode, 'WHATSAPP_NOT_CONFIGURED');
    assert.equal((seeds.campaigns[0] as any).status, 'ACTIVE');
    assert.match(result.results[0].signUrl, /^\/sign\//);
  });

  it('Fase 3B WA6: auditoría WhatsApp NUNCA contiene teléfono completo ni token completo', async () => {
    const { service, seeds } = buildService([JUAN], baseEntries());
    const result = await service.sendToAcceptance(COMPANY_A, [EMP_JUAN_ID.toString()]);
    const token = result.results[0].token;
    const auditsJson = JSON.stringify(seeds.audits);
    assert.ok(!auditsJson.includes('3001112233'), 'teléfono completo jamás en auditoría');
    assert.ok(auditsJson.includes('•••33'), 'solo máscara del teléfono');
    assert.ok(!auditsJson.includes(token), 'token completo jamás en auditoría');
  });

  // ══════════ Fase 3A — Entrega por email (Resend mockeado) ══════════

  it('Fase 3A P1: worker con corporateEmail → proveedor llamado, entrega SENT, worker LINK_SENT, audits EMAIL_*', async () => {
    const { service, emailProviderStub, seeds } = buildService([JUAN], baseEntries());
    const result = await service.sendToAcceptance(COMPANY_A, [EMP_JUAN_ID.toString()]);

    const dispatch = result.results[0];
    assert.equal(dispatch.emailDelivery?.attempted, true);
    assert.equal(dispatch.emailDelivery?.status, 'SENT');
    assert.equal((emailProviderStub.calls as unknown[]).length, 1);

    // Estado del worker distinguido del estado de la entrega (regla 17).
    assert.equal((seeds.workers[0] as any).status, WorkerStatus.LINK_SENT);
    assert.equal((seeds.workers[0] as any).deliveryMethod, 'EMAIL');
    assert.ok((seeds.workers[0] as any).linkSentAt instanceof Date);

    // Campaña intacta y activa (la entrega no la altera).
    assert.equal((seeds.campaigns[0] as any).status, 'ACTIVE');

    // Auditoría EMAIL_SEND_REQUESTED + EMAIL_SENT (regla 15).
    const actions = seeds.audits.map((audit) => (audit as any).action);
    assert.ok(actions.includes('EMAIL_SEND_REQUESTED'));
    assert.ok(actions.includes('EMAIL_SENT'));
    assert.ok(!actions.includes('EMAIL_FAILED'));
  });

  it('Fase 3A P2: worker SIN corporateEmail → NO intenta envío, worker PENDING, enlace manual disponible', async () => {
    const { service, emailProviderStub, seeds } = buildService([MARIA], baseEntries());
    const result = await service.sendToAcceptance(COMPANY_A, [(MARIA as any)._id.toString()]);

    assert.equal(result.results[0].emailDelivery?.attempted, false);
    assert.equal((emailProviderStub.calls as unknown[]).length, 0, 'nunca intenta enviar sin email');
    assert.equal((seeds.workers[0] as any).status, WorkerStatus.PENDING, 'queda manual');
    assert.equal(seeds.campaigns.length, 1, 'la campaña SÍ se crea');
    assert.match(result.results[0].signUrl, /^\/sign\/[0-9a-f]{64}$/);
  });

  it('Fase 3A P5/6/7 (3B: multi-canal): fallo de Resend → email FAILED, campaña ACTIVE, mismo token; WhatsApp independiente', async () => {
    const failingProvider = {
      send: async () => ({ success: false, errorCode: 'invalid_api_key', errorMessage: 'API key inválida', timestamp: new Date() }),
    };
    const { service, seeds } = buildService([JUAN], baseEntries(), { emailProvider: failingProvider });
    const result = await service.sendToAcceptance(COMPANY_A, [EMP_JUAN_ID.toString()]);
    const dispatch = result.results[0];

    assert.equal(dispatch.emailDelivery?.attempted, true);
    assert.equal(dispatch.emailDelivery?.success, false);
    assert.equal(dispatch.emailDelivery?.status, 'FAILED');
    assert.equal(dispatch.emailDelivery?.errorCode, 'invalid_api_key');

    // La campaña NO se invalida y el enlace sigue funcionando (regla 12/16).
    assert.equal((seeds.campaigns[0] as any).status, 'ACTIVE');
    // 3B-1: el fallo de EMAIL no impide que WHATSAPP entregue el MISMO
    // enlace → worker LINK_SENT por el canal que SÍ funcionó
    // (worker state ≠ delivery state de cada canal).
    assert.equal((seeds.workers[0] as any).status, WorkerStatus.LINK_SENT);
    assert.equal((seeds.workers[0] as any).deliveryMethod, 'WHATSAPP');
    assert.equal(seeds.tokens.length, 1);
    assert.equal((seeds.tokens[0] as any).token, dispatch.token);
    // Dos entregas (email FAILED + whatsapp SENT), una por canal.
    assert.equal(seeds.deliveries.length, 2);
    const emailRow = seeds.deliveries.find((d) => (d as any).channel === 'EMAIL') as any;
    const waRow = seeds.deliveries.find((d) => (d as any).channel === 'WHATSAPP') as any;
    assert.equal(emailRow.status, 'FAILED');
    assert.equal(waRow.status, 'SENT');

    const actions = seeds.audits.map((audit) => (audit as any).action);
    assert.ok(actions.includes('EMAIL_SEND_REQUESTED'));
    assert.ok(actions.includes('EMAIL_FAILED'));
    assert.ok(!actions.includes('EMAIL_SENT'));
  });

  it('Fase 3A P16: adapter sin configurar → EMAIL_NOT_CONFIGURED, campaña sigue activa', async () => {
    const unconfigured = {
      send: async () => ({ success: false, errorCode: 'EMAIL_NOT_CONFIGURED', errorMessage: 'El envío de correo no está configurado en este entorno.', timestamp: new Date() }),
    };
    const { service, seeds } = buildService([JUAN], baseEntries(), { emailProvider: unconfigured });
    const result = await service.sendToAcceptance(COMPANY_A, [EMP_JUAN_ID.toString()]);
    assert.equal(result.results[0].emailDelivery?.errorCode, 'EMAIL_NOT_CONFIGURED');
    assert.equal((seeds.campaigns[0] as any).status, 'ACTIVE');
    assert.match(result.results[0].signUrl, /^\/sign\//);
  });

  it('Fase 3A P13: el correo usa FRONTEND_URL y contiene el MISMO token del worker', async () => {
    const { service, emailProviderStub } = buildService([JUAN], baseEntries(), { frontendUrl: 'https://sst.miempresa.com' });
    const result = await service.sendToAcceptance(COMPANY_A, [EMP_JUAN_ID.toString()]);
    const sent = (emailProviderStub.calls as Array<{ html: string; to: string }>)[0];
    assert.match(sent.html, new RegExp(`https://sst\\.miempresa\\.com/sign/${result.results[0].token}`));
    assert.equal(sent.to, 'juan@empresa.com');
  });

  it('Fase 3A P10 (3B: multi-canal): doble "Enviar a aceptación" → dedup de campaña, UN correo y UN WhatsApp', async () => {
    const { service, emailProviderStub, whatsappProviderStub, seeds } = buildService([JUAN], baseEntries());
    const first = await service.sendToAcceptance(COMPANY_A, [EMP_JUAN_ID.toString()]);
    const second = await service.sendToAcceptance(COMPANY_A, [EMP_JUAN_ID.toString()]);

    assert.equal(second.results[0].reused, true, 'segunda llamada reutiliza campaña');
    assert.equal(second.results[0].token, first.results[0].token, 'mismo token');
    assert.equal(second.results[0].emailDelivery?.attempted, false, 'reuso NO re-dispara envío inicial');
    assert.equal((emailProviderStub.calls as unknown[]).length, 1, 'UN solo correo en total');
    assert.equal((whatsappProviderStub.calls as unknown[]).length, 1, 'UN solo WhatsApp en total');
    assert.equal(seeds.campaigns.length, 1);
    assert.equal(seeds.deliveries.length, 2, 'una entrega por canal (email + whatsapp)');
  });

  it('Fase 3A P11/12: auditoría y errores NUNCA exponen token completo ni API key', async () => {
    const failingProvider = {
      send: async () => ({ success: false, errorCode: 'invalid_api_key', errorMessage: 'la clave re_SECRETO123456789 no es válida', timestamp: new Date() }),
    };
    const { service, seeds } = buildService([JUAN], baseEntries(), { emailProvider: failingProvider });
    const result = await service.sendToAcceptance(COMPANY_A, [EMP_JUAN_ID.toString()]);
    const token = result.results[0].token;

    const auditsJson = JSON.stringify(seeds.audits);
    assert.ok(!auditsJson.includes(token), 'token completo jamás en auditoría');
    assert.ok(auditsJson.includes(`${token.slice(0, 6)}…`), 'solo token truncado');
    assert.ok(!auditsJson.includes('re_SECRETO123456789'), 'API key jamás en auditoría');

    const deliveriesJson = JSON.stringify(seeds.deliveries);
    assert.ok(!deliveriesJson.includes('re_SECRETO123456789'), 'API key jamás en deliveries');
  });

  it('Fase 3A P16b: tenant correcto — la entrega queda asociada a la empresa del empleado', async () => {
    const { service, seeds } = buildService([JUAN], baseEntries());
    const result = await service.sendToAcceptance(COMPANY_A, [EMP_JUAN_ID.toString()]);
    const delivery = seeds.deliveries[0] as any;
    assert.equal(delivery.companyId.toString(), COMPANY_A.toString());
    assert.equal(delivery.campaignId.toString(), result.results[0].campaignId);
    assert.equal(delivery.channel, 'EMAIL');
    assert.equal(delivery.provider, 'RESEND');
    // Empleado de otra empresa sigue rechazado (sin entrega ni campaña).
    const intruso = await service.sendToAcceptance(COMPANY_A, [(EMPLEADO_OTRA_EMPRESA as any)._id.toString()]);
    assert.equal(intruso.results.length, 0);
    assert.equal(intruso.rejected.length, 1);
  });

  it('Fase 3A P15: trabajador sin email puede aceptar con el enlace manual (flujo público intacto)', async () => {
    const { service, campaignService } = buildService([MARIA], baseEntries());
    const result = await service.sendToAcceptance(COMPANY_A, [(MARIA as any)._id.toString()]);
    const token = result.results[0].token;
    const info = await campaignService.getWorkerByToken(token);
    assert.equal((info.worker as any).identification, '789012');
    await campaignService.validateIdentity(token, { token, identification: '789012' } as any);
    const sign = await campaignService.signDocument(token, {
      token, hasRead: true, signatureMethod: 'TYPED', signatureData: 'María López',
    } as any);
    assert.equal((sign as any).signed, true);
  });

  // Regresión DI: el wiring del módulo real no es cubierto por los stubs de
  // arriba. Se aserta sobre el fuente (patrón readSource del repo) que
  // PhvaAdvancedModule importa el módulo que EXPONE WorkerSignatureCampaignService
  // y registra el service nuevo — sin esto, Nest arranca con
  // UnknownDependenciesException (index [2]).
  it('Regresión DI: PhvaAdvancedModule importa WorkerSignatureCampaignModule y registra el service', async () => {
    const fs = await import('fs');
    const path = await import('path');
    // dist-test/modules/phva-advanced → backend/ (patrón readSource del repo).
    const readSource = (relativePath: string) =>
      fs.readFileSync(path.resolve(__dirname, `../../../${relativePath}`), 'utf-8');
    const moduleSource = readSource('src/modules/phva-advanced/phva-advanced.module.ts');
    assert.match(moduleSource, /import \{ WorkerSignatureCampaignModule \}/);
    assert.match(moduleSource, /WorkerSignatureCampaignModule,/);
    assert.match(moduleSource, /ResponsibilitiesAcceptanceService/);
    const serviceSource = readSource('src/modules/phva-advanced/responsibilities-acceptance.service.ts');
    assert.match(serviceSource, /private readonly campaignService: WorkerSignatureCampaignService/);
  });

  // Regresión DI Fase 3A: el módulo debe importar NotificationsModule.register()
  // (exporta NotificationDeliveryService) — sin esto Nest arranca con
  // UnknownDependenciesException en ResponsibilitiesAcceptanceService (index [3]).
  it('Regresión DI 3A: PhvaAdvancedModule registra NotificationsModule y las dependencias del service existen', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const readSource = (relativePath: string) =>
      fs.readFileSync(path.resolve(__dirname, `../../../${relativePath}`), 'utf-8');
    const moduleSource = readSource('src/modules/phva-advanced/phva-advanced.module.ts');
    assert.match(moduleSource, /NotificationsModule\.register\(\)/);
    const serviceSource = readSource('src/modules/phva-advanced/responsibilities-acceptance.service.ts');
    assert.match(serviceSource, /notificationDeliveryService: NotificationDeliveryService/);
    assert.match(serviceSource, /configService: ConfigService/);
    const notificationsSource = readSource('src/modules/notifications/notification-delivery.service.ts');
    assert.match(notificationsSource, /EMAIL_PROVIDER_TOKEN/);
    const notificationsModuleSource = readSource('src/modules/notifications/notifications.module.ts');
    assert.match(notificationsModuleSource, /exports: \[NotificationDeliveryService\]/);
  });
});
