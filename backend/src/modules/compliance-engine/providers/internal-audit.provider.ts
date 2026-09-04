import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { DocumentMasterService } from '../../document-management/services/document-master.service';
import { DocumentType, DocumentStatus } from '../../document-management/schemas/document-master.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Evaluación automática del estándar 6.1.3
 * "Auditoría interna SG-SST".
 *
 * Evalúa si existen auditorías internas documentadas y ejecutadas.
 *
 * Fuente de datos: DocumentMaster (documentType = AUDIT)
 *
 * Criterios (25/25/25/25):
 * - Existencia de auditorías:          25%
 * - Auditorías ejecutadas/completadas: 25%
 * - Auditorías vigentes:               25%
 * - Auditorías con responsable:        25%
 *
 * NOTA: Contribuye a phases.check (VERIFICAR).
 */
@Injectable()
export class InternalAuditProvider implements ComplianceProvider {
  private static readonly MODULE = 'internal-audit';
  private static readonly COMPLIANCE_TARGET = 90;

  constructor(
    private readonly documentMasterService: DocumentMasterService,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const allDocs = await this.documentMasterService.findAll(new Types.ObjectId(companyId));
    const audits = allDocs.filter((d) => d.documentType === DocumentType.AUDIT);

    if (audits.length === 0) {
      return {
        module: InternalAuditProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: [{
          id: 'internal-audit-no-data',
          module: InternalAuditProvider.MODULE,
          title: 'Sin auditorías internas SG-SST',
          description: 'No existen documentos clasificados como auditoría. El estándar 6.1.3 requiere programación y ejecución de auditorías internas.',
          priority: FindingPriority.HIGH,
          status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
        }],
        pending: 0, completed: 0,
        phases: { check: 0 } as Partial<Record<CompliancePhaseKey, number>>,
      };
    }

    const total = audits.length;
    const now = new Date();

    // Criterion 1: Existence (25%)
    const existenceScore = 1;

    // Criterion 2: Completed/active audits (25%)
    const completed = audits.filter(
      (d) => d.status === DocumentStatus.ACTIVE || d.status === DocumentStatus.APPROVED,
    ).length;
    const completedScore = completed / total;

    // Criterion 3: Not expired (25%)
    const notExpired = audits.filter(
      (d) => !d.expirationDate || d.expirationDate.getTime() >= now.getTime(),
    ).length;
    const expiryScore = notExpired / total;

    // Criterion 4: Has responsible/owner (25%)
    const withOwner = audits.filter(
      (d) => d.ownerUser && d.ownerUser.toString().length > 0,
    ).length;
    const ownerScore = withOwner / total;

    const percentage = Math.round(
      existenceScore * 25 +
      completedScore * 25 +
      expiryScore * 25 +
      ownerScore * 25,
    );

    const findings: ProviderComplianceResult['findings'] = [];

    const inactive = total - completed;
    if (inactive > 0) {
      findings.push({
        id: 'internal-audit-not-completed',
        module: InternalAuditProvider.MODULE,
        title: `${inactive} auditoría(s) no completada(s)`,
        description: `${inactive} de ${total} auditorías no tienen estado ACTIVE o APPROVED.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    const expired = total - notExpired;
    if (expired > 0) {
      findings.push({
        id: 'internal-audit-overdue',
        module: InternalAuditProvider.MODULE,
        title: `${expired} auditoría(s) vencida(s)`,
        description: `${expired} auditorías han pasado su fecha de expiración.`,
        priority: FindingPriority.HIGH,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    const withoutOwner = total - withOwner;
    if (withoutOwner > 0) {
      findings.push({
        id: 'internal-audit-no-responsible',
        module: InternalAuditProvider.MODULE,
        title: `${withoutOwner} auditoría(s) sin responsable`,
        description: `${withoutOwner} auditorías no tienen responsable/owner asignado.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN', responsible: '', dueDate: '', createdAt: new Date().toISOString(),
      });
    }

    return {
      module: InternalAuditProvider.MODULE,
      percentage,
      status: percentage >= InternalAuditProvider.COMPLIANCE_TARGET ? 'TARGET_MET' : 'TARGET_NOT_MET',
      findings,
      pending: inactive + expired,
      completed,
      phases: { check: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }
}
