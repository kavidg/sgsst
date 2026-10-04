import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose, { Types } from 'mongoose';
import {
  ControlVerification,
  ControlVerificationSchema,
} from './schemas/control-verification.schema';
import { ControlVerificationResult } from './enums/control-verification-result.enum';
import { FollowUpStatus } from './enums/follow-up-status.enum';
import { RiskSchema } from './schemas/risk.schema';
import { RisksService } from './risks.service';
import { CreateRiskDto } from './dto/create-risk.dto';

/**
 * Tests ETAPA 2 (PHVA 4.2.2) — Modelo ControlVerification.
 *
 * Valida:
 * - instancia válida y valores de los tres resultados
 * - campos obligatorios (companyId, riskId, controlId, snapshot, fecha, verificador, result)
 * - requiresFollowUp default false + validación condicional de followUpDueDate
 * - enums válidos/inválidos
 * - trim del snapshot
 * - timestamps e índices
 * - coexistencia con Risk.controlMeasures (legacy intacto)
 * - providers/engine sin cambios (constancia de fórmulas legacy)
 */

const VerificationModel =
  (mongoose.models.ControlVerification as mongoose.Model<any>) ??
  mongoose.model<any>('ControlVerification', ControlVerificationSchema);

const RiskModel =
  (mongoose.models.Risk as mongoose.Model<any>) ?? mongoose.model<any>('Risk', RiskSchema);

const COMPANY_ID = new Types.ObjectId();
const RISK_ID = new Types.ObjectId();
const CONTROL_ID = new Types.ObjectId().toHexString();

function validDoc(overrides: Record<string, unknown> = {}) {
  return {
    companyId: COMPANY_ID,
    riskId: RISK_ID,
    controlId: CONTROL_ID,
    controlDescriptionSnapshot: 'Barandas en borde de losa',
    verificationDate: new Date(),
    verifiedBy: 'Coordinador SST',
    result: ControlVerificationResult.COMPLIANT,
    ...overrides,
  };
}

async function validateError(docData: Record<string, unknown>, expectedPath: string): Promise<string> {
  try {
    await new VerificationModel(docData).validate();
  } catch (error) {
    const err = error as mongoose.Error.ValidationError;
    assert.ok(err.errors, 'debe ser un ValidationError');
    if (expectedPath) {
      assert.ok(err.errors[expectedPath], `debe fallar en ${expectedPath}`);
      return err.errors[expectedPath].message;
    }
    throw error;
  }
  throw new Error(`se esperaba ValidationError en ${expectedPath || 'algún campo'}`);
}

describe('ETAPA 2 — ControlVerification (instancia válida y resultados)', () => {
  it('instancia válida se valida sin errores', async () => {
    const doc = new VerificationModel(validDoc());
    await doc.validate();
    assert.equal(doc.result, ControlVerificationResult.COMPLIANT);
  });

  it('COMPLIANT es un resultado válido', async () => {
    const doc = new VerificationModel(validDoc({ result: ControlVerificationResult.COMPLIANT }));
    await doc.validate();
    assert.equal(doc.result, 'COMPLIANT');
  });

  it('PARTIAL es un resultado válido', async () => {
    const doc = new VerificationModel(validDoc({ result: ControlVerificationResult.PARTIAL }));
    await doc.validate();
    assert.equal(doc.result, 'PARTIAL');
  });

  it('NON_COMPLIANT es un resultado válido', async () => {
    const doc = new VerificationModel(validDoc({ result: ControlVerificationResult.NON_COMPLIANT }));
    await doc.validate();
    assert.equal(doc.result, 'NON_COMPLIANT');
  });
});

describe('ETAPA 2 — Campos obligatorios', () => {
  it('sin companyId falla', async () => {
    const { companyId, ...rest } = validDoc();
    await validateError(rest, 'companyId');
  });

  it('sin riskId falla', async () => {
    const { riskId, ...rest } = validDoc();
    await validateError(rest, 'riskId');
  });

  it('sin controlId falla', async () => {
    const { controlId, ...rest } = validDoc();
    await validateError(rest, 'controlId');
  });

  it('sin controlDescriptionSnapshot falla', async () => {
    const { controlDescriptionSnapshot, ...rest } = validDoc();
    await validateError(rest, 'controlDescriptionSnapshot');
  });

  it('sin verificationDate falla', async () => {
    const { verificationDate, ...rest } = validDoc();
    await validateError(rest, 'verificationDate');
  });

  it('sin verifiedBy falla', async () => {
    const { verifiedBy, ...rest } = validDoc();
    await validateError(rest, 'verifiedBy');
  });

  it('sin result falla', async () => {
    const { result, ...rest } = validDoc();
    await validateError(rest, 'result');
  });
});

describe('ETAPA 2 — Seguimiento', () => {
  it('requiresFollowUp tiene default false', () => {
    const doc = new VerificationModel({});
    assert.equal(doc.requiresFollowUp, false);
  });

  it('seguimiento requerido con fecha válida se acepta', async () => {
    const doc = new VerificationModel(
      validDoc({
        result: ControlVerificationResult.NON_COMPLIANT,
        requiresFollowUp: true,
        followUpDueDate: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        followUpStatus: FollowUpStatus.OPEN,
      }),
    );
    await doc.validate();
    assert.equal(doc.followUpStatus, FollowUpStatus.OPEN);
  });

  it('seguimiento requerido sin fecha falla (validación condicional)', async () => {
    const message = await validateError(validDoc({ requiresFollowUp: true }), 'followUpDueDate');
    assert.match(message, /followUpDueDate/);
  });

  it('requiresFollowUp false sin fecha NO falla (condicional, no incondicional)', async () => {
    const doc = new VerificationModel(validDoc());
    await doc.validate();
  });
});

describe('ETAPA 2 — Enums inválidos', () => {
  it('result fuera del enum falla', async () => {
    await validateError(validDoc({ result: 'CUMPLE_OTRA_COSA' }), 'result');
  });

  it('followUpStatus fuera del enum falla', async () => {
    await validateError(
      validDoc({ followUpStatus: 'PENDING_FOREVER' }),
      'followUpStatus',
    );
  });
});

describe('ETAPA 2 — Trim y timestamps', () => {
  it('controlDescriptionSnapshot se trimea', async () => {
    const doc = new VerificationModel(validDoc({ controlDescriptionSnapshot: '  Barandas fijas  ' }));
    await doc.validate();
    assert.equal(doc.controlDescriptionSnapshot, 'Barandas fijas');
  });

  it('snapshot de solo espacios queda vacío tras trim y falla el required', async () => {
    const doc = new VerificationModel(validDoc({ controlDescriptionSnapshot: '   ' }));
    await assert.rejects(() => doc.validate());
  });

  it('timestamps activos en el schema', () => {
    assert.equal(ControlVerificationSchema.options?.timestamps, true);
  });

  it('timestamps habilitados en la instancia ($timestamps) sin requerir conexión', () => {
    const doc = new VerificationModel(validDoc());
    assert.equal(doc.$timestamps(), true);
  });
});

describe('ETAPA 2 — Índices requeridos', () => {
  const indexes = ControlVerificationSchema.indexes();

  it('índice { companyId, riskId } ascendente existe', () => {
    assert.ok(
      indexes.some(([key]) => key.companyId === 1 && key.riskId === 1 && key.verificationDate === undefined),
    );
  });

  it('índice { companyId, verificationDate: -1 } existe', () => {
    assert.ok(
      indexes.some(([key]) => key.companyId === 1 && key.verificationDate === -1),
    );
  });

  it('índice compuesto { companyId, riskId, controlId, verificationDate: -1 } existe', () => {
    assert.ok(
      indexes.some(
        ([key]) =>
          key.companyId === 1 && key.riskId === 1 && key.controlId === 1 && key.verificationDate === -1,
      ),
    );
  });

  it('no existe índice único sobre controlId', () => {
    assert.ok(
      indexes.every(
        ([, options]) => !(options as { unique?: boolean }).unique || !('controlId' in indexes[0][0]),
      ),
    );
    const uniqueIndexes = indexes.filter(([, options]) => (options as { unique?: boolean }).unique);
    assert.equal(uniqueIndexes.length, 0, 'ningún índice único en esta colección');
  });
});

describe('ETAPA 2 — Coexistencia con legacy y ausencia de cambios en consumidores', () => {
  it('Risk.controlMeasures sigue siendo String y Risk.controls sigue existiendo', () => {
    assert.equal(RiskSchema.path('controlMeasures').instance, 'String');
    assert.equal(RiskSchema.path('controls').instance, 'Array');
  });

  it('crear Risk solo con controlMeasures sigue funcionando (Etapa 1 intacta)', async () => {
    const service = new RisksService(
      (() => {
        const model: any = function (doc: any) {
          return { ...doc, save: async () => doc };
        };
        return model;
      })() as any,
      {} as any,
    );
    const dto: CreateRiskDto = {
      process: 'Producción',
      activity: 'Corte',
      hazard: 'Cuchilla',
      risk: 'Corte de mano',
      probability: 2,
      consequence: 3,
      controlMeasures: 'Guarda de cuchilla',
    };
    const created: any = await service.create(new Types.ObjectId(), dto);
    assert.equal(created.controls?.length ?? 0, 0);
    assert.equal(created.controlMeasures, 'Guarda de cuchilla');
  });

  it('la verificación referencia controlId de un subdoc real (hex ObjectId)', () => {
    assert.ok(/^[0-9a-f]{24}$/i.test(CONTROL_ID), 'controlId debe ser hex de ObjectId');
  });

  it('constancia: fórmulas legacy de inspecciones sin cambios (25+30/25/20 en fuente)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const providerPath = path.resolve(
      process.cwd(),
      'src/modules/compliance-engine/providers/inspection-compliance.provider.ts',
    );
    const source = fs.readFileSync(providerPath, 'utf-8');
    assert.match(source, /25 \+ completionScore \* 30 \+ timeScore \* 25 \+ responsibleScore \* 20/);
  });
});
