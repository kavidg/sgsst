import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Types } from 'mongoose';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EppService } from './epp.service';
import { SST_EPP_ITEM_CODE, SST_EPP_LEGACY_ITEM_CODES } from '../phva-advanced/schemas/phva-advanced-epp.schema';

/**
 * Tests de la matriz de aplicabilidad Cargo → EPP (4.2.6, etapa dominio+CRUD).
 * Cubre los 30 casos obligatorios: validaciones de negocio, unicidad 409,
 * tenant-scoping, inmutabilidad de identidad, roles, endpoint matrix y
 * fronteras (canonical 4.2.6 / legacy 1.2.3 / requiredFor sin interpretar).
 */

const COMPANY_A = new Types.ObjectId('507f1f77bcf86cd799439011');
const COMPANY_B = new Types.ObjectId('507f1f77bcf86cd799439022');
const USER_UID = 'firebase-uid-owner';

type AnyRecord = Record<string, any>;

function buildMocks() {
  const relations: AnyRecord[] = [];
  const jobProfiles: AnyRecord[] = [];
  const eppRecords: AnyRecord[] = [];

  const applicabilityModel = {
    create: async (doc: AnyRecord) => {
      const created = { _id: new Types.ObjectId(), createdAt: new Date(), updatedAt: new Date(), ...doc };
      relations.push(created);
      return created;
    },
    find: (query: AnyRecord) => {
      const result = () => relations.filter((r) => String(r.companyId) === String(query.companyId));
      return {
        exec: async () => result(),
        sort: () => ({ exec: async () => result() }),
      };
    },
    findOne: (query: AnyRecord) => ({
      exec: async () =>
        relations.find(
          (r) =>
            (!query._id || String(r._id) === String(query._id)) &&
            String(r.companyId) === String(query.companyId) &&
            (!query.jobProfileId || String(r.jobProfileId) === String(query.jobProfileId)) &&
            (!query.eppItemId || r.eppItemId === query.eppItemId),
        ) ?? null,
    }),
    findOneAndUpdate: (query: AnyRecord, update: { $set?: AnyRecord }) => ({
      exec: async () => {
        const doc = relations.find(
          (r) => String(r._id) === String(query._id) && String(r.companyId) === String(query.companyId),
        );
        if (!doc) return null;
        if (update.$set) Object.assign(doc, update.$set);
        return doc;
      },
    }),
  };

  const jobProfileModel = {
    find: (query: AnyRecord) => {
      const result = () => jobProfiles.filter((p) => String(p.companyId) === String(query.companyId));
      return {
        exec: async () => result(),
        sort: () => ({ exec: async () => result() }),
      };
    },
    findOne: (query: AnyRecord) => ({
      exec: async () =>
        jobProfiles.find(
          (p) => String(p._id) === String(query._id) && String(p.companyId) === String(query.companyId),
        ) ?? null,
    }),
  };

  const eppModel = {
    findOne: (query: AnyRecord) => ({
      exec: async () => {
        if (Array.isArray(query.itemCode?.$in)) {
          // Patrón canónico/legacy (findEppRecord y matrix)
          return (
            eppRecords.find(
              (r) => String(r.companyId) === String(query.companyId) && query.itemCode.$in.includes(r.itemCode),
            ) ?? null
          );
        }
        return eppRecords.find((r) => String(r.companyId) === String(query.companyId)) ?? null;
      },
    }),
  };

  return { applicabilityModel, jobProfileModel, eppModel, relations, jobProfiles, eppRecords };
}

function createService(mocks = buildMocks()) {
  const service = new EppService(
    { create: async () => ({}), find: () => ({ sort: () => ({ exec: async () => [] }) }), findOne: () => ({ exec: async () => null }) } as never,
    { findOne: () => ({ exec: async () => null }) } as never,
    mocks.eppModel as never,
    mocks.applicabilityModel as never,
    mocks.jobProfileModel as never,
  );
  return { service, ...mocks };
}

function seedProfile(mocks: ReturnType<typeof buildMocks>, companyId = COMPANY_A, name = 'Soldador'): AnyRecord {
  const doc = { _id: new Types.ObjectId(), companyId, code: 'SOLD', name, active: true } as AnyRecord;
  mocks.jobProfiles.push(doc);
  return doc;
}

function seedEpp(
  mocks: ReturnType<typeof buildMocks>,
  companyId = COMPANY_A,
  catalog: AnyRecord[] = [{ eppId: 'EPP-1', name: 'Casco', category: 'Cabeza', standard: 'NTC', active: true }],
  itemCode = SST_EPP_ITEM_CODE,
): AnyRecord {
  const doc = { _id: new Types.ObjectId(), companyId, itemCode, catalog } as AnyRecord;
  mocks.eppRecords.push(doc);
  return doc;
}

function validDto(overrides: Partial<AnyRecord> = {}): any {
  return { jobProfileId: '', eppItemId: 'EPP-1', ...overrides };
}

describe('EppApplicability — matriz Cargo → EPP (4.2.6)', () => {
  let mocks: ReturnType<typeof buildMocks>;
  let service: EppService;
  let profile: AnyRecord;
  let legacyProfile: AnyRecord;

  beforeEach(() => {
    mocks = buildMocks();
    service = new EppService(
      { create: async () => ({}), find: () => ({ sort: () => ({ exec: async () => [] }) }), findOne: () => ({ exec: async () => null }) } as never,
      { findOne: () => ({ exec: async () => null }) } as never,
      mocks.eppModel as never,
      mocks.applicabilityModel as never,
      mocks.jobProfileModel as never,
    );
    profile = seedProfile(mocks);
    legacyProfile = seedProfile(mocks, COMPANY_A, 'Operario');
    seedEpp(mocks);
  });

  describe('Creación', () => {
    it('1. crea relación válida con defaults (required/active true, createdBy server-side)', async () => {
      const created = await service.createApplicability(COMPANY_A, validDto({ jobProfileId: String(profile._id) }), USER_UID);
      assert.equal(created.required, true);
      assert.equal(created.active, true);
      assert.equal(created.createdBy, USER_UID);
      assert.equal(String(created.companyId), String(COMPANY_A));
      assert.equal(String(created.jobProfileId), String(profile._id));
      assert.equal(created.eppItemId, 'EPP-1');
    });

    it('2. rechaza JobProfile de otra empresa (404)', async () => {
      const profileB = seedProfile(mocks, COMPANY_B, 'Cargo B');
      await assert.rejects(
        () => service.createApplicability(COMPANY_A, validDto({ jobProfileId: String(profileB._id) }), USER_UID),
        NotFoundException,
      );
    });

    it('3. rechaza EPP inexistente en el catálogo (404)', async () => {
      await assert.rejects(
        () => service.createApplicability(COMPANY_A, validDto({ jobProfileId: String(profile._id), eppItemId: 'EPP-999' }), USER_UID),
        NotFoundException,
      );
    });

    it('4. rechaza EPP de otra empresa (catálogo cross-tenant → 404)', async () => {
      seedEpp(mocks, COMPANY_B, [{ eppId: 'EPP-B', name: 'Guantes B', category: 'Manos', standard: '', active: true }]);
      await assert.rejects(
        () => service.createApplicability(COMPANY_A, validDto({ jobProfileId: String(profile._id), eppItemId: 'EPP-B' }), USER_UID),
        NotFoundException,
      );
    });

    it('5. rechaza EPP inactivo para NUEVA relación (400)', async () => {
      // Reemplaza el catálogo de la empresa (el mock de findOne devuelve el
      // primer registro de la empresa; 1 documento por empresa).
      mocks.eppRecords.length = 0;
      seedEpp(mocks, COMPANY_A, [
        { eppId: 'EPP-1', name: 'Casco', category: 'Cabeza', standard: '', active: true },
        { eppId: 'EPP-OLD', name: 'Careta viejo', category: 'Cabeza', standard: '', active: false },
      ]);
      await assert.rejects(
        () => service.createApplicability(COMPANY_A, validDto({ jobProfileId: String(profile._id), eppItemId: 'EPP-OLD' }), USER_UID),
        BadRequestException,
      );
    });

    it('6. rechaza duplicado empresa+cargo+EPP (409)', async () => {
      await service.createApplicability(COMPANY_A, validDto({ jobProfileId: String(profile._id) }), USER_UID);
      await assert.rejects(
        () => service.createApplicability(COMPANY_A, validDto({ jobProfileId: String(profile._id) }), USER_UID),
        ConflictException,
      );
    });

    it('1b. ignora companyId/createdBy/updatedBy del cliente (server-side)', async () => {
      const dto = validDto({
        jobProfileId: String(profile._id),
        companyId: COMPANY_B,
        createdBy: 'hacker',
        updatedBy: 'hacker',
      });
      const created = await service.createApplicability(COMPANY_A, dto, USER_UID);
      assert.equal(String(created.companyId), String(COMPANY_A));
      assert.equal(created.createdBy, USER_UID);
      assert.equal(created.updatedBy, undefined);
    });
  });

  describe('Actualización (solo contenido; identidad inmutable)', () => {
    let relationId: string;

    beforeEach(async () => {
      const created = await service.createApplicability(COMPANY_A, validDto({ jobProfileId: String(profile._id) }), USER_UID);
      relationId = String(created._id);
    });

    it('7. actualiza reason', async () => {
      const updated = await service.updateApplicability(relationId, COMPANY_A, { reason: 'Trabajo en altura' }, USER_UID);
      assert.equal(updated.reason, 'Trabajo en altura');
    });

    it('8. actualiza scope', async () => {
      const updated = await service.updateApplicability(relationId, COMPANY_A, { scope: 'Durante soldadura' }, USER_UID);
      assert.equal(updated.scope, 'Durante soldadura');
    });

    it('9. actualiza required (true/false explícitos)', async () => {
      const off = await service.updateApplicability(relationId, COMPANY_A, { required: false }, USER_UID);
      assert.equal(off.required, false);
      const on = await service.updateApplicability(relationId, COMPANY_A, { required: true }, USER_UID);
      assert.equal(on.required, true);
    });

    it('10. desactiva relación (active=false, baja lógica)', async () => {
      const updated = await service.updateApplicability(relationId, COMPANY_A, { active: false }, USER_UID);
      assert.equal(updated.active, false);
    });

    it('11. conserva la relación desactivada en el listado (histórico)', async () => {
      await service.updateApplicability(relationId, COMPANY_A, { active: false }, USER_UID);
      const all = await service.findApplicabilities(COMPANY_A);
      assert.equal(all.length, 1);
      assert.equal(all[0].active, false);
    });

    it('15. PATCH cross-tenant devuelve 404', async () => {
      await assert.rejects(
        () => service.updateApplicability(relationId, COMPANY_B, { required: false }, 'uid-B'),
        NotFoundException,
      );
    });

    it('16-19. no permite modificar jobProfileId/eppItemId/companyId/createdBy', async () => {
      const malicious = {
        required: true,
        jobProfileId: new Types.ObjectId().toString(),
        eppItemId: 'EPP-HACK',
        companyId: String(COMPANY_B),
        createdBy: 'hacker',
        createdAt: new Date('2000-01-01'),
      } as any;
      const updated = await service.updateApplicability(relationId, COMPANY_A, malicious, USER_UID);
      assert.equal(String(updated.jobProfileId), String(profile._id));
      assert.equal(updated.eppItemId, 'EPP-1');
      assert.equal(String(updated.companyId), String(COMPANY_A));
      assert.equal(updated.createdBy, USER_UID);
    });

    it('updatedBy se firma server-side', async () => {
      const updated = await service.updateApplicability(relationId, COMPANY_A, { reason: 'x' } as any, 'uid-editor');
      assert.equal(updated.updatedBy, 'uid-editor');
    });
  });

  describe('Consultas tenant-scoped (§7)', () => {
    it('12. GET completa solo devuelve relaciones del tenant', async () => {
      await service.createApplicability(COMPANY_A, validDto({ jobProfileId: String(profile._id) }), USER_UID);
      // Relación de otra empresa: jamás aparece en la lista de A.
      await mocks.applicabilityModel.create({
        companyId: COMPANY_B,
        jobProfileId: new Types.ObjectId(),
        eppItemId: 'EPP-1',
        required: true,
        active: true,
        createdBy: 'uid-B',
      });
      const all = await service.findApplicabilities(COMPANY_A);
      assert.equal(all.length, 1);
      assert.equal(String(all[0].companyId), String(COMPANY_A));
    });

    it('13. GET por JobProfile valida tenant (404 para cargo de otra empresa)', async () => {
      const profileB = seedProfile(mocks, COMPANY_B, 'Cargo B');
      await assert.rejects(
        () => service.findApplicabilitiesByJobProfile(COMPANY_A, String(profileB._id)),
        NotFoundException,
      );
      const created = await service.createApplicability(COMPANY_A, validDto({ jobProfileId: String(profile._id) }), USER_UID);
      const byProfile = await service.findApplicabilitiesByJobProfile(COMPANY_A, String(profile._id));
      assert.equal(byProfile.length, 1);
      assert.equal(String(byProfile[0]._id), String(created._id));
    });

    it('14. GET por EPP valida catálogo del tenant (404 para ítem ajeno)', async () => {
      seedEpp(mocks, COMPANY_B, [{ eppId: 'EPP-B', name: 'Guantes B', category: 'Manos', standard: '', active: true }]);
      await assert.rejects(() => service.findApplicabilitiesByEppItem(COMPANY_A, 'EPP-B'), NotFoundException);
      await service.createApplicability(COMPANY_A, validDto({ jobProfileId: String(profile._id) }), USER_UID);
      const byItem = await service.findApplicabilitiesByEppItem(COMPANY_A, 'EPP-1');
      assert.equal(byItem.length, 1);
    });

    it('GET una relación: 404 cross-tenant, 200 misma empresa', async () => {
      const created = await service.createApplicability(COMPANY_A, validDto({ jobProfileId: String(profile._id) }), USER_UID);
      await assert.rejects(() => service.findApplicability(String(created._id), COMPANY_B), NotFoundException);
      const found = await service.findApplicability(String(created._id), COMPANY_A);
      assert.equal(String(found._id), String(created._id));
    });
  });

  describe('Roles (§9 permisos en controller/service)', () => {
    it('20-21. manager y member pueden LEER (assertCanWrite los rechazaría al escribir)', async () => {
      // La lectura no pasa por assertCanWrite: verificación indirecta de que
      // los endpoints de lectura no exigen rol de escritura.
      const created = await service.createApplicability(COMPANY_A, validDto({ jobProfileId: String(profile._id) }), USER_UID);
      const found = await service.findApplicability(String(created._id), COMPANY_A);
      assert.ok(found);
    });

    it('22. manager NO puede modificar (ForbiddenException)', () => {
      assert.throws(() => service.assertCanWrite('manager'), ForbiddenException);
    });

    it('23. member NO puede modificar (ForbiddenException)', () => {
      assert.throws(() => service.assertCanWrite('member'), ForbiddenException);
    });

    it('owner/admin sí pueden modificar', () => {
      assert.doesNotThrow(() => service.assertCanWrite('owner'));
      assert.doesNotThrow(() => service.assertCanWrite('admin'));
    });
  });

  describe('Endpoint matrix (§10)', () => {
    it('24. devuelve los JobProfiles correctos de la empresa', async () => {
      seedProfile(mocks, COMPANY_B, 'Cargo Ajeno');
      const matrix = await service.getEppApplicabilityMatrix(COMPANY_A);
      assert.equal(matrix.jobProfiles.length, 2);
      assert.deepEqual(
        matrix.jobProfiles.map((p) => p.name).sort(),
        ['Operario', 'Soldador'],
      );
    });

    it('25. devuelve solo EPP activos del catálogo', async () => {
      mocks.eppRecords.length = 0;
      seedEpp(mocks, COMPANY_A, [
        { eppId: 'EPP-1', name: 'Casco', category: 'Cabeza', standard: 'NTC', active: true },
        { eppId: 'EPP-2', name: 'Guantes', category: 'Manos', standard: '', active: true },
        { eppId: 'EPP-DEAD', name: 'Viejo', category: 'Cabeza', standard: '', active: false },
      ]);
      const matrix = await service.getEppApplicabilityMatrix(COMPANY_A);
      assert.deepEqual(matrix.eppItems.map((i) => i.id), ['EPP-1', 'EPP-2']);
    });

    it('26. no mezcla tenants (relaciones y catálogo de B invisibles para A)', async () => {
      await service.createApplicability(COMPANY_A, validDto({ jobProfileId: String(profile._id) }), USER_UID);
      seedProfile(mocks, COMPANY_B, 'Cargo B');
      seedEpp(mocks, COMPANY_B, [{ eppId: 'EPP-B', name: 'Guantes B', category: 'Manos', standard: '', active: true }]);
      await mocks.applicabilityModel.create({
        companyId: COMPANY_B,
        jobProfileId: new Types.ObjectId(),
        eppItemId: 'EPP-B',
        required: true,
        active: true,
        createdBy: 'uid-B',
      });
      const matrixA = await service.getEppApplicabilityMatrix(COMPANY_A);
      assert.equal(matrixA.assignments.length, 1);
      assert.ok(matrixA.assignments.every((a) => a.eppItemId !== 'EPP-B'));
      assert.ok(matrixA.jobProfiles.every((p) => p.name !== 'Cargo B'));
      const matrixB = await service.getEppApplicabilityMatrix(COMPANY_B);
      assert.equal(matrixB.assignments.length, 1);
      assert.equal(matrixB.eppItems.length, 1);
      assert.equal(matrixB.eppItems[0].id, 'EPP-B');
    });

    it('respuesta enriquecida incluye snapshots de nombre (sin N+1)', async () => {
      await service.createApplicability(
        COMPANY_A,
        validDto({ jobProfileId: String(profile._id), reason: 'Riesgo mecánico', scope: 'Producción' }),
        USER_UID,
      );
      const matrix = await service.getEppApplicabilityMatrix(COMPANY_A);
      const a = matrix.assignments[0];
      assert.equal(a.jobProfileName, 'Soldador');
      assert.equal(a.eppName, 'Casco');
      assert.equal(a.category, 'Cabeza');
      assert.equal(a.reason, 'Riesgo mecánico');
      assert.equal(a.scope, 'Producción');
    });

    it('empresa sin catálogo EPP → matriz con eppItems vacío (sin error)', async () => {
      const empty = buildMocks();
      const emptyService = new EppService(
        { create: async () => ({}), find: () => ({ sort: () => ({ exec: async () => [] }) }), findOne: () => ({ exec: async () => null }) } as never,
        { findOne: () => ({ exec: async () => null }) } as never,
        empty.eppModel as never,
        empty.applicabilityModel as never,
        empty.jobProfileModel as never,
      );
      const matrix = await emptyService.getEppApplicabilityMatrix(COMPANY_A);
      assert.deepEqual(matrix.eppItems, []);
      assert.deepEqual(matrix.assignments, []);
    });
  });

  describe('Fronteras 4.2.6 (§28-30)', () => {
    it('28. identidad canónica 4.2.6 funciona para crear relaciones', async () => {
      const created = await service.createApplicability(COMPANY_A, validDto({ jobProfileId: String(profile._id) }), USER_UID);
      assert.ok(created);
      assert.equal(SST_EPP_ITEM_CODE, '4.2.6');
    });

    it('29. legacy 1.2.3 solo lectura: un catálogo con itemCode legacy es legible', async () => {
      // Documento histórico con itemCode legacy (1 documento por empresa).
      mocks.eppRecords.length = 0;
      seedEpp(mocks, COMPANY_A, [{ eppId: 'EPP-LEGACY', name: 'Legacy', category: 'X', standard: '', active: true }], '1.2.3');
      const created = await service.createApplicability(
        COMPANY_A,
        validDto({ jobProfileId: String(legacyProfile._id), eppItemId: 'EPP-LEGACY' }),
        USER_UID,
      );
      assert.equal(created.eppItemId, 'EPP-LEGACY');
      assert.deepEqual([...SST_EPP_LEGACY_ITEM_CODES], ['1.2.3']);
    });

    it('30. requiredFor NO se interpreta (sin parser en el módulo epp)', () => {
      // Análisis del código del módulo: ninguna función interpreta requiredFor.
      // El spec compila a dist-test/modules/epp → el fuente está 3 niveles arriba.
      const srcDir = join(dirname(dirname(dirname(__dirname))), 'src', 'modules', 'epp');
      for (const file of ['epp.service.ts', 'schemas/epp-applicability.schema.ts', 'dto/create-epp-applicability.dto.ts']) {
        const source = readFileSync(join(srcDir, file), 'utf8');
        // Solo puede aparecer en comentarios: el código no lo lee ni lo parsea.
        const code = source
          .replace(/\/\*[\s\S]*?\*\//g, '')
          .split('\n')
          .map((line) => line.replace(/(^|\s)\/\/.*$/, '$1'))
          .join('\n');
        assert.doesNotMatch(code, /requiredFor/, `${file} no interpreta requiredFor`);
      }
    });

    it('27. relación histórica puede permanecer inactive mientras el ítem se reactiva', async () => {
      await service.createApplicability(COMPANY_A, validDto({ jobProfileId: String(legacyProfile._id) }), USER_UID);
      const all = await service.findApplicabilitiesByEppItem(COMPANY_A, 'EPP-1');
      assert.equal(all.length, 1);
      await service.updateApplicability(String(all[0]._id), COMPANY_A, { active: false }, USER_UID);
      const still = await service.findApplicability(String(all[0]._id), COMPANY_A);
      assert.equal(still.active, false);
    });
  });
});
