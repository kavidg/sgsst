import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Types } from 'mongoose';
import { ControlVerificationProvider } from './control-verification.provider';
import { RiskDocument } from '../../risks/schemas/risk.schema';
import { ControlVerificationDocument } from '../../risks/schemas/control-verification.schema';
import { ControlVerificationResult } from '../../risks/enums/control-verification-result.enum';
import { FollowUpStatus } from '../../risks/enums/follow-up-status.enum';

/**
 * Tests del ControlVerificationProvider — Estándar 4.2.2 (ETAPA 5B).
 *
 * Nueva fuente de evidencia: Risk.controls[] + ControlVerification.
 * Fórmula congelada: 25 existencia / 25 cobertura / 40 resultado / 10 seguimientos.
 * COMPLIANT=1, PARTIAL=0.5, NON_COMPLIANT=0. Ventana de vigencia: 12 meses.
 * NO_DATA (sin controles activos elegibles) → 0 con phases.do = 0: ese 0
 * participa en el promedio de HACER (semántica actual del engine, decisión
 * documentada en la Etapa 5A).
 */

const VALID_COMPANY_ID = '507f1f77bcf86cd799439011';
const OTHER_COMPANY_ID = '507f1f77bcf86cd799439022';

const COMPANY_OID = new Types.ObjectId(VALID_COMPANY_ID);
const OTHER_COMPANY_OID = new Types.ObjectId(OTHER_COMPANY_ID);

let riskSeq = 0;
function createRisk(overrides: Partial<{
  companyId: Types.ObjectId;
  controls: Array<{ _id?: Types.ObjectId; description: string; isActive: boolean }>;
}> = {}): Partial<RiskDocument> {
  riskSeq++;
  // Cada subdocumento ControlMeasure necesita su _id estable (como en Mongoose).
  const controls = (overrides.controls ?? []).map((c) => ({
    _id: c._id ?? new Types.ObjectId(),
    description: c.description,
    isActive: c.isActive,
  }));
  return {
    _id: new Types.ObjectId(),
    companyId: overrides.companyId ?? COMPANY_OID,
    process: `Proceso ${riskSeq}`,
    activity: `Actividad ${riskSeq}`,
    hazard: `Peligro ${riskSeq}`,
    risk: `Riesgo ${riskSeq}`,
    probability: 3,
    consequence: 3,
    riskLevel: 9,
    controlMeasures: 'Medida legacy (no usada por el provider)',
    ...overrides,
    controls,
  } as unknown as Partial<RiskDocument>;
}

let verificationSeq = 0;
function createVerification(overrides: Partial<{
  companyId: Types.ObjectId;
  riskId: Types.ObjectId;
  controlId: string;
  verificationDate: Date;
  result: ControlVerificationResult;
  requiresFollowUp: boolean;
  followUpStatus: FollowUpStatus;
}> = {}): Partial<ControlVerificationDocument> {
  verificationSeq++;
  return {
    _id: new Types.ObjectId(),
    companyId: overrides.companyId ?? COMPANY_OID,
    riskId: overrides.riskId ?? new Types.ObjectId(),
    controlId: overrides.controlId ?? new Types.ObjectId().toString(),
    controlDescriptionSnapshot: `Control ${verificationSeq}`,
    verificationDate: overrides.verificationDate ?? new Date(),
    verifiedBy: `Verificador ${verificationSeq}`,
    result: overrides.result ?? ControlVerificationResult.COMPLIANT,
    observations: undefined,
    requiresFollowUp: overrides.requiresFollowUp ?? false,
    followUpDueDate: overrides.requiresFollowUp ? new Date() : undefined,
    followUpStatus: overrides.followUpStatus ?? FollowUpStatus.OPEN,
    ...overrides,
  } as unknown as Partial<ControlVerificationDocument>;
}

function buildModels(
  risks: unknown[],
  verifications: unknown[],
) {
  return {
    riskModel: {
      find: (_query: any) => ({
        exec: () => Promise.resolve(risks),
      }),
    },
    controlVerificationModel: {
      find: (query: any) => ({
        sort: (_sort: any) => ({
          exec: () => {
            // Simula el sort({verificationDate:-1}) del provider:
            // filtra por ventana y ordena descendente.
            const cutoff = query?.verificationDate?.$gte as Date | undefined;
            const filtered = cutoff
              ? verifications.filter((v: any) => v.verificationDate >= cutoff)
              : verifications;
            return Promise.resolve(
              [...filtered].sort(
                (a: any, b: any) => b.verificationDate.getTime() - a.verificationDate.getTime(),
              ),
            );
          },
        }),
      }),
    },
  };
}

function createProvider(
  risks: unknown[],
  verifications: unknown[] = [],
): ControlVerificationProvider {
  const models = buildModels(risks, verifications);
  return new ControlVerificationProvider(
    models.riskModel as any,
    models.controlVerificationModel as any,
  );
}

describe('ControlVerificationProvider (4.2.2) — ETAPA 5B', () => {
  describe('Caso 1 — NO_DATA', () => {
    it('sin riesgos con controles activos → 0, NO_DATA, phases.do = 0', async () => {
      const provider = createProvider([createRisk({ controls: [] })]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.equal(result.percentage, 0);
      assert.equal(result.status, 'NO_DATA');
      assert.equal(result.phases?.do, 0);
      assert.equal(result.findings.length, 1);
      assert.equal(result.findings[0].id, 'control-verification-no-data');
      assert.equal(result.phases?.check, undefined);
      assert.equal(result.phases?.plan, undefined);
      assert.equal(result.phases?.act, undefined);
    });

    it('sin riesgos → NO_DATA', async () => {
      const provider = createProvider([]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.equal(result.percentage, 0);
      assert.equal(result.status, 'NO_DATA');
      assert.equal(result.phases?.do, 0);
    });

    it('riesgos legacy sin controls[] estructurados → NO_DATA (no genera controles automáticos)', async () => {
      const provider = createProvider([
        createRisk({ controls: undefined }),
        createRisk({ controls: [] }),
      ]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.equal(result.percentage, 0);
      assert.equal(result.status, 'NO_DATA');
    });
  });

  describe('Caso 2 — existencia (controles sin verificaciones)', () => {
    it('5 controles activos sin verificaciones → existence=100, coverage=0, result=0, follow-up=100', async () => {
      const risks = [createRisk({ controls: [
        { description: 'C1', isActive: true },
        { description: 'C2', isActive: true },
        { description: 'C3', isActive: true },
        { description: 'C4', isActive: true },
        { description: 'C5', isActive: true },
      ] })];
      const provider = createProvider(risks, []);
      const result = await provider.getCompliance(VALID_COMPANY_ID);

      const metadata = result.metadata as Record<string, number>;
      assert.equal(metadata.totalActiveControls, 5);
      assert.equal(metadata.verifiedControls, 0);
      assert.equal(metadata.existenceScore, 100);
      assert.equal(metadata.coverageScore, 0);
      assert.equal(metadata.resultScore, 0);
      assert.equal(metadata.followUpScore, 100); // sin seguimientos requeridos → neutro

      // 100*.25 + 0*.25 + 0*.40 + 100*.10 = 35
      assert.equal(result.percentage, 35);
      assert.equal(result.status, 'TARGET_NOT_MET');
    });
  });

  describe('Caso 3 — cobertura parcial', () => {
    it('10 controles, 8 verificados → coverage = 80', async () => {
      const risk = createRisk({
        controls: Array.from({ length: 10 }, (_, i) => ({
          description: `C${i + 1}`,
          isActive: true,
        })),
      });
      const controls = (risk.controls as unknown as Array<{ _id: Types.ObjectId }>).map((c) => String(c._id));
      const verifications = controls.slice(0, 8).map((controlId) =>
        createVerification({ riskId: risk._id as Types.ObjectId, controlId, result: ControlVerificationResult.COMPLIANT }),
      );
      const provider = createProvider([risk], verifications);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      const metadata = result.metadata as Record<string, number>;
      assert.equal(metadata.coverageScore, 80);
    });
  });

  describe('Caso 4 — resultados COMPLIANT/PARTIAL/NON_COMPLIANT', () => {
    it('pondera 1 / 0.5 / 0', async () => {
      const risk = createRisk({ controls: [
        { description: 'C1', isActive: true },
        { description: 'C2', isActive: true },
        { description: 'C3', isActive: true },
        { description: 'C4', isActive: true },
      ] });
      const controls = (risk.controls as unknown as Array<{ _id: Types.ObjectId }>).map((c) => String(c._id));
      const riskId = risk._id as Types.ObjectId;
      const verifications = [
        createVerification({ riskId, controlId: controls[0], result: ControlVerificationResult.COMPLIANT }),
        createVerification({ riskId, controlId: controls[1], result: ControlVerificationResult.PARTIAL }),
        createVerification({ riskId, controlId: controls[2], result: ControlVerificationResult.NON_COMPLIANT }),
        createVerification({ riskId, controlId: controls[3], result: ControlVerificationResult.COMPLIANT }),
      ];
      const provider = createProvider([risk], verifications);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      const metadata = result.metadata as Record<string, number>;
      // (1 + 0.5 + 0 + 1) / 4 * 100 = 62.5
      assert.equal(metadata.resultScore, 62.5);
    });

    it('NON_COMPLIANT genera finding HIGH', async () => {
      const risk = createRisk({ controls: [{ description: 'C1', isActive: true }] });
      const verifications = [createVerification({
        riskId: risk._id as Types.ObjectId,
        controlId: String((risk.controls as unknown as Array<{ _id: Types.ObjectId }>)[0]._id),
        result: ControlVerificationResult.NON_COMPLIANT,
      })];
      const provider = createProvider([risk], verifications);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.findings.some((f) => f.id === 'control-verify-non-compliant'));
    });
  });

  describe('Caso 5 — última verificación por control', () => {
    it('usa solo la más reciente (antigua NON_COMPLIANT, reciente COMPLIANT)', async () => {
      const risk = createRisk({ controls: [{ description: 'C1', isActive: true }] });
      const controlId = String((risk.controls as unknown as Array<{ _id: Types.ObjectId }>)[0]._id);
      const riskId = risk._id as Types.ObjectId;
      const verifications = [
        createVerification({ riskId, controlId, verificationDate: new Date('2020-01-01'), result: ControlVerificationResult.NON_COMPLIANT }),
        createVerification({ riskId, controlId, verificationDate: new Date(), result: ControlVerificationResult.COMPLIANT }),
      ];
      const provider = createProvider([risk], verifications);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      const metadata = result.metadata as Record<string, number>;
      assert.equal(metadata.verifiedControls, 1);
      assert.equal(metadata.resultScore, 100); // usó la COMPLIANT reciente
    });

    it('NO promedia el histórico del mismo control', async () => {
      const risk = createRisk({ controls: [{ description: 'C1', isActive: true }] });
      const controlId = String((risk.controls as unknown as Array<{ _id: Types.ObjectId }>)[0]._id);
      const riskId = risk._id as Types.ObjectId;
      const verifications = [
        createVerification({ riskId, controlId, verificationDate: new Date('2021-06-01'), result: ControlVerificationResult.NON_COMPLIANT }),
        createVerification({ riskId, controlId, verificationDate: new Date(), result: ControlVerificationResult.COMPLIANT }),
      ];
      const provider = createProvider([risk], verifications);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      const metadata = result.metadata as Record<string, number>;
      // Histórico promediado daría 50; la más reciente da 100.
      assert.equal(metadata.resultScore, 100);
    });
  });

  describe('Caso 6 — vigencia (ventana de 12 meses)', () => {
    it('verificación fuera de la ventana NO cuenta como vigente', async () => {
      const risk = createRisk({ controls: [{ description: 'C1', isActive: true }] });
      const controlId = String((risk.controls as unknown as Array<{ _id: Types.ObjectId }>)[0]._id);
      const riskId = risk._id as Types.ObjectId;
      const old = new Date();
      old.setMonth(old.getMonth() - 13); // fuera de ventana
      const verifications = [createVerification({ riskId, controlId, verificationDate: old, result: ControlVerificationResult.COMPLIANT })];
      const provider = createProvider([risk], verifications);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      const metadata = result.metadata as Record<string, number>;
      assert.equal(metadata.verifiedControls, 0);
      assert.equal(metadata.coverageScore, 0);
      assert.equal(metadata.resultScore, 0);
      assert.ok(result.findings.some((f) => f.id === 'control-verify-unverified-controls'));
    });

    it('verificación dentro de la ventana (11 meses) SÍ cuenta', async () => {
      const risk = createRisk({ controls: [{ description: 'C1', isActive: true }] });
      const controlId = String((risk.controls as unknown as Array<{ _id: Types.ObjectId }>)[0]._id);
      const riskId = risk._id as Types.ObjectId;
      const recent = new Date();
      recent.setMonth(recent.getMonth() - 11);
      const verifications = [createVerification({ riskId, controlId, verificationDate: recent, result: ControlVerificationResult.COMPLIANT })];
      const provider = createProvider([risk], verifications);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      const metadata = result.metadata as Record<string, number>;
      assert.equal(metadata.verifiedControls, 1);
      assert.equal(metadata.validityMonths, 12);
    });
  });

  describe('Caso 7 — seguimientos requeridos', () => {
    it('4 requeridos, 3 CLOSED, 1 OPEN → followUpScore = 75', async () => {
      const risk = createRisk({
        controls: Array.from({ length: 4 }, (_, i) => ({ description: `C${i + 1}`, isActive: true })),
      });
      const riskId = risk._id as Types.ObjectId;
      const verifications = (risk.controls as unknown as Array<{ _id: Types.ObjectId }>).map((c, i) =>
        createVerification({
          riskId,
          controlId: String(c._id),
          result: ControlVerificationResult.COMPLIANT,
          requiresFollowUp: true,
          followUpStatus: i < 3 ? FollowUpStatus.CLOSED : FollowUpStatus.OPEN,
        }),
      );
      const provider = createProvider([risk], verifications);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      const metadata = result.metadata as Record<string, number>;
      assert.equal(metadata.totalRequiredFollowUps, 4);
      assert.equal(metadata.closedRequiredFollowUps, 3);
      assert.equal(metadata.followUpScore, 75);
      assert.ok(result.findings.some((f) => f.id === 'control-verify-open-follow-ups'));
    });
  });

  describe('Caso 8 — sin seguimientos requeridos', () => {
    it('followUpScore = 100 (componente neutral)', async () => {
      const risk = createRisk({ controls: [{ description: 'C1', isActive: true }] });
      const verifications = [createVerification({
        riskId: risk._id as Types.ObjectId,
        controlId: String((risk.controls as unknown as Array<{ _id: Types.ObjectId }>)[0]._id),
        requiresFollowUp: false,
      })];
      const provider = createProvider([risk], verifications);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      const metadata = result.metadata as Record<string, number>;
      assert.equal(metadata.totalRequiredFollowUps, 0);
      assert.equal(metadata.followUpScore, 100);
    });
  });

  describe('Caso 9 — ejemplo integral congelado', () => {
    it('10 controles / 8 verificados / 6C+2P / 4 seguimientos 3C+1A → 87.5', async () => {
      // NOTA DE ARITMÉTICA: el enunciado de la Etapa 5B indicaba 89.5, pero
      // aplicando la fórmula congelada a sus propios componentes:
      //   100·0.25 + 80·0.25 + 87.5·0.40 + 75·0.10 = 25 + 20 + 35 + 7.5 = 87.5.
      // El provider implementa la fórmula congelada; el total correcto es 87.5.
      const risk = createRisk({
        controls: Array.from({ length: 10 }, (_, i) => ({ description: `C${i + 1}`, isActive: true })),
      });
      const riskId = risk._id as Types.ObjectId;
      const controlIds = (risk.controls as unknown as Array<{ _id: Types.ObjectId }>).map((c) => String(c._id));

      // 8 verificados: 6 COMPLIANT, 2 PARTIAL. 4 con seguimiento: 3 CLOSED, 1 OPEN.
      const verifications = controlIds.slice(0, 8).map((controlId, i) =>
        createVerification({
          riskId,
          controlId,
          result: i < 6 ? ControlVerificationResult.COMPLIANT : ControlVerificationResult.PARTIAL,
          requiresFollowUp: i < 4,
          followUpStatus: i < 3 ? FollowUpStatus.CLOSED : FollowUpStatus.OPEN,
        }),
      );

      const provider = createProvider([risk], verifications);
      const result = await provider.getCompliance(VALID_COMPANY_ID);

      const metadata = result.metadata as Record<string, number>;
      assert.equal(metadata.existenceScore, 100);
      assert.equal(metadata.coverageScore, 80);
      assert.equal(metadata.resultScore, 87.5);
      assert.equal(metadata.followUpScore, 75);

      // 100*.25 + 80*.25 + 87.5*.40 + 75*.10 = 25 + 20 + 35 + 7.5 = 87.5
      assert.equal(result.percentage, 87.5);
      assert.equal(result.status, 'TARGET_NOT_MET'); // umbral 90
      assert.equal(result.phases?.do, 87.5);
    });
  });

  describe('Caso 10 — multitenancy', () => {
    it('company A no usa riesgos ni verificaciones de company B', async () => {
      const riskA = createRisk({ controls: [{ description: 'Control A', isActive: true }] });
      const riskB = createRisk({
        companyId: OTHER_COMPANY_OID,
        controls: [{ description: 'Control B', isActive: true }],
      });
      const riskBId = riskB._id as Types.ObjectId;

      // El provider solo recibe los riesgos de A (query por companyId);
      // la verificación huérfana pertenece a B con el riskId de B.
      const risksOfA = [riskA];
      const allVerifications = [
        createVerification({
          companyId: OTHER_COMPANY_OID,
          riskId: riskBId,
          controlId: String((riskB.controls as unknown as Array<{ _id: Types.ObjectId }>)[0]._id),
          result: ControlVerificationResult.NON_COMPLIANT,
        }),
      ];
      // El mock filtra por companyId como lo haría Mongo:
      const models = buildModels(risksOfA, allVerifications);
      models.controlVerificationModel.find = (query: any) => ({
        sort: (_sort: any) => ({
          exec: () => Promise.resolve(
            query.companyId.equals(COMPANY_OID)
              ? allVerifications.filter((v: any) => v.companyId.equals(COMPANY_OID))
              : allVerifications.filter((v: any) => v.companyId.equals(OTHER_COMPANY_OID)),
          ),
        }),
      });
      const provider = new ControlVerificationProvider(models.riskModel as any, models.controlVerificationModel as any);

      const result = await provider.getCompliance(VALID_COMPANY_ID);
      const metadata = result.metadata as Record<string, number>;
      assert.equal(metadata.totalActiveControls, 1); // solo el control de A
      assert.equal(metadata.verifiedControls, 0); // la verificación de B no se ve
      assert.equal(result.percentage, 35);
    });
  });

  describe('Caso 11 — controles inactivos', () => {
    it('isActive=false no entra en ningún denominador', async () => {
      const risk = createRisk({
        controls: [
          { description: 'Activo', isActive: true },
          { description: 'Inactivo', isActive: false },
        ],
      });
      const verifications = [createVerification({
        riskId: risk._id as Types.ObjectId,
        controlId: String((risk.controls as unknown as Array<{ _id: Types.ObjectId }>)[0]._id),
        result: ControlVerificationResult.COMPLIANT,
      })];
      const provider = createProvider([risk], verifications);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      const metadata = result.metadata as Record<string, number>;
      assert.equal(metadata.totalActiveControls, 1);
      assert.equal(metadata.verifiedControls, 1);
      assert.equal(metadata.coverageScore, 100);
      assert.equal(result.percentage, 100);
      assert.equal(result.status, 'TARGET_MET');
    });

    it('riesgo solo con controles inactivos → NO_DATA', async () => {
      const provider = createProvider([createRisk({ controls: [{ description: 'Inactivo', isActive: false }] })]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.equal(result.status, 'NO_DATA');
      assert.equal(result.percentage, 0);
    });
  });

  describe('Caso 12 — control sin verificación', () => {
    it('cuenta en existencia y cobertura (denominador), no en resultado; no genera verificación', async () => {
      const risk = createRisk({
        controls: [
          { description: 'Verificado', isActive: true },
          { description: 'Sin verificación', isActive: true },
        ],
      });
      const verifications = [createVerification({
        riskId: risk._id as Types.ObjectId,
        controlId: String((risk.controls as unknown as Array<{ _id: Types.ObjectId }>)[0]._id),
        result: ControlVerificationResult.COMPLIANT,
      })];
      const provider = createProvider([risk], verifications);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      const metadata = result.metadata as Record<string, number>;

      assert.equal(metadata.totalActiveControls, 2); // existencia: ambos
      assert.equal(metadata.verifiedControls, 1); // cobertura: solo uno
      assert.equal(metadata.coverageScore, 50); // denominador incluye al no verificado
      assert.equal(metadata.resultScore, 100); // resultado: denominador solo verificados
      assert.equal(metadata.totalRequiredFollowUps, 0); // no se inventa seguimiento
      assert.ok(result.findings.some((f) => f.id === 'control-verify-unverified-controls'));
      assert.equal(result.pending, 1);
      assert.equal(result.completed, 1);
    });
  });

  describe('Contrato del provider', () => {
    it('phases contiene SOLO do (nunca check)', async () => {
      const risk = createRisk({ controls: [{ description: 'C1', isActive: true }] });
      const provider = createProvider([risk], []);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      assert.ok(result.phases?.do !== undefined);
      assert.equal(result.phases?.check, undefined);
      assert.equal(result.phases?.plan, undefined);
      assert.equal(result.phases?.act, undefined);
    });

    it('metadata es informativa y no altera el cálculo', async () => {
      const risk = createRisk({ controls: [{ description: 'C1', isActive: true }] });
      const provider = createProvider([risk], [createVerification({
        riskId: risk._id as Types.ObjectId,
        controlId: String((risk.controls as unknown as Array<{ _id: Types.ObjectId }>)[0]._id),
      })]);
      const result = await provider.getCompliance(VALID_COMPANY_ID);
      const metadata = result.metadata as Record<string, unknown>;
      // 100*.25 + 100*.25 + 100*.40 + 100*.10 = 100
      assert.equal(result.percentage, 100);
      assert.equal(metadata.validityMonths, 12);
      assert.equal(metadata.totalActiveControls, 1);
    });

    it('no consulta InspectionActivity (fuente eliminada del provider)', () => {
      // El constructor ya no acepta el modelo de inspecciones: dos parámetros.
      const risk = createRisk({ controls: [{ description: 'C1', isActive: true }] });
      const provider = createProvider([risk], []);
      assert.ok(provider instanceof ControlVerificationProvider);
    });
  });
});
