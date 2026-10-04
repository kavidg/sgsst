import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Risk, RiskDocument } from '../../risks/schemas/risk.schema';
import {
  ControlVerification,
  ControlVerificationDocument,
} from '../../risks/schemas/control-verification.schema';
import { ControlVerificationResult } from '../../risks/enums/control-verification-result.enum';
import { FollowUpStatus } from '../../risks/enums/follow-up-status.enum';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Evaluación automática del estándar 4.2.2
 * "Verificación de aplicación de medidas".
 *
 * ETAPA 5B — Nueva fuente de evidencia:
 *   Risk.controls[] (controles estructurados activos)
 *   + ControlVerification (verificaciones de campo por control)
 *
 * El provider YA NO consume InspectionActivity: esa colección queda
 * exclusivamente para 4.2.4 (InspectionComplianceProvider), eliminando el
 * doble conteo detectado en la auditoría transversal.
 *
 * Fórmula congelada (NO modificar):
 *   25% existencia de controles activos
 *   25% cobertura de verificaciones válidas
 *   40% resultado de verificaciones vigentes
 *   10% cierre de seguimientos requeridos
 *
 * Ponderación de resultado: COMPLIANT=1, PARTIAL=0.5, NON_COMPLIANT=0.
 * Vigencia (recencia observable, NO periodicidad formal): una verificación es
 * vigente si verificationDate >= ahora - 12 meses. Por control se usa
 * únicamente la verificación vigente más reciente (no se promedia histórico).
 *
 * Semántica NO_DATA (decisión documentada en tests): sin riesgos con
 * controles activos elegibles → percentage 0, status NO_DATA y phases.do = 0.
 * Ese 0 participa en el promedio de HACER (comportamiento actual del
 * ComplianceEngine, no se modifica aquí).
 *
 * CORRECCIÓN FASE (AUDIT): 4.2.2 es HACER en el catálogo (sección
 * do-medidas-control); la contribución correcta es `phases.do`.
 */
@Injectable()
export class ControlVerificationProvider implements ComplianceProvider {
  private static readonly MODULE = 'control-verification';
  private static readonly COMPLIANCE_TARGET = 90;
  /** Ventana de vigencia en meses (recencia observable provisional). */
  private static readonly VALIDITY_MONTHS = 12;

  /** Ponderación del resultado de la verificación (fórmula congelada). */
  private static readonly RESULT_WEIGHTS: Record<ControlVerificationResult, number> = {
    [ControlVerificationResult.COMPLIANT]: 1,
    [ControlVerificationResult.PARTIAL]: 0.5,
    [ControlVerificationResult.NON_COMPLIANT]: 0,
  };

  constructor(
    @InjectModel(Risk.name)
    private readonly riskModel: Model<RiskDocument>,
    @InjectModel(ControlVerification.name)
    private readonly controlVerificationModel: Model<ControlVerificationDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);

    // 1. Riesgos del tenant (subdocumentos controls[] leídos en memoria; los
    //    riesgos legacy sin controls[] NO generan controles automáticos y el
    //    string controlMeasures NO se usa como fallback).
    const risks = await this.riskModel.find({ companyId: companyObjectId }).exec();

    interface ActiveControl {
      riskId: Types.ObjectId;
      controlId: string;
    }
    const activeControls: ActiveControl[] = [];
    for (const risk of risks) {
      for (const control of risk.controls ?? []) {
        if (control.isActive) {
          // Identidad estable del subdocumento: su _id (patrón de control-verification.service).
          const controlId = String((control as unknown as { _id: Types.ObjectId })._id);
          activeControls.push({
            riskId: risk._id,
            controlId,
          });
        }
      }
    }

    const totalActiveControls = activeControls.length;
    if (totalActiveControls === 0) {
      // NO_DATA: sin controles activos elegibles no existe evidencia evaluable.
      return {
        module: ControlVerificationProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: [{
          id: 'control-verification-no-data',
          module: ControlVerificationProvider.MODULE,
          title: 'Sin controles estructurados activos',
          description:
            'No existen riesgos con controles estructurados activos. El estándar 4.2.2 requiere definir medidas de control en la matriz de riesgos y registrar su verificación periódica.',
          priority: FindingPriority.HIGH,
          status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
        }],
        pending: 0, completed: 0,
        phases: { do: 0 } as Partial<Record<CompliancePhaseKey, number>>,
      };
    }

    // 2. Verificaciones vigentes del tenant (ventana de 12 meses) ordenadas de
    //    más reciente a más antigua. Una sola consulta para todo el tenant
    //    (aprovecha el índice { companyId, verificationDate: -1 }); la selección
    //    de la más reciente por riskId+controlId se hace en memoria.
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - ControlVerificationProvider.VALIDITY_MONTHS);
    const verifications = await this.controlVerificationModel
      .find({
        companyId: companyObjectId,
        verificationDate: { $gte: cutoff },
      })
      .sort({ verificationDate: -1 })
      .exec();

    const latestByControl = new Map<string, ControlVerificationDocument>();
    for (const verification of verifications) {
      const key = `${verification.riskId.toString()}_${verification.controlId}`;
      if (!latestByControl.has(key)) {
        latestByControl.set(key, verification); // orden descendente → primera = más reciente
      }
    }

    // 3. Componentes de la fórmula congelada.
    const existenceScore = 100; // hay al menos un control activo elegible

    let verifiedControls = 0;
    let resultWeightSum = 0;
    let totalRequiredFollowUps = 0;
    let closedRequiredFollowUps = 0;
    let nonCompliantCount = 0;
    let partialCount = 0;

    for (const control of activeControls) {
      const latest = latestByControl.get(`${control.riskId.toString()}_${control.controlId}`);
      if (!latest) continue; // control sin verificación vigente: cuenta en existencia y cobertura, no en resultado
      verifiedControls++;
      resultWeightSum += ControlVerificationProvider.RESULT_WEIGHTS[latest.result];
      if (latest.result === ControlVerificationResult.NON_COMPLIANT) nonCompliantCount++;
      if (latest.result === ControlVerificationResult.PARTIAL) partialCount++;
      if (latest.requiresFollowUp) {
        totalRequiredFollowUps++;
        if (latest.followUpStatus === FollowUpStatus.CLOSED) closedRequiredFollowUps++;
      }
    }

    const coverageScore = (verifiedControls / totalActiveControls) * 100;
    const resultScore = verifiedControls > 0 ? (resultWeightSum / verifiedControls) * 100 : 0;
    const followUpScore = totalRequiredFollowUps > 0
      ? (closedRequiredFollowUps / totalRequiredFollowUps) * 100
      : 100; // sin seguimientos requeridos → componente neutral

    const raw =
      existenceScore * 0.25 +
      coverageScore * 0.25 +
      resultScore * 0.40 +
      followUpScore * 0.10;
    // Se conserva un decimal para reproducir el ejemplo congelado (89.5); el
    // engine redondea a 2 decimales en resolvePhaseCompliance sin afectarse.
    const percentage = Math.round(raw * 10) / 10;

    // 4. Findings (id de NO_DATA conservado para compatibilidad con el
    //    mapeo de standard-analysis: 'control-verification' → 'control-verification-no-data').
    const findings: ProviderComplianceResult['findings'] = [];

    const unverifiedControls = totalActiveControls - verifiedControls;
    if (unverifiedControls > 0) {
      findings.push({
        id: 'control-verify-unverified-controls',
        module: ControlVerificationProvider.MODULE,
        title: `${unverifiedControls} control(es) sin verificación vigente`,
        description: `${unverifiedControls} de ${totalActiveControls} controles activos no tienen una verificación dentro de los últimos ${ControlVerificationProvider.VALIDITY_MONTHS} meses.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }
    if (nonCompliantCount > 0) {
      findings.push({
        id: 'control-verify-non-compliant',
        module: ControlVerificationProvider.MODULE,
        title: `${nonCompliantCount} control(es) con verificación no conforme`,
        description: `${nonCompliantCount} controles registran su verificación más reciente como NO CONFORME. Requieren atención inmediata y seguimiento.`,
        priority: FindingPriority.HIGH,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }
    if (partialCount > 0) {
      findings.push({
        id: 'control-verify-partial',
        module: ControlVerificationProvider.MODULE,
        title: `${partialCount} control(es) con verificación parcial`,
        description: `${partialCount} controles registran su verificación más reciente como PARCIAL.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }
    const openFollowUps = totalRequiredFollowUps - closedRequiredFollowUps;
    if (openFollowUps > 0) {
      findings.push({
        id: 'control-verify-open-follow-ups',
        module: ControlVerificationProvider.MODULE,
        title: `${openFollowUps} seguimiento(s) abierto(s)`,
        description: `${openFollowUps} de ${totalRequiredFollowUps} seguimientos requeridos permanecen abiertos.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    return {
      module: ControlVerificationProvider.MODULE,
      percentage,
      status: percentage >= ControlVerificationProvider.COMPLIANCE_TARGET ? 'TARGET_MET' : 'TARGET_NOT_MET',
      findings,
      pending: totalActiveControls - verifiedControls,
      completed: verifiedControls,
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
      metadata: {
        totalActiveControls,
        verifiedControls,
        existenceScore,
        coverageScore,
        resultScore,
        followUpScore,
        totalRequiredFollowUps,
        closedRequiredFollowUps,
        validityMonths: ControlVerificationProvider.VALIDITY_MONTHS,
      },
    };
  }
}
