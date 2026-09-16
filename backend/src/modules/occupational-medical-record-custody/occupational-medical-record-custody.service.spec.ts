import assert from 'node:assert/strict';
import { describe, it, beforeEach, mock } from 'node:test';
import { Types } from 'mongoose';

import { OccupationalMedicalRecordCustodyService } from './occupational-medical-record-custody.service';
import {
  CustodyStatus,
  OccupationalMedicalRecordCustody,
  RecordType,
} from './schemas/occupational-medical-record-custody.schema';
import { CreateOccupationalMedicalRecordCustodyDto } from './dto/create-occupational-medical-record-custody.dto';
import { UpdateOccupationalMedicalRecordCustodyDto } from './dto/update-occupational-medical-record-custody.dto';

// IDs canónicos de dos tenants distintos.
const companyId = new Types.ObjectId('507f1f77bcf86cd799439011').toHexString();
const employeeId = new Types.ObjectId('507f1f77bcf86cd799439012').toHexString();
const otherCompanyId = new Types.ObjectId('507f1f77bcf86cd799439099').toHexString();
const otherEmployeeId = new Types.ObjectId('507f1f77bcf86cd799439098').toHexString();

const recordIdHex = '507f1f77bcf86cd799439013';

/**
 * Mock del Model de Mongoose (mismo patrón que health-promotion.service.spec):
 * mock.fn() de node:test + resultados configurables por test.
 */
function createModelMock() {
  const state = {
    /** Resultado del siguiente findOne() (used por findOne y update). */
    findOneResult: null as Record<string, unknown> | null,
    /** Resultado del siguiente findOneAndUpdate().lean(). */
    findOneAndUpdateResult: null as Record<string, unknown> | null,
    /** Resultado del siguiente findByIdAndUpdate().lean(). */
    findByIdAndUpdateResult: null as Record<string, unknown> | null,
    /** Documentos que devolverá el siguiente find()…lean(). */
    findResults: [] as Record<string, unknown>[],
    /** Contador de documentos creados vía create(). */
    created: [] as Record<string, unknown>[],
  };

  const model = {
    create: mock.fn((payload: Record<string, unknown>) => {
      const doc = { ...payload, _id: new Types.ObjectId() };
      state.created.push(doc);
      // El service llama a .toObject() sobre el documento creado (contrato real
      // de Mongoose), el mock debe ser compatible con ese contrato.
      return Promise.resolve({
        ...doc,
        toObject: () => doc,
      });
    }),
    find: mock.fn((_filter?: Record<string, unknown>) => {
      const chain = {
        sort: mock.fn(() => chain),
        limit: mock.fn(() => chain),
        skip: mock.fn(() => chain),
        lean: mock.fn(() => Promise.resolve(state.findResults)),
      };
      return chain;
    }),
    // El service usa findOne() de DOS formas con el contrato real de Mongoose:
    // - findOne(...).lean() (service.findOne) → cadena con .lean()
    // - await findOne(...) (service.update) → Query thenable que resuelve al doc
    // El mock reproduce ese contrato: objeto thenable CON .lean().
    findOne: mock.fn((_filter?: Record<string, unknown>) => {
      const chain = {
        lean: () => Promise.resolve(state.findOneResult),
        then: (
          onFulfilled?: (value: unknown) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) => Promise.resolve(state.findOneResult).then(onFulfilled, onRejected),
      };
      return chain;
    }),
    findOneAndUpdate: mock.fn(
      (_filter?: Record<string, unknown>, _update?: Record<string, unknown>) => {
        const chain = {
          lean: mock.fn(() => Promise.resolve(state.findOneAndUpdateResult)),
        };
        return chain;
      },
    ),
    findByIdAndUpdate: mock.fn(
      (_id?: string, _update?: Record<string, unknown>, _opts?: Record<string, unknown>) => {
        const chain = {
          lean: mock.fn(() => Promise.resolve(state.findByIdAndUpdateResult)),
        };
        return chain;
      },
    ),
    countDocuments: mock.fn((_filter?: Record<string, unknown>) => Promise.resolve(0)),
  };

  return { model, state };
}

/** Mock del EmployeesService (node:test mock.fn). */
function createEmployeesServiceMock() {
  return {
    findOne: mock.fn(async (..._args: unknown[]) => null as unknown),
  };
}

/**
 * Mock del modelo Employee (FASE 30G): el service ya no resuelve
 * mongoose.model('Employee') global; el modelo se inyecta (patrón estándar
 * del proyecto) y el mock configura su countDocuments por test.
 */
function createEmployeeModelMock() {
  const state = {
    /** Resultado del siguiente countDocuments() del modelo Employee. */
    workerCount: 0,
  };
  const model = {
    countDocuments: mock.fn((_filter?: Record<string, unknown>) =>
      Promise.resolve(state.workerCount),
    ),
  };
  return { model, state };
}

function buildService() {
  const custody = createModelMock();
  const employees = createEmployeesServiceMock();
  const employeeModel = createEmployeeModelMock();
  const service = new OccupationalMedicalRecordCustodyService(
    custody.model as never,
    employees as never,
    employeeModel.model as never,
  );
  return { service, custody, employees, employeeModel };
}

function validCreateDto(overrides: Partial<CreateOccupationalMedicalRecordCustodyDto> = {}): CreateOccupationalMedicalRecordCustodyDto {
  return {
    employeeId,
    recordReference: 'EXP-2024-001',
    recordType: RecordType.INITIAL_OCCUPATIONAL_EXAM,
    custodyStatus: CustodyStatus.IN_CUSTODY,
    custodianName: 'Juan Pérez',
    custodianRole: 'Archivista SST',
    custodyStartDate: '2024-01-15T00:00:00.000Z',
    retentionUntil: '2034-01-15T00:00:00.000Z',
    storageLocationReference: 'OFICINA-SST-3ER-PISO',
    accessControlDescription: 'Acceso restringido a personal autorizado',
    confidentialityConfirmed: true,
    integrityConfirmed: true,
    availabilityConfirmed: true,
    notes: 'Expediente físico en archivador SST',
    active: true,
    ...overrides,
  } as CreateOccupationalMedicalRecordCustodyDto;
}

describe('OccupationalMedicalRecordCustodyService (3.1.5 — FASE 30F/30G)', () => {
  let service: OccupationalMedicalRecordCustodyService;
  let custody: ReturnType<typeof createModelMock>;
  let employees: ReturnType<typeof createEmployeesServiceMock>;
  let employeeModel: ReturnType<typeof createEmployeeModelMock>;

  beforeEach(() => {
    ({ service, custody, employees, employeeModel } = buildService());
  });

  // ───────────────────────────────────────────────────────────────────────────
  // CRUD-001: create
  // ───────────────────────────────────────────────────────────────────────────
  describe('CRUD-001: create valid custody', () => {
    it('debe crear un registro de custodia válido', async () => {
      employees.findOne.mock.mockImplementation(async () => ({ _id: employeeId, companyId }));

      const dto = validCreateDto();
      const result = await service.create(companyId, dto, 'user-123');

      assert.ok(result);
      const created = custody.state.created[0];
      assert.equal(String(created.recordReference), 'EXP-2024-001');
      assert.equal(String(created.custodianName), 'Juan Pérez');
      assert.equal(created.confidentialityConfirmed, true);
      assert.equal(created.integrityConfirmed, true);
      assert.equal(created.availabilityConfirmed, true);
      // Tenant: companyId SIEMPRE del argumento (sesión), nunca del DTO.
      assert.equal((created.companyId as Types.ObjectId).toHexString(), companyId);
      assert.equal((created.employeeId as Types.ObjectId).toHexString(), employeeId);
      assert.equal(created.createdBy, 'user-123');
    });

    it('debe rechazar si el employee no pertenece al tenant (cross-tenant)', async () => {
      // EmployeesService.findOne scoping por tenant → empleado externo = null.
      employees.findOne.mock.mockImplementation(async () => null);

      await assert.rejects(
        () => service.create(companyId, validCreateDto(), 'user-123'),
        /Employee.*no existe o no pertenece/,
      );
    });

    it('debe rechazar si retentionUntil < custodyStartDate', async () => {
      employees.findOne.mock.mockImplementation(async () => ({ _id: employeeId, companyId }));

      const invalidDto = validCreateDto({ retentionUntil: '2020-01-01T00:00:00.000Z' });

      await assert.rejects(
        () => service.create(companyId, invalidDto, 'user-123'),
        /retentionUntil.*no puede ser anterior/,
      );
    });

    it('ignora cualquier companyId enviado en el DTO (derive de sesión)', async () => {
      employees.findOne.mock.mockImplementation(async () => ({ _id: employeeId, companyId }));

      // Intento de falsificación: el DTO lleva un companyId foráneo extra.
      const forged = validCreateDto() as CreateOccupationalMedicalRecordCustodyDto & {
        companyId?: string;
      };
      forged.companyId = otherCompanyId;

      await service.create(companyId, forged, 'user-123');

      const created = custody.state.created[0];
      assert.equal((created.companyId as Types.ObjectId).toHexString(), companyId);
      assert.notEqual(String(created.companyId), otherCompanyId);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // CRUD-002: findAll
  // ───────────────────────────────────────────────────────────────────────────
  describe('CRUD-002: list tenant records', () => {
    it('debe listar registros del tenant filtrando por companyId', async () => {
      custody.state.findResults = [
        { _id: new Types.ObjectId(), companyId: new Types.ObjectId(companyId) },
      ];

      const result = await service.findAll(companyId);

      assert.ok(Array.isArray(result));
      assert.equal(result.length, 1);
      const filter = custody.model.find.mock.calls[0].arguments[0] as Record<string, unknown>;
      assert.equal((filter.companyId as Types.ObjectId).toHexString(), companyId);
    });

    it('debe filtrar por employeeId y estado activo por defecto', async () => {
      await service.findAll(companyId, { employeeId, active: true });

      const filter = custody.model.find.mock.calls[0].arguments[0] as Record<string, unknown>;
      assert.equal((filter.companyId as Types.ObjectId).toHexString(), companyId);
      assert.equal((filter.employeeId as Types.ObjectId).toHexString(), employeeId);
      assert.equal(filter.active, true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // CRUD-003: findOne tenant-safe
  // ───────────────────────────────────────────────────────────────────────────
  describe('CRUD-003: findOne tenant-safe', () => {
    it('debe encontrar un registro del tenant', async () => {
      custody.state.findOneResult = { _id: new Types.ObjectId(recordIdHex), companyId: new Types.ObjectId(companyId) };

      const result = await service.findOne(companyId, recordIdHex);

      assert.ok(result);
      const filter = custody.model.findOne.mock.calls[0].arguments[0] as Record<string, unknown>;
      assert.equal((filter.companyId as Types.ObjectId).toHexString(), companyId);
      assert.equal(String(filter._id), recordIdHex);
    });

    it('debe retornar null si el registro no pertenece al tenant (cross-tenant)', async () => {
      // El service filtra por _id + companyId: un registro de otro tenant no matchea.
      custody.state.findOneResult = null;

      const result = await service.findOne(companyId, recordIdHex);

      assert.equal(result, null);
      const filter = custody.model.findOne.mock.calls[0].arguments[0] as Record<string, unknown>;
      assert.equal((filter.companyId as Types.ObjectId).toHexString(), companyId);
    });

    it('debe retornar null para ID inválido', async () => {
      const result = await service.findOne(companyId, 'invalid-id');
      assert.equal(result, null);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // CRUD-004: update
  // ───────────────────────────────────────────────────────────────────────────
  describe('CRUD-004: update valid custody', () => {
    it('debe actualizar un registro del tenant', async () => {
      custody.state.findOneResult = {
        _id: new Types.ObjectId(recordIdHex),
        companyId: new Types.ObjectId(companyId),
        custodyStartDate: new Date('2024-01-15'),
      };
      custody.state.findByIdAndUpdateResult = {
        _id: new Types.ObjectId(recordIdHex),
        custodianName: 'Nuevo Custodio',
      };

      const updateDto: UpdateOccupationalMedicalRecordCustodyDto = {
        custodianName: 'Nuevo Custodio',
      };

      const result = await service.update(companyId, recordIdHex, updateDto, 'user-123');

      assert.ok(result);
      // La verificación de pertenencia usa _id + companyId.
      const existenceFilter = custody.model.findOne.mock.calls[0].arguments[0] as Record<string, unknown>;
      assert.equal((existenceFilter.companyId as Types.ObjectId).toHexString(), companyId);
    });

    it('debe rechazar si el nuevo employeeId no pertenece al tenant', async () => {
      custody.state.findOneResult = {
        _id: new Types.ObjectId(recordIdHex),
        companyId: new Types.ObjectId(companyId),
        custodyStartDate: new Date('2024-01-15'),
      };
      employees.findOne.mock.mockImplementation(async () => null);

      const updateDto: UpdateOccupationalMedicalRecordCustodyDto = {
        employeeId: otherEmployeeId,
      };

      await assert.rejects(
        () => service.update(companyId, recordIdHex, updateDto, 'user-123'),
        /Employee.*no existe o no pertenece/,
      );
    });

    it('debe retornar null si el registro no existe', async () => {
      custody.state.findOneResult = null;

      const updateDto: UpdateOccupationalMedicalRecordCustodyDto = {
        custodianName: 'Nuevo Custodio',
      };

      const result = await service.update(companyId, recordIdHex, updateDto, 'user-123');

      assert.equal(result, null);
    });

    it('debe rechazar retentionUntil anterior a custodyStartDate existente', async () => {
      custody.state.findOneResult = {
        _id: new Types.ObjectId(recordIdHex),
        companyId: new Types.ObjectId(companyId),
        custodyStartDate: new Date('2024-01-15'),
      };

      const updateDto: UpdateOccupationalMedicalRecordCustodyDto = {
        retentionUntil: '2020-01-01T00:00:00.000Z',
      };

      await assert.rejects(
        () => service.update(companyId, recordIdHex, updateDto, 'user-123'),
        /retentionUntil.*no puede ser anterior/,
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // CRUD-005: deactivate
  // ───────────────────────────────────────────────────────────────────────────
  describe('CRUD-005: deactivate', () => {
    it('debe desactivar (borrado lógico) un registro del tenant', async () => {
      custody.state.findOneAndUpdateResult = {
        _id: new Types.ObjectId(recordIdHex),
        active: false,
      };

      const result = await service.deactivate(companyId, recordIdHex, 'user-123');

      assert.ok(result);
      assert.equal(result!.active, false);
      const [filter, update] = custody.model.findOneAndUpdate.mock.calls[0].arguments as [
        Record<string, unknown>,
        Record<string, unknown>,
      ];
      assert.equal((filter.companyId as Types.ObjectId).toHexString(), companyId);
      assert.equal(update.active, false);
    });

    it('debe retornar null si el registro no existe', async () => {
      custody.state.findOneAndUpdateResult = null;

      const result = await service.deactivate(companyId, recordIdHex, 'user-123');

      assert.equal(result, null);
    });

    it('debe retornar null para ID inválido', async () => {
      const result = await service.deactivate(companyId, 'invalid-id', 'user-123');
      assert.equal(result, null);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // TENANT-001..004: aislamiento cross-tenant
  // ───────────────────────────────────────────────────────────────────────────
  describe('TENANT: aislamiento cross-tenant', () => {
    it('TENANT-001: no debe poder leer registros de otro tenant', async () => {
      custody.state.findOneResult = null; // filtro _id + companyId no matchea

      const result = await service.findOne(companyId, recordIdHex);

      assert.equal(result, null);
    });

    it('TENANT-002: no debe poder crear custodia para employee de otro tenant', async () => {
      employees.findOne.mock.mockImplementation(async () => null);

      await assert.rejects(
        () => service.create(companyId, validCreateDto(), 'user-123'),
        /Employee.*no existe o no pertenece/,
      );
    });

    it('TENANT-003: no debe poder actualizar registro de otro tenant', async () => {
      custody.state.findOneResult = null;

      const updateDto: UpdateOccupationalMedicalRecordCustodyDto = {
        custodianName: 'Nuevo Custodio',
      };

      const result = await service.update(companyId, recordIdHex, updateDto, 'user-123');

      assert.equal(result, null);
    });

    it('TENANT-004: no debe poder desactivar registro de otro tenant', async () => {
      custody.state.findOneAndUpdateResult = null;

      const result = await service.deactivate(companyId, recordIdHex, 'user-123');

      assert.equal(result, null);
    });

    it('TENANT-005: getValidCustodyRecords siempre filtra por companyId', async () => {
      custody.state.findResults = [];

      await service.getValidCustodyRecords(companyId);

      const filter = custody.model.find.mock.calls[0].arguments[0] as Record<string, unknown>;
      assert.equal((filter.companyId as Types.ObjectId).toHexString(), companyId);
      assert.equal(filter.active, true);
      assert.equal(filter.custodyStatus, CustodyStatus.IN_CUSTODY);
    });

    it('TENANT-006: countWorkersWithValidCustody siempre filtra por companyId', async () => {
      employeeModel.state.workerCount = 7;

      const result = await service.countWorkersWithValidCustody(companyId);

      // El conteo de trabajadores sale del modelo Employee inyectado y filtrado por tenant.
      assert.equal(result.totalWorkers, 7);
      const employeeFilter = employeeModel.model.countDocuments.mock.calls[0].arguments[0] as Record<string, unknown>;
      assert.equal((employeeFilter.companyId as Types.ObjectId).toHexString(), companyId);

      const filter = custody.model.countDocuments.mock.calls[0].arguments[0] as Record<string, unknown>;
      assert.equal((filter.companyId as Types.ObjectId).toHexString(), companyId);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SMOKE: el schema no admite contenido clínico en su contrato público
  // ───────────────────────────────────────────────────────────────────────────
  it('el schema de custodia no expone campos clínicos', () => {
    const clinicalFields = [
      'diagnosis', 'symptoms', 'labResults', 'examResults',
      'medicalConcept', 'treatment', 'medication', 'disease',
      'clinicalImages', 'medicalHistory',
    ];
    const proto = OccupationalMedicalRecordCustody.prototype as unknown as Record<string, unknown>;
    for (const field of clinicalFields) {
      assert.equal(field in proto, false, `campo clínico inesperado: ${field}`);
    }
  });
});
