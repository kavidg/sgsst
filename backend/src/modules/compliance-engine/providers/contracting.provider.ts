import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Contract, ContractDocument, ContractStatus } from '../../contracting/schemas/contract.schema';
import { ContractInduction, ContractInductionDocument, InductionStatus } from '../../contracting/schemas/contract-induction.schema';
import { ContractEvaluation, ContractEvaluationDocument } from '../../contracting/schemas/contract-evaluation.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';

/**
 * Evaluación automática del estándar 2.10.1 "Contratación".
 *
 * Conecta el dominio de Contratación con ComplianceEngine para evaluar:
 * - Requisitos SST en contratos activos
 * - Inducciones SST completadas
 * - Evaluaciones de seguimiento
 * - Pólizas/certificados (sin datos estructurados actualmente)
 *
 * Criterios y pesos:
 * - Requisitos SST:       30%
 * - Inducciones:           25%
 * - Evaluaciones:          25%
 * - Pólizas/certificados: 20%
 *
 * NOTA sobre pólizas/certificados:
 * En BLOQUE 6A no se implementaron contractDocumentId ni evidenceDocumentIds.
 * No existen campos estructurados para verificar vigencia de pólizas.
 * Este criterio se marca como NO_DATA por integridad del scoring.
 * NO se fuerza un porcentaje artificial.
 *
 * NO_DATA: sin contratos registrados.
 * TARGET_MET: percentage >= 90.
 * TARGET_NOT_MET: percentage < 90.
 */
@Injectable()
export class ContractingProvider implements ComplianceProvider {
  /** Meta de cumplimiento. */
  private static readonly COMPLIANCE_TARGET = 90;

  constructor(
    @InjectModel(Contract.name) private contractModel: Model<ContractDocument>,
    @InjectModel(ContractInduction.name) private inductionModel: Model<ContractInductionDocument>,
    @InjectModel(ContractEvaluation.name) private evaluationModel: Model<ContractEvaluationDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);

    // ── Query parallel: obtener contratos activos y métricas ──
    const [
      totalContracts,
      activeContracts,
      cancelledContracts,
      activeWithSstRequirements,
      totalInductions,
      completedInductions,
      totalEvaluations,
      activeContractsWithEvaluation,
    ] = await Promise.all([
      // Total de contratos (no cancelados)
      this.contractModel
        .countDocuments({ companyId: companyObjectId, status: { $ne: ContractStatus.CANCELLED } })
        .exec(),
      // Contratos activos
      this.contractModel
        .countDocuments({ companyId: companyObjectId, status: ContractStatus.ACTIVE })
        .exec(),
      // Contratos cancelados
      this.contractModel
        .countDocuments({ companyId: companyObjectId, status: ContractStatus.CANCELLED })
        .exec(),
      // Contratos activos con requisitos SST
      this.contractModel
        .countDocuments({
          companyId: companyObjectId,
          status: ContractStatus.ACTIVE,
          sstRequirements: { $exists: true, $ne: '' },
        })
        .exec(),
      // Total de inducciones
      this.inductionModel
        .countDocuments({ companyId: companyObjectId })
        .exec(),
      // Inducciones completadas
      this.inductionModel
        .countDocuments({ companyId: companyObjectId, status: InductionStatus.COMPLETED })
        .exec(),
      // Total de evaluaciones
      this.evaluationModel
        .countDocuments({ companyId: companyObjectId })
        .exec(),
      // Contratos activos que tienen al menos una evaluación
      this.getContractsWithEvaluation(companyObjectId),
    ]);

    // ── NO_DATA ──
    if (totalContracts === 0 && cancelledContracts === 0) {
      return {
        module: 'contracting',
        percentage: 0,
        status: 'NO_DATA',
        findings: [
          {
            id: 'ctr-no-data',
            module: 'contracting',
            title: 'Sin datos de contratación',
            description:
              'No existen contratos registrados en el sistema. Registrar al menos un contrato activo con contratista para evaluar el cumplimiento de 2.10.1.',
            priority: FindingPriority.HIGH,
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
        pending: 0,
        completed: 0,
        overdue: 0,
        phases: { do: 0 } as Partial<Record<CompliancePhaseKey, number>>,
      };
    }

    // ══════════════════════════════════════════════════════════
    // Cálculo de criterios (solo contratos ACTIVE son evaluables)
    // ══════════════════════════════════════════════════════════

    const findings: ProviderComplianceResult['findings'] = [];
    let pending = 0;
    let completed = 0;

    // ── Criterio 1: Requisitos SST (30%) ──
    const sstWeight = 30;
    let sstScore = 0;
    if (activeContracts > 0) {
      sstScore = Math.round((activeWithSstRequirements / activeContracts) * 100);
    }

    if (activeContracts > 0) {
      const withoutSst = activeContracts - activeWithSstRequirements;
      if (withoutSst > 0) {
        findings.push({
          id: 'ctr-no-sst-requirements',
          module: 'contracting',
          title: `${withoutSst} contrato(s) activo(s) sin requisitos SST documentados`,
          description:
            'Existen contratos activos sin requisitos de Seguridad y Salud en el Trabajo documentados. El estándar 2.10.1 requiere que la contratación incorpore lineamientos de SST.',
          priority: FindingPriority.HIGH,
          status: 'OPEN',
          responsible: '',
          dueDate: '',
          createdAt: new Date().toISOString(),
        });
        pending += withoutSst;
      } else {
        completed += activeContracts;
      }
    }

    // ── Criterio 2: Inducciones (25%) ──
    const inductionWeight = 25;
    let inductionScore = 0;
    if (totalInductions > 0) {
      inductionScore = Math.round((completedInductions / totalInductions) * 100);
    }

    if (totalInductions > 0) {
      const pendingInductions = totalInductions - completedInductions;
      if (pendingInductions > 0) {
        findings.push({
          id: 'ctr-pending-inductions',
          module: 'contracting',
          title: `${pendingInductions} inducción(es) de contratistas pendientes o incompletas`,
          description:
            'Existen registros de inducción SST que no han sido completados. Cada trabajador de un contratista debe recibir inducción SST antes de iniciar labores.',
          priority: FindingPriority.MEDIUM,
          status: 'OPEN',
          responsible: '',
          dueDate: '',
          createdAt: new Date().toISOString(),
        });
        pending += pendingInductions;
      } else {
        completed += totalInductions;
      }
    }

    // ── Criterio 3: Evaluaciones (25%) ──
    const evaluationWeight = 25;
    let evaluationScore = 0;
    if (activeContracts > 0) {
      evaluationScore = Math.round((activeContractsWithEvaluation / activeContracts) * 100);
    }

    if (activeContracts > 0) {
      const withoutEvaluation = activeContracts - activeContractsWithEvaluation;
      if (withoutEvaluation > 0) {
        findings.push({
          id: 'ctr-no-evaluations',
          module: 'contracting',
          title: `${withoutEvaluation} contrato(s) activo(s) sin evaluación de seguimiento`,
          description:
            'Existen contratos activos sin evaluación de desempeño SST registrada. Se recomienda evaluar periódicamente el cumplimiento de los contratistas.',
          priority: FindingPriority.MEDIUM,
          status: 'OPEN',
          responsible: '',
          dueDate: '',
          createdAt: new Date().toISOString(),
        });
        pending += withoutEvaluation;
      } else {
        completed += activeContracts;
      }
    }

    // ── Criterio 4: Pólizas / Certificados (20%) ──
    // Decisión documentada: En BLOQUE 6A NO se implementaron contractDocumentId
    // ni evidenceDocumentIds. No existen campos estructurados para verificar
    // vigencia de pólizas/certificados de contratistas.
    // Este criterio se marca como no disponible para preservar la integridad
    // del scoring. NO se fuerza un porcentaje artificial.
    const policyWeight = 20;
    const policyScore = 0;

    findings.push({
      id: 'ctr-no-policy-data',
      module: 'contracting',
      title: 'Sin datos estructurados de pólizas o certificados',
      description:
        'No existe información estructurada suficiente para verificar automáticamente la vigencia de pólizas o certificados de contratistas. Implementar campos de referencia documental (contractDocumentId, evidenceDocumentIds) en un bloque posterior.',
      priority: FindingPriority.LOW,
      status: 'OPEN',
      responsible: '',
      dueDate: '',
      createdAt: new Date().toISOString(),
    });

    // ══════════════════════════════════════════════════════════
    // Cálculo del porcentaje total
    // ══════════════════════════════════════════════════════════

    const rawScore =
      (sstScore * sstWeight) / 100 +
      (inductionScore * inductionWeight) / 100 +
      (evaluationScore * evaluationWeight) / 100 +
      (policyScore * policyWeight) / 100;

    const percentage = Math.round(rawScore);

    // ── Status ──
    const status =
      totalContracts === 0 && cancelledContracts === 0
        ? 'NO_DATA'
        : percentage >= ContractingProvider.COMPLIANCE_TARGET
          ? 'TARGET_MET'
          : 'TARGET_NOT_MET';

    return {
      module: 'contracting',
      percentage,
      status,
      findings,
      pending,
      completed,
      overdue: 0,
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }

  /**
   * Obtiene la cantidad de contratos activos que tienen al menos una evaluación.
   * Utiliza agregación para obtener contractIds únicos de evaluaciones y luego
   * cruza con contratos activos.
   */
  private async getContractsWithEvaluation(companyObjectId: Types.ObjectId): Promise<number> {
    // Obtener contractIds únicos que tienen al menos una evaluación
    const evaluatedContractIds = await this.evaluationModel
      .distinct('contractId', { companyId: companyObjectId })
      .exec();

    if (evaluatedContractIds.length === 0) {
      return 0;
    }

    // Contar cuántos de esos contractIds son contratos activos
    const count = await this.contractModel
      .countDocuments({
        companyId: companyObjectId,
        status: ContractStatus.ACTIVE,
        _id: { $in: evaluatedContractIds },
      })
      .exec();

    return count;
  }
}
