import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { DocumentMasterService } from '../../document-management/services/document-master.service';
import { DocumentRetentionService } from '../../document-management/services/document-retention.service';
import { DocumentMaster, DocumentStatus } from '../../document-management/schemas/document-master.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { classifyComplianceLevel } from '../utils/compliance-score';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Evaluación automática del estándar 2.5.1 "Conservación documental".
 *
 * Conecta PHVA 2.5.1 con el dominio DocumentMaster para evaluar:
 * - Documentos vigentes vs. vencidos
 * - Reglas de retención
 * - Porcentaje de cumplimiento documental
 *
 * Semántica:
 * - VIGENTE: status ∈ {ACTIVE, APPROVED} y (expirationDate >= now o sin fecha)
 * - VENCIDO: status ∈ {ACTIVE, APPROVED} y expirationDate < now
 * - ARCHIVADO: status === ARCHIVED (no afecta cumplimiento)
 * - OBSOLETE: status === OBSOLETE (no afecta cumplimiento)
 *
 * NO_DATA: no existen documentos → 0% con status NO_DATA
 * CALCULATED: existen documentos → porcentaje calculado
 * TARGET_MET: percentage >= 90 (misma meta que IND-10)
 * TARGET_NOT_MET: percentage < 90
 */
@Injectable()
export class DocumentEvaluationProvider implements ComplianceProvider {
  /** Meta de cumplimiento documental — alineada con IND-10 (GTE 90). */
  private static readonly COMPLIANCE_TARGET = 90;

  constructor(
    private readonly documentMasterService: DocumentMasterService,
    private readonly retentionService: DocumentRetentionService,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);
    const documents = await this.documentMasterService.findAll(companyObjectId);

    if (documents.length === 0) {
      return {
        module: 'document-evaluation',
        percentage: 0,
        status: 'NO_DATA',
        findings: [],
        pending: 0,
        completed: 0,
      };
    }

    const now = new Date();
    let validCount = 0;
    let expiredCount = 0;
    let expiringSoonCount = 0;
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    for (const doc of documents) {
      // Solo documentos con status ACTIVE o APPROVED cuentan para evaluación
      if (
        doc.status !== DocumentStatus.ACTIVE &&
        doc.status !== DocumentStatus.APPROVED
      ) {
        continue;
      }

      const expirationDate = doc.expirationDate;

      if (!expirationDate) {
        // Sin fecha de vencimiento → se considera vigente
        validCount++;
        continue;
      }

      if (expirationDate < now) {
        expiredCount++;
      } else if (expirationDate <= thirtyDaysFromNow) {
        expiringSoonCount++;
        validCount++; // Próximo a vencer pero aún vigente
      } else {
        validCount++;
      }
    }

    const eligible = validCount + expiredCount;
    const percentage =
      eligible > 0 ? Math.round((validCount / eligible) * 100) : 0;

    const findings = [];

    // Generar findings para documentos vencidos
    const expiredDocs = documents.filter(
      (doc) =>
        doc.expirationDate &&
        doc.expirationDate < now &&
        (doc.status === DocumentStatus.ACTIVE ||
          doc.status === DocumentStatus.APPROVED),
    );

    for (let i = 0; i < expiredDocs.length; i++) {
      const doc = expiredDocs[i];
      findings.push({
        id: `doc-eval-expired-${i}`,
        module: 'document-evaluation',
        title: `Documento vencido: ${doc.code} — ${doc.name}`,
        description: `Vencimiento: ${doc.expirationDate!.toISOString()}. Requiere actualización para cumplimiento de 2.5.1.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: doc.expirationDate!.toISOString(),
        createdAt: doc.createdAt
          ? doc.createdAt.toISOString()
          : new Date().toISOString(),
      });
    }

    // Generar findings para documentos próximos a vencer
    const expiringDocs = documents.filter(
      (doc) =>
        doc.expirationDate &&
        doc.expirationDate > now &&
        doc.expirationDate <= thirtyDaysFromNow &&
        (doc.status === DocumentStatus.ACTIVE ||
          doc.status === DocumentStatus.APPROVED),
    );

    for (let i = 0; i < expiringDocs.length; i++) {
      const doc = expiringDocs[i];
      findings.push({
        id: `doc-eval-expiring-${i}`,
        module: 'document-evaluation',
        title: `Documento próximo a vencer: ${doc.code} — ${doc.name}`,
        description: `Vencimiento: ${doc.expirationDate!.toISOString()}. Considere actualizar antes de la fecha límite.`,
        priority: FindingPriority.LOW,
        status: 'OPEN',
        responsible: '',
        dueDate: doc.expirationDate!.toISOString(),
        createdAt: doc.createdAt
          ? doc.createdAt.toISOString()
          : new Date().toISOString(),
      });
    }

    const status = this.classifyStatus(percentage, eligible);

    return {
      module: 'document-evaluation',
      percentage,
      status,
      findings,
      pending: expiredCount + expiringSoonCount,
      completed: validCount,
    };
  }

  /**
   * Clasifica el estado de evaluación de 2.5.1.
   *
   * - NO_DATA: no hay documentos elegibles
   * - TARGET_MET: percentage >= 90%
   * - TARGET_NOT_MET: percentage < 90%
   */
  private classifyStatus(
    percentage: number,
    eligible: number,
  ): string {
    if (eligible === 0) return 'NO_DATA';
    if (
      percentage >= DocumentEvaluationProvider.COMPLIANCE_TARGET
    )
      return 'TARGET_MET';
    return 'TARGET_NOT_MET';
  }
}
