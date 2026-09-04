import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { DocumentMasterService } from '../../document-management/services/document-master.service';
import { DocumentMaster, DocumentType, DocumentStatus } from '../../document-management/schemas/document-master.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Evaluación automática del estándar 5.1.1
 * "Procedimientos SG-SST".
 *
 * Evalúa si la empresa cuenta con procedimientos documentales
 * suficientes para soportar la implementación del SG-SST.
 *
 * Fuente de datos: DocumentMaster (documentType ∈ procedure types)
 *
 * Criterios (25/25/25/25):
 * - Existencia de procedimientos:          25%
 * - Procedimientos activos/aprobados:      25%
 * - Procedimientos vigentes (no vencidos): 25%
 * - Procedimientos con responsable:        25%
 *
 * NOTA: Contribuye a phases.do (HACER).
 */
@Injectable()
export class ProceduresDocProvider implements ComplianceProvider {
  private static readonly MODULE = 'procedures-doc';
  private static readonly COMPLIANCE_TARGET = 90;

  /** Document types considered as procedures */
  private static readonly PROCEDURE_TYPES: DocumentType[] = [
    DocumentType.PROCEDURE,
    DocumentType.POLICY,
    DocumentType.MANUAL,
    DocumentType.FORMAT,
  ];

  constructor(
    private readonly documentMasterService: DocumentMasterService,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const allDocs = await this.documentMasterService.findAll(new Types.ObjectId(companyId));

    // Filter to procedure-related documents only
    const procedures = allDocs.filter((d) =>
      ProceduresDocProvider.PROCEDURE_TYPES.includes(d.documentType as DocumentType),
    );

    if (procedures.length === 0) {
      return {
        module: ProceduresDocProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: [{
          id: 'procedures-doc-no-data',
          module: ProceduresDocProvider.MODULE,
          title: 'Sin procedimientos SG-SST registrados',
          description: 'No existen documentos clasificados como procedimientos, políticas, manuales o formatos. El estándar 5.1.1 requiere procedimientos documentales del SG-SST.',
          priority: FindingPriority.HIGH,
          status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
        }],
        pending: 0, completed: 0,
        phases: { do: 0 } as Partial<Record<CompliancePhaseKey, number>>,
      };
    }

    const total = procedures.length;
    const now = new Date();

    // Criterion 1: Existence (25%) — already satisfied since total > 0
    const existenceScore = 1;

    // Criterion 2: Active/Approved status (25%)
    const activeOrApproved = procedures.filter(
      (d) => d.status === DocumentStatus.ACTIVE || d.status === DocumentStatus.APPROVED,
    ).length;
    const statusScore = activeOrApproved / total;

    // Criterion 3: Not expired (25%)
    const notExpired = procedures.filter(
      (d) => !d.expirationDate || d.expirationDate.getTime() >= now.getTime(),
    ).length;
    const expiryScore = notExpired / total;

    // Criterion 4: Has responsible/owner (25%)
    const withOwner = procedures.filter(
      (d) => d.ownerUser && d.ownerUser.toString().length > 0,
    ).length;
    const ownerScore = withOwner / total;

    const percentage = Math.round(
      existenceScore * 25 +
      statusScore * 25 +
      expiryScore * 25 +
      ownerScore * 25,
    );

    // Findings
    const findings: ProviderComplianceResult['findings'] = [];

    const inactive = total - activeOrApproved;
    if (inactive > 0) {
      findings.push({
        id: 'procedures-doc-inactive',
        module: ProceduresDocProvider.MODULE,
        title: `${inactive} procedimiento(s) sin estado activo/aprobado`,
        description: `${inactive} de ${total} procedimientos no tienen estado ACTIVE o APPROVED.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    const expired = procedures.filter(
      (d) => d.expirationDate && d.expirationDate.getTime() < now.getTime(),
    ).length;
    if (expired > 0) {
      findings.push({
        id: 'procedures-doc-expired',
        module: ProceduresDocProvider.MODULE,
        title: `${expired} procedimiento(s) vencido(s)`,
        description: `${expired} procedimientos han pasado su fecha de expiración.`,
        priority: FindingPriority.HIGH,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    const withoutOwner = total - withOwner;
    if (withoutOwner > 0) {
      findings.push({
        id: 'procedures-doc-no-responsible',
        module: ProceduresDocProvider.MODULE,
        title: `${withoutOwner} procedimiento(s) sin responsable`,
        description: `${withoutOwner} procedimientos no tienen responsable/owner asignado.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    return {
      module: ProceduresDocProvider.MODULE,
      percentage,
      status: percentage >= ProceduresDocProvider.COMPLIANCE_TARGET ? 'TARGET_MET' : 'TARGET_NOT_MET',
      findings,
      pending: inactive + expired,
      completed: activeOrApproved,
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }
}
