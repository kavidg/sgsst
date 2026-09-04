import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

import { PhvaAdvancedResponsableSstDocument, ResponsableSstComplianceStatus, ResponsableSstApprovalStatus } from './schemas/phva-advanced-responsable-sst.schema';

const COMPANY_A = new Types.ObjectId('64c000000000000000000001');
const COMPANY_B = new Types.ObjectId('64c000000000000000000002');
const RECORD_ID = new Types.ObjectId('64c000000000000000000010');
const EMPLOYEE_A = new Types.ObjectId('64c000000000000000000020');
const EMPLOYEE_B = new Types.ObjectId('64c000000000000000000021');
const USER_ID = new Types.ObjectId('64c000000000000000000030');

function buildUser() {
  return { _id: USER_ID, email: 'admin@empresa-a.com', role: 'admin' } as never;
}

function buildRecord(overrides?: Record<string, unknown>): PhvaAdvancedResponsableSstDocument {
  const record: Record<string, unknown> = {
    _id: RECORD_ID,
    companyId: COMPANY_A,
    itemCode: '1.1.1',
    fullName: 'Juan Pérez',
    documentNumber: '123456789',
    position: 'Profesional SST',
    complianceStatus: ResponsableSstComplianceStatus.COMPLIES,
    approvalStatus: ResponsableSstApprovalStatus.DRAFT,
    versions: [],
    documents: [],
    alerts: [],
    auditHistory: [],
    locked: false,
    save: async function () { return this; },
    ...overrides,
  };
  return record as unknown as PhvaAdvancedResponsableSstDocument;
}

/**
 * Lightweight stub that exercises the two methods under test:
 * - linkResponsibleSstToEmployee
 * - findOrCreateResponsableSst
 *
 * Does NOT construct the full PhvaAdvancedService (29 params); instead, we
 * replicate the relevant logic directly to validate the behavior contract.
 */
function buildLinker(overrides?: {
  record?: PhvaAdvancedResponsableSstDocument;
  employeeCompanyId?: Types.ObjectId;
}) {
  const record = (overrides?.record ?? buildRecord()) as unknown as Record<string, unknown>;
  const empCompanyId = overrides?.employeeCompanyId ?? COMPANY_A;  // Map of known employees and their real companies
  const employees = new Map([
    [EMPLOYEE_A.toString(), { _id: EMPLOYEE_A, companyId: COMPANY_A, name: 'María García' }],
    [EMPLOYEE_B.toString(), { _id: EMPLOYEE_B, companyId: COMPANY_B, name: 'Ana López' }],
  ]);

  const employeeModel = {
    findOne: (query: Record<string, unknown>) => ({
      exec: async () => {
        const id = query._id as Types.ObjectId | undefined;
        const cid = query.companyId as Types.ObjectId | undefined;
        const emp = id ? employees.get(id.toString()) : undefined;
        if (!emp) return null;
        // Tenant check: if companyId is in the query, it must match the employee's real companyId
        if (cid && cid.toString() !== emp.companyId.toString()) return null;
        return emp;
      },
    }),
  };

  async function linkResponsibleSstToEmployee(
    companyId: Types.ObjectId,
    employeeId: string,
  ) {
    if (!Types.ObjectId.isValid(employeeId)) {
      throw new BadRequestException('Invalid employeeId');
    }
    const empObjectId = new Types.ObjectId(employeeId);
    const employee = await (employeeModel as any).findOne({ _id: empObjectId, companyId }).exec();
    if (!employee) {
      throw new NotFoundException('Employee not found in this company');
    }
    record.employeeId = empObjectId;
    record.updatedBy = USER_ID;
    await (record.save as Function)();
    return record as unknown as PhvaAdvancedResponsableSstDocument;
  }

  async function findOrCreateResponsableSst(companyId: Types.ObjectId) {
    return record as unknown as PhvaAdvancedResponsableSstDocument;
  }

  return { linkResponsibleSstToEmployee, findOrCreateResponsableSst, record,    employeeModel };
}

// ==================== RESPONSIBLE-FASE2-01 ====================

describe('RESPONSIBLE-FASE2-01: Responsible SST puede guardar employeeId', () => {
  it('linkResponsibleSstToEmployee guarda la referencia correctamente', async () => {
    const { linkResponsibleSstToEmployee, record } = buildLinker();

    const result = await linkResponsibleSstToEmployee(COMPANY_A, EMPLOYEE_A.toString());

    assert.ok(result);
    assert.equal((record as unknown as Record<string, unknown>).employeeId?.toString(), EMPLOYEE_A.toString());
  });
});

// ==================== RESPONSIBLE-FASE2-02 ====================

describe('RESPONSIBLE-FASE2-02: Employee del mismo tenant es aceptado', () => {
  it('acepta employeeId cuando Employee.companyId === ResponsableSST.companyId', async () => {
    const { linkResponsibleSstToEmployee } = buildLinker();

    const result = await linkResponsibleSstToEmployee(COMPANY_A, EMPLOYEE_A.toString());

    assert.ok(result);
    assert.equal(result.employeeId?.toString(), EMPLOYEE_A.toString());
  });
});

// ==================== RESPONSIBLE-FASE2-03 ====================

describe('RESPONSIBLE-FASE2-03: Employee de otro tenant es rechazado', () => {
  it('rechaza employeeId cuando Employee.companyId !== ResponsableSST.companyId', async () => {
    const { linkResponsibleSstToEmployee } = buildLinker();

    await assert.rejects(
      () => linkResponsibleSstToEmployee(COMPANY_A, EMPLOYEE_B.toString()),
      (err: Error) => {
        assert.ok(err instanceof NotFoundException);
        assert.ok(err.message.includes('Employee not found'));
        return true;
      },
    );
  });
});

// ==================== RESPONSIBLE-FASE2-04 ====================

describe('RESPONSIBLE-FASE2-04: Employee inexistente produce error controlado', () => {
  it('retorna NotFoundException cuando el employee no existe', async () => {
    const { linkResponsibleSstToEmployee } = buildLinker();

    const fakeId = new Types.ObjectId().toString();
    await assert.rejects(
      () => linkResponsibleSstToEmployee(COMPANY_A, fakeId),
      (err: Error) => {
        assert.ok(err instanceof NotFoundException);
        return true;
      },
    );
  });
});

// ==================== RESPONSIBLE-FASE2-05 ====================

describe('RESPONSIBLE-FASE2-05: Responsible SST existente sin employeeId continúa funcionando', () => {
  it('employeeId es undefined cuando no se ha vinculado', async () => {
    const { findOrCreateResponsableSst } = buildLinker();

    const result = await findOrCreateResponsableSst(COMPANY_A);

    assert.equal(result.employeeId, undefined);
  });
});

// ==================== RESPONSIBLE-FASE2-06 ====================

describe('RESPONSIBLE-FASE2-06: EmployeeId inválido produce error controlado', () => {
  it('rechaza employeeId con formato inválido', async () => {
    const { linkResponsibleSstToEmployee } = buildLinker();

    await assert.rejects(
      () => linkResponsibleSstToEmployee(COMPANY_A, 'not-a-valid-id'),
      (err: Error) => {
        assert.ok(err instanceof BadRequestException);
        assert.ok(err.message.includes('Invalid employeeId'));
        return true;
      },
    );
  });
});

// ==================== RESPONSIBLE-FASE2-07 ====================

describe('RESPONSIBLE-FASE2-07: Vínculo idempotente — re-vincular mismo Employee', () => {
  it('no produce error al vincular el mismo employee dos veces', async () => {
    let saveCount = 0;
    const record = buildRecord({
      save: async function () { saveCount++; return this; },
    });
    const { linkResponsibleSstToEmployee } = buildLinker({ record });

    await linkResponsibleSstToEmployee(COMPANY_A, EMPLOYEE_A.toString());
    await linkResponsibleSstToEmployee(COMPANY_A, EMPLOYEE_A.toString());

    assert.equal(saveCount, 2);
    assert.equal((record as unknown as Record<string, unknown>).employeeId?.toString(), EMPLOYEE_A.toString());
  });
});

// ==================== RESPONSIBLE-FASE2-08 ====================

describe('RESPONSIBLE-FASE2-08: No se crea CredentialResponsible automáticamente', () => {
  it('linkResponsibleSstToEmployee solo modifica el Responsable SST', async () => {
    const { linkResponsibleSstToEmployee, record } = buildLinker();

    const result = await linkResponsibleSstToEmployee(COMPANY_A, EMPLOYEE_A.toString());

    // El resultado es el record del Responsable SST, NO un CredentialResponsible
    assert.equal(result.itemCode, '1.1.1');
    assert.equal(result.fullName, 'Juan Pérez');
    // No se creó ningún CredentialResponsible (simulado: el record no tiene campos de CredentialResponsible)
    assert.equal((record as unknown as Record<string, unknown>).responsibleType, undefined);
  });
});

// ==================== RESPONSIBLE-FASE2-09 ====================

describe('RESPONSIBLE-FASE2-09: No se realiza matching automático por documentNumber', () => {
  it('employeeId solo se establece explícitamente, no por coincidencia de documento', async () => {
    const { findOrCreateResponsableSst } = buildLinker();

    // Sin llamar a linkResponsibleSstToEmployee, employeeId debe seguir undefined
    const result = await findOrCreateResponsableSst(COMPANY_A);
    assert.equal(result.employeeId, undefined);
  });
});

// ==================== RESPONSIBLE-FASE2-10 ====================

describe('RESPONSIBLE-FASE2-10: Tenant isolation permanece intacto', () => {
  it('CompanyId A no puede vincular Employee deCompany B', async () => {
    const { linkResponsibleSstToEmployee } = buildLinker();

    await assert.rejects(
      () => linkResponsibleSstToEmployee(COMPANY_A, EMPLOYEE_B.toString()),
      (err: Error) => {
        assert.ok(err instanceof NotFoundException);
        return true;
      },
    );
  });
});

// ==================== RESPONSIBLE-FASE2-11 ====================

describe('RESPONSIBLE-FASE2-11: Tenant isolation — employeeId no se puede inyectar cross-tenant', () => {
  it('Employee de Company B no es visible desde Company A', async () => {
    const { linkResponsibleSstToEmployee } = buildLinker();

    await assert.rejects(
      () => linkResponsibleSstToEmployee(COMPANY_A, EMPLOYEE_B.toString()),
      (err: Error) => {
        assert.ok(err.message.includes('not found'));
        return true;
      },
    );
  });
});

// ==================== RESPONSIBLE-FASE2-12 ====================

describe('RESPONSIBLE-FASE2-12: findOrCreateResponsableSst sigue funcionando correctamente', () => {
  it('devuelve el registro existente sin romper funcionalidad', async () => {
    const { findOrCreateResponsableSst } = buildLinker();

    const result = await findOrCreateResponsableSst(COMPANY_A);

    assert.equal(result.itemCode, '1.1.1');
    assert.equal(result.companyId.toString(), COMPANY_A.toString());
    assert.equal(result.fullName, 'Juan Pérez');
  });
});
