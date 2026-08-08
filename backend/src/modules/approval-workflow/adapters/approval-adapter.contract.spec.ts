import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';

import { ApprovalAdapter, ApplyDecisionContext } from './approval-adapter.interface';
import { ApprovalDecision } from '../enums/approval-decision.enum';
import { ApprovalEntity } from '../enums/approval-entity.enum';
import { ApprovalStatus } from '../enums/approval-status.enum';
import { ApprovalActor } from '../interfaces/approval-actor.interface';

/**
 * Opciones opcionales para ajustar el contract suite a un adapter concreto.
 */
export interface AdapterContractOptions {
  /** Entidad que debe devolver getEntity (por defecto solo verifica que no sea null/undefined). */
  getEntityResult?: unknown;
  /** Estados locales de prueba para validar mapStatus. */
  localStatuses?: string[];
  /** Decisión usada en applyDecision (por defecto APPROVED). */
  decision?: ApprovalDecision;
  /** Resultado esperado de applyDecision (por defecto solo verifica que resuelve). */
  applyDecisionResult?: unknown;
  /**
   * Si se provee, getEntity con ese entityId debe rechazar: valida que el
   * adapter NO silencie errores de la entidad subyacente.
   */
  failingEntityId?: string;

  /**
   * Comportamiento esperado cuando getEntity recibe entityId undefined.
   * 'reject' (por defecto): el adapter requiere entityId y lanza error
   * controlado. 'resolve': el adapter consulta por companyId (p.ej. Initial
   * Evaluation) y debe devolver una entidad no vacía.
   */
  getEntityWithoutEntityId?: 'reject' | 'resolve';
}

/** ObjectIds válidos de MongoDB usados por el contexto del contrato. */
const COMPANY_ID = '64b000000000000000000001';
const ENTITY_ID = '64b000000000000000000002';
const ACTOR_USER_ID = '64b000000000000000000004';

/** Conjunto amplio de estados locales (incluye uno desconocido). */
const DEFAULT_LOCAL_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'ADJUSTMENTS_REQUESTED',
  'ARCHIVED',
  'estado-desconocido',
];

/**
 * Suite de contrato reutilizable para cualquier implementación de ApprovalAdapter.
 *
 * Uso:
 *   describe('DocumentAdapter Contract', () => {
 *     createAdapterContractSuite(() => new DocumentAdapter(...));
 *   });
 *
 * Valida la estructura mínima (módulo, métodos) y los comportamientos
 * esenciales (getEntity, mapStatus, allowedRoles, applyDecision) que todo
 * adapter conectado al Approval Workflow Core debe cumplir.
 */
export function createAdapterContractSuite(
  adapterFactory: () => ApprovalAdapter,
  options: AdapterContractOptions = {},
): void {
  describe('ApprovalAdapter contract', () => {
    const adapter = adapterFactory();

    it('expone un módulo (entityType) definido y válido', () => {
      assert.ok(adapter.module, 'adapter.module debe estar definido');
      assert.ok(
        Object.values(ApprovalEntity).includes(adapter.module),
        `module debe ser un ApprovalEntity válido (recibido: ${String(adapter.module)})`,
      );
    });

    it('implementa los métodos del contrato', () => {
      assert.equal(typeof adapter.getEntity, 'function');
      assert.equal(typeof adapter.applyDecision, 'function');
      assert.equal(typeof adapter.mapStatus, 'function');
      assert.equal(typeof adapter.allowedRoles, 'function');
    });

    it('getEntity retorna la entidad (sin errores silenciosos)', async () => {
      const entity = await adapter.getEntity(COMPANY_ID, ENTITY_ID);
      assert.ok(
        entity !== null && entity !== undefined,
        'getEntity no debe devolver null/undefined',
      );

      if (options.getEntityResult !== undefined) {
        assert.deepEqual(entity, options.getEntityResult);
      }

      // Si la entidad expone estado, debe ser un string no vacío.
      const status = (entity as { status?: unknown }).status;
      if (status !== undefined) {
        assert.equal(typeof status, 'string');
        assert.ok((status as string).length > 0, 'status no debe ser vacío');
      }
    });

    it('getEntity propaga errores en lugar de silenciarlos', async () => {
      if (options.failingEntityId === undefined) {
        return;
      }
      await assert.rejects(() =>
        adapter.getEntity(COMPANY_ID, options.failingEntityId as string),
      );
    });

    it('getEntity maneja entityId opcional (contrato flexible)', async () => {
      const behavior = options.getEntityWithoutEntityId ?? 'reject';
      if (behavior === 'resolve') {
        const entity = await adapter.getEntity(COMPANY_ID, undefined);
        assert.ok(
          entity !== null && entity !== undefined,
          'getEntity sin entityId debe devolver la entidad por companyId',
        );
        return;
      }
      // Por defecto: el adapter requiere entityId y debe fallar con error
      // controlado (no silencioso).
      await assert.rejects(() => adapter.getEntity(COMPANY_ID, undefined));
    });

    it('mapStatus siempre retorna un ApprovalStatus válido', () => {
      const statuses = options.localStatuses ?? DEFAULT_LOCAL_STATUSES;
      const valid = Object.values(ApprovalStatus);
      for (const local of statuses) {
        const mapped = adapter.mapStatus(local);
        assert.ok(
          valid.includes(mapped),
          `mapStatus('${local}') retornó estado inválido: ${String(mapped)}`,
        );
      }
    });

    it('allowedRoles retorna un arreglo de roles no vacío', () => {
      const roles = adapter.allowedRoles();
      assert.ok(Array.isArray(roles), 'allowedRoles debe retornar un arreglo');
      assert.ok(roles.length > 0, 'allowedRoles no debe retornar vacío');
      for (const role of roles) {
        assert.equal(typeof role, 'string');
      }
    });

    it('applyDecision acepta el contexto completo (entityId, companyId, decision, actor, reason)', async () => {
      const actor: ApprovalActor = {
        userId: ACTOR_USER_ID,
        email: 'manager@test.com',
        role: 'manager',
        timestamp: new Date('2026-01-01T00:00:00.000Z'),
      };
      const ctx: ApplyDecisionContext = {
        companyId: new Types.ObjectId(COMPANY_ID),
        entityId: new Types.ObjectId(ENTITY_ID),
        decision: options.decision ?? ApprovalDecision.APPROVED,
        reason: 'Motivo del contrato',
        actor,
      };

      const result = await adapter.applyDecision(ctx);
      if (options.applyDecisionResult !== undefined) {
        assert.deepEqual(result, options.applyDecisionResult);
      } else {
        assert.ok(
          result !== undefined,
          'applyDecision no debe devolver undefined (sin errores silenciosos)',
        );
      }
    });
  });
}
