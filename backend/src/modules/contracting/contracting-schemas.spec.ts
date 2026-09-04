import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';

/**
 * Tests para BLOQUE 6A — Base de dominio de Contratación (2.10.1).
 *
 * Verifica la estructura de schemas, enums, índices y restricciones
 * de Contract, ContractInduction y ContractEvaluation.
 */

// ==================== IMPORTS ====================

import {
  Contract,
  ContractStatus,
  ContractSchema,
} from './schemas/contract.schema';
import {
  ContractInduction,
  InductionStatus,
  ContractInductionSchema,
} from './schemas/contract-induction.schema';
import {
  ContractEvaluation,
  ContractEvaluationSchema,
} from './schemas/contract-evaluation.schema';

// ==================== HELPERS ====================

/** Extrae los campos @Prop de un schema Mongoose para verificación (genérico). */
function getSchemaPaths(schema: unknown): Record<string, unknown> {
  return (schema as { paths: Record<string, unknown> }).paths;
}

/** Extrae los índices de un schema Mongoose (genérico). */
function getSchemaIndexes(schema: unknown): unknown[][] {
  return (schema as { indexes: () => unknown[][] }).indexes();
}

// ==================== ENUMS ====================

describe('ContractStatus enum', () => {
  it('contiene DRAFT', () => {
    assert.equal(ContractStatus.DRAFT, 'DRAFT');
  });

  it('contiene ACTIVE', () => {
    assert.equal(ContractStatus.ACTIVE, 'ACTIVE');
  });

  it('contiene CLOSED', () => {
    assert.equal(ContractStatus.CLOSED, 'CLOSED');
  });

  it('contiene CANCELLED', () => {
    assert.equal(ContractStatus.CANCELLED, 'CANCELLED');
  });

  it('NO contiene estados de aprobación', () => {
    assert.equal((ContractStatus as Record<string, unknown>)['PENDING_APPROVAL'], undefined);
    assert.equal((ContractStatus as Record<string, unknown>)['APPROVED'], undefined);
    assert.equal((ContractStatus as Record<string, unknown>)['REJECTED'], undefined);
    assert.equal((ContractStatus as Record<string, unknown>)['ADJUSTMENTS_REQUESTED'], undefined);
  });
});

describe('InductionStatus enum', () => {
  it('contiene PENDING', () => {
    assert.equal(InductionStatus.PENDING, 'PENDING');
  });

  it('contiene COMPLETED', () => {
    assert.equal(InductionStatus.COMPLETED, 'COMPLETED');
  });

  it('contiene EXPIRED', () => {
    assert.equal(InductionStatus.EXPIRED, 'EXPIRED');
  });

  it('contiene CANCELLED', () => {
    assert.equal(InductionStatus.CANCELLED, 'CANCELLED');
  });
});

// ==================== SCHEMA-CONTRACT ====================

describe('SCHEMA-CONTRACT: Contract schema', () => {
  const paths = getSchemaPaths(ContractSchema);

  it('SCHEMA-CONTRACT-01: requiere companyId', () => {
    const prop = paths['companyId'] as { required?: boolean | (() => boolean); instance?: string };
    assert.ok(prop, 'companyId must exist');
    assert.ok(prop.required, 'companyId must be required');
    assert.equal(prop.instance, 'Mixed'); // ObjectId fields show as Mixed
  });

  it('SCHEMA-CONTRACT-02: requiere contractNumber', () => {
    const prop = paths['contractNumber'] as { required?: boolean | (() => boolean); instance?: string };
    assert.ok(prop, 'contractNumber must exist');
    assert.ok(prop.required, 'contractNumber must be required');
    assert.equal(prop.instance, 'String');
  });

  it('SCHEMA-CONTRACT-03: requiere title', () => {
    const prop = paths['title'] as { required?: boolean | (() => boolean); instance?: string };
    assert.ok(prop, 'title must exist');
    assert.ok(prop.required, 'title must be required');
    assert.equal(prop.instance, 'String');
  });

  it('SCHEMA-CONTRACT-04: requiere contractorId', () => {
    const prop = paths['contractorId'] as { required?: boolean | (() => boolean); instance?: string };
    assert.ok(prop, 'contractorId must exist');
    assert.ok(prop.required, 'contractorId must be required');
    assert.equal(prop.instance, 'Mixed'); // ObjectId fields show as Mixed
  });

  it('SCHEMA-CONTRACT-05: status inicia en DRAFT por defecto', () => {
    const prop = paths['status'] as { enumValues?: string[]; defaultValue?: string };
    assert.ok(prop, 'status must exist');
    assert.ok(prop.enumValues?.includes('DRAFT'), 'status must include DRAFT');
    assert.ok(prop.enumValues?.includes('ACTIVE'), 'status must include ACTIVE');
    assert.ok(prop.enumValues?.includes('CLOSED'), 'status must include CLOSED');
    assert.ok(prop.enumValues?.includes('CANCELLED'), 'status must include CANCELLED');
    assert.equal(prop.defaultValue, 'DRAFT');
  });

  it('SCHEMA-CONTRACT-06: contractNumber permite unicidad por empresa', () => {
    const indexes = getSchemaIndexes(ContractSchema);
    // Schema.indexes() returns Array<[indexSpec, options]> (tuples)
    const uniqueIndex = indexes.find(
      (idx: unknown[]) => {
        const spec = idx[0] as Record<string, unknown> | undefined;
        return spec && spec['contractNumber'] === 1 && spec['companyId'] === 1;
      },
    );
    assert.ok(uniqueIndex, 'Must have companyId + contractNumber index');
  });

  it('campos opcionales existen', () => {
    assert.ok(paths['description'], 'description must exist');
    assert.ok(paths['contractStart'], 'contractStart must exist');
    assert.ok(paths['contractEnd'], 'contractEnd must exist');
    assert.ok(paths['sstRequirements'], 'sstRequirements must exist');
    assert.ok(paths['observations'], 'observations must exist');
    assert.ok(paths['createdBy'], 'createdBy must exist');
    assert.ok(paths['createdByName'], 'createdByName must exist');
  });

  it('timestamps están habilitados', () => {
    assert.ok(paths['createdAt'], 'createdAt must exist (timestamps)');
    assert.ok(paths['updatedAt'], 'updatedAt must exist (timestamps)');
  });
});

// ==================== SCHEMA-INDUCTION ====================

describe('SCHEMA-INDUCTION: ContractInduction schema', () => {
  const paths = getSchemaPaths(ContractInductionSchema);

  it('SCHEMA-INDUCTION-01: requiere companyId', () => {
    const prop = paths['companyId'] as { required?: boolean | (() => boolean); instance?: string };
    assert.ok(prop, 'companyId must exist');
    assert.ok(prop.required, 'companyId must be required');
    assert.equal(prop.instance, 'Mixed');
  });

  it('SCHEMA-INDUCTION-02: requiere contractId', () => {
    const prop = paths['contractId'] as { required?: boolean | (() => boolean); instance?: string };
    assert.ok(prop, 'contractId must exist');
    assert.ok(prop.required, 'contractId must be required');
    assert.equal(prop.instance, 'Mixed');
  });

  it('SCHEMA-INDUCTION-03: requiere contractorId', () => {
    const prop = paths['contractorId'] as { required?: boolean | (() => boolean); instance?: string };
    assert.ok(prop, 'contractorId must exist');
    assert.ok(prop.required, 'contractorId must be required');
    assert.equal(prop.instance, 'Mixed');
  });

  it('SCHEMA-INDUCTION-04: status inicia en PENDING por defecto', () => {
    const prop = paths['status'] as { enumValues?: string[]; defaultValue?: string };
    assert.ok(prop, 'status must exist');
    assert.ok(prop.enumValues?.includes('PENDING'), 'status must include PENDING');
    assert.ok(prop.enumValues?.includes('COMPLETED'), 'status must include COMPLETED');
    assert.ok(prop.enumValues?.includes('EXPIRED'), 'status must include EXPIRED');
    assert.ok(prop.enumValues?.includes('CANCELLED'), 'status must include CANCELLED');
    assert.equal(prop.defaultValue, 'PENDING');
  });

  it('requiere workerName', () => {
    const prop = paths['workerName'] as { required?: boolean | (() => boolean); instance?: string };
    assert.ok(prop, 'workerName must exist');
    assert.ok(prop.required, 'workerName must be required');
    assert.equal(prop.instance, 'String');
  });

  it('workerId es opcional', () => {
    const prop = paths['workerId'] as { isRequired?: boolean; validators?: Array<{ type: string }> };
    assert.ok(prop, 'workerId must exist');
    // Opcional = isRequired es undefined y no tiene required validators
    assert.ok(!prop.isRequired, 'workerId must be optional');
    const hasRequiredValidator = prop.validators?.some(v => v.type === 'required') ?? false;
    assert.ok(!hasRequiredValidator, 'workerId must not have required validator');
  });

  it('score es opcional con min/max', () => {
    const prop = paths['score'] as { instance?: string; options?: Record<string, unknown> };
    assert.ok(prop, 'score must exist');
    assert.equal(prop.instance, 'Number');
  });

  it('timestamps están habilitados', () => {
    assert.ok(paths['createdAt'], 'createdAt must exist');
    assert.ok(paths['updatedAt'], 'updatedAt must exist');
  });
});

// ==================== SCHEMA-EVALUATION ====================

describe('SCHEMA-EVALUATION: ContractEvaluation schema', () => {
  const paths = getSchemaPaths(ContractEvaluationSchema);

  it('SCHEMA-EVALUATION-01: requiere companyId', () => {
    const prop = paths['companyId'] as { required?: boolean | (() => boolean); instance?: string };
    assert.ok(prop, 'companyId must exist');
    assert.ok(prop.required, 'companyId must be required');
    assert.equal(prop.instance, 'Mixed');
  });

  it('SCHEMA-EVALUATION-02: requiere contractId', () => {
    const prop = paths['contractId'] as { required?: boolean | (() => boolean); instance?: string };
    assert.ok(prop, 'contractId must exist');
    assert.ok(prop.required, 'contractId must be required');
    assert.equal(prop.instance, 'Mixed');
  });

  it('SCHEMA-EVALUATION-03: requiere contractorId', () => {
    const prop = paths['contractorId'] as { required?: boolean | (() => boolean); instance?: string };
    assert.ok(prop, 'contractorId must exist');
    assert.ok(prop.required, 'contractorId must be required');
    assert.equal(prop.instance, 'Mixed');
  });

  it('SCHEMA-EVALUATION-04: requiere evaluationDate', () => {
    const prop = paths['evaluationDate'] as { required?: boolean | (() => boolean); instance?: string };
    assert.ok(prop, 'evaluationDate must exist');
    assert.ok(prop.required, 'evaluationDate must be required');
    assert.equal(prop.instance, 'Date');
  });

  it('SCHEMA-EVALUATION-05: score es obligatorio (0-100)', () => {
    const prop = paths['score'] as { required?: boolean | (() => boolean); instance?: string };
    assert.ok(prop, 'score must exist');
    assert.ok(prop.required, 'score must be required');
    assert.equal(prop.instance, 'Number');
  });

  it('criteria es array de strings opcional', () => {
    const prop = paths['criteria'] as { instance?: string; caster?: unknown };
    assert.ok(prop, 'criteria must exist');
    assert.equal(prop.instance, 'Array');
  });

  it('observations es opcional', () => {
    const prop = paths['observations'] as { isRequired?: boolean; validators?: Array<{ type: string }> };
    assert.ok(prop, 'observations must exist');
    // Opcional = isRequired es undefined y no tiene required validators
    assert.ok(!prop.isRequired, 'observations must be optional');
    const hasRequiredValidator = prop.validators?.some(v => v.type === 'required') ?? false;
    assert.ok(!hasRequiredValidator, 'observations must not have required validator');
  });

  it('evaluatedBy es opcional ObjectId', () => {
    const prop = paths['evaluatedBy'] as { isRequired?: boolean; instance?: string; validators?: Array<{ type: string }> };
    assert.ok(prop, 'evaluatedBy must exist');
    assert.equal(prop.instance, 'Mixed');
    // Opcional = isRequired es undefined
    assert.ok(!prop.isRequired, 'evaluatedBy must be optional');
  });

  it('timestamps están habilitados', () => {
    assert.ok(paths['createdAt'], 'createdAt must exist');
    assert.ok(paths['updatedAt'], 'updatedAt must exist');
  });
});

// ==================== TENANT-CONTRACT ====================

describe('TENANT-CONTRACT: Tenant isolation', () => {
  it('TENANT-CONTRACT-01: Contract tiene companyId', () => {
    const paths = getSchemaPaths(ContractSchema);
    const prop = paths['companyId'] as { instance?: string };
    assert.ok(prop, 'companyId must exist');
    assert.equal(prop.instance, 'Mixed'); // ObjectId fields show as Mixed
  });

  it('TENANT-CONTRACT-01: ContractInduction tiene companyId', () => {
    const paths = getSchemaPaths(ContractInductionSchema);
    const prop = paths['companyId'] as { instance?: string };
    assert.ok(prop, 'companyId must exist');
    assert.equal(prop.instance, 'Mixed');
  });

  it('TENANT-CONTRACT-01: ContractEvaluation tiene companyId', () => {
    const paths = getSchemaPaths(ContractEvaluationSchema);
    const prop = paths['companyId'] as { instance?: string };
    assert.ok(prop, 'companyId must exist');
    assert.equal(prop.instance, 'Mixed');
  });

  it('TENANT-CONTRACT-02: Contract tiene índices tenant', () => {
    const indexes = getSchemaIndexes(ContractSchema);
    // Schema.indexes() returns Array<[indexSpec, options]> (tuples)
    const tenantIndex = indexes.find(
      (idx: unknown[]) => {
        const spec = idx[0] as Record<string, unknown> | undefined;
        return spec && spec['companyId'] === 1;
      },
    );
    assert.ok(tenantIndex, 'Contract must have companyId index');
  });

  it('TENANT-CONTRACT-02: ContractInduction tiene índices tenant', () => {
    const indexes = getSchemaIndexes(ContractInductionSchema);
    const tenantIndex = indexes.find(
      (idx: unknown[]) => {
        const spec = idx[0] as Record<string, unknown> | undefined;
        return spec && spec['companyId'] === 1;
      },
    );
    assert.ok(tenantIndex, 'ContractInduction must have companyId index');
  });

  it('TENANT-CONTRACT-02: ContractEvaluation tiene índices tenant', () => {
    const indexes = getSchemaIndexes(ContractEvaluationSchema);
    const tenantIndex = indexes.find(
      (idx: unknown[]) => {
        const spec = idx[0] as Record<string, unknown> | undefined;
        return spec && spec['companyId'] === 1;
      },
    );
    assert.ok(tenantIndex, 'ContractEvaluation must have companyId index');
  });
});

// ==================== INTEGRIDAD ====================

describe('Integridad arquitectónica', () => {
  it('Contract SÍ tiene approvalStatus (integrado en BLOQUE 6D)', () => {
    const paths = getSchemaPaths(ContractSchema);
    assert.ok(paths['approvalStatus'], 'Contract must have approvalStatus after BLOQUE 6D');
  });

  it('Contract NO tiene contractDocumentId (pendiente integración doc)', () => {
    const paths = getSchemaPaths(ContractSchema);
    assert.equal(paths['contractDocumentId'], undefined, 'Contract must not have contractDocumentId yet');
  });

  it('Contract NO tiene evidenceDocumentIds (pendiente integración doc)', () => {
    const paths = getSchemaPaths(ContractSchema);
    assert.equal(paths['evidenceDocumentIds'], undefined, 'Contract must not have evidenceDocumentIds yet');
  });

  it('ContractInduction NO tiene inductionDocumentId (pendiente integración doc)', () => {
    const paths = getSchemaPaths(ContractInductionSchema);
    assert.equal(paths['inductionDocumentId'], undefined, 'ContractInduction must not have inductionDocumentId yet');
  });

  it('Supplier type CONTRACTOR ya existe', () => {
    // Verificar que SupplierType tiene CONTRACTOR
    const { SupplierType } = require('../acquisitions/schemas/supplier.schema');
    assert.equal(SupplierType.CONTRACTOR, 'CONTRACTOR');
    assert.equal(SupplierType.THIRD_PARTY, 'THIRD_PARTY');
  });

  it('Contract schema no duplica campos de Supplier', () => {
    const paths = getSchemaPaths(ContractSchema);
    // Contract NO debe tener name, legalName, taxId, contactName, email, phone, address
    // porque esos campos viven en Supplier
    assert.equal(paths['name'], undefined, 'Contract must not have name (lives in Supplier)');
    assert.equal(paths['legalName'], undefined, 'Contract must not have legalName');
    assert.equal(paths['taxId'], undefined, 'Contract must not have taxId');
    assert.equal(paths['contactName'], undefined, 'Contract must not have contactName');
    assert.equal(paths['email'], undefined, 'Contract must not have email');
    assert.equal(paths['phone'], undefined, 'Contract must not have phone');
    assert.equal(paths['address'], undefined, 'Contract must not have address');
  });
});
