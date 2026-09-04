import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { DocumentMasterService } from '../../../document-management/services/document-master.service';
import {
  StandardEvidenceAdapter,
  StandardEvidenceContext,
  EvidenceFinding,
} from './standard-evidence.adapter';

/**
 * Funciones de consulta inyectadas para obtener conteos de adquisiciones y
 * proveedores. Separadas del adapter para:
 * 1. Evitar importar schemas de Acquisition/Supplier (dependencia circular).
 * 2. Facilitar testing con mocks ligeros.
 * 3. Mantener el adapter desacoplado de modelos externos.
 */
export interface AcquisitionCountQueries {
  countByCompany(companyId: Types.ObjectId): Promise<number>;
  getApprovalMetrics?(companyId: Types.ObjectId): Promise<{
    totalPending: number;
    totalApproved: number;
    totalRejected: number;
  }>;
}

export interface SupplierCountQueries {
  countByCompany(companyId: Types.ObjectId): Promise<number>;
}

/**
 * Adapter de evidencia documental para el estándar 2.9.1 — Adquisiciones.
 *
 * Consulta DocumentMaster y conteos de adquisiciones/proveedores
 * para construir un contexto de evidencia agregado.
 *
 * Tenant-safe: todas las queries filtran por companyId.
 * Sin PII: solo métricas y conteos.
 * NO modifica scoring: la evidencia es contexto, no cálculo.
 */
@Injectable()
export class AcquisitionEvidenceAdapter implements StandardEvidenceAdapter {
  private static readonly STANDARD_CODE = '2.9.1';
  private readonly logger = new Logger(AcquisitionEvidenceAdapter.name);

  constructor(
    private readonly documentMasterService: DocumentMasterService,
    private readonly acquisitionQueries: AcquisitionCountQueries,
    private readonly supplierQueries: SupplierCountQueries,
  ) {}

  supports(standardCode: string): boolean {
    return standardCode === AcquisitionEvidenceAdapter.STANDARD_CODE;
  }

  async getEvidenceContext(companyId: Types.ObjectId | string): Promise<StandardEvidenceContext> {
    const companyObjectId =
      typeof companyId === 'string' ? new Types.ObjectId(companyId) : companyId;

    try {
      return await this.buildContext(companyObjectId);
    } catch (error) {
      this.logger.warn(
        `Error building evidence context for ${companyObjectId}: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      return this.emptyContext(companyObjectId);
    }
  }

  private async buildContext(companyId: Types.ObjectId): Promise<StandardEvidenceContext> {
    // ── 1. Documentos con standardCode = '2.9.1' ──
    const docStats = await this.documentMasterService.countByStandardCode(
      companyId,
      AcquisitionEvidenceAdapter.STANDARD_CODE,
    );

    // ── 2. Adquisiciones totales ──
    const totalAcquisitions = await this.acquisitionQueries.countByCompany(companyId);

    // ── 3. Proveedores totales ──
    const totalSuppliers = await this.supplierQueries.countByCompany(companyId);

    // ── 4. Adquisiciones con documentos vinculados (por acquisitionId) ──
    const acqIdsWithDocs = await this.documentMasterService.findAcquisitionIdsWithDocuments(companyId);
    const acquisitionsWithDocuments = acqIdsWithDocs.length;

    // ── 5. Proveedores con documentos vinculados (por supplierId) ──
    const supplierIdsWithDocs = await this.documentMasterService.findSupplierIdsWithDocuments(companyId);
    const suppliersWithDocuments = supplierIdsWithDocs.length;

    // ── 6. Cálculos ──
    const acquisitionsWithoutDocuments = Math.max(0, totalAcquisitions - acquisitionsWithDocuments);
    const suppliersWithoutDocuments = Math.max(0, totalSuppliers - suppliersWithDocuments);

    const documentCoveragePercentage =
      totalAcquisitions > 0
        ? Math.round((acquisitionsWithDocuments / totalAcquisitions) * 100)
        : 0;

    // ── 7. Métricas de aprobación ──
    let approvalMetrics: StandardEvidenceContext['approvalMetrics'];
    if (this.acquisitionQueries.getApprovalMetrics) {
      try {
        approvalMetrics = await this.acquisitionQueries.getApprovalMetrics(companyId);
      } catch {
        // Si getApprovalMetrics no está disponible, omitir silenciosamente
      }
    }

    // ── 8. Hallazgos ──
    const evidenceFindings = this.buildFindings({
      totalDocuments: docStats.total,
      activeDocuments: docStats.active,
      expiredDocuments: docStats.expired,
      expiringDocuments: docStats.expiringSoon,
      pendingApprovalDocuments: docStats.pendingApproval,
      totalAcquisitions,
      acquisitionsWithDocuments,
      totalSuppliers,
      suppliersWithDocuments,
      totalPending: approvalMetrics?.totalPending ?? 0,
      totalRejected: approvalMetrics?.totalRejected ?? 0,
    });

    return {
      standardCode: AcquisitionEvidenceAdapter.STANDARD_CODE,
      companyId: companyId.toString(),
      totalDocuments: docStats.total,
      activeDocuments: docStats.active,
      expiredDocuments: docStats.expired,
      expiringDocuments: docStats.expiringSoon,
      pendingApprovalDocuments: docStats.pendingApproval,
      acquisitionsWithDocuments,
      acquisitionsWithoutDocuments,
      suppliersWithDocuments,
      suppliersWithoutDocuments,
      documentCoveragePercentage,
      evidenceFindings,
      ...(approvalMetrics ? { approvalMetrics } : {}),
    };
  }

  private buildFindings(data: {
    totalDocuments: number;
    activeDocuments: number;
    expiredDocuments: number;
    expiringDocuments: number;
    pendingApprovalDocuments: number;
    totalAcquisitions: number;
    acquisitionsWithDocuments: number;
    totalSuppliers: number;
    suppliersWithDocuments: number;
    totalPending?: number;
    totalRejected?: number;
  }): EvidenceFinding[] {
    const findings: EvidenceFinding[] = [];

    // Sin documentos de evidencia
    if (data.totalDocuments === 0 && data.totalAcquisitions > 0) {
      findings.push({
        id: 'evidence-no-documents',
        type: 'no_documents',
        description:
          'No existen documentos de evidencia registrados para el estándar 2.9.1. ' +
          'Registrar documentos de soporte (contratos, cotizaciones, evaluaciones) para mejorar la trazabilidad.',
      });
    }

    // Documentos vencidos
    if (data.expiredDocuments > 0) {
      findings.push({
        id: 'evidence-expired',
        type: 'expired_document',
        description:
          `${data.expiredDocuments} documento(s) de evidencia han vencido. ` +
          'Renovar o actualizar los documentos para mantener la vigencia.',
      });
    }

    // Documentos por vencer
    if (data.expiringDocuments > 0) {
      findings.push({
        id: 'evidence-expiring',
        type: 'expiring_soon',
        description:
          `${data.expiringDocuments} documento(s) de evidencia vencerán pronto. ` +
          'Planificar la renovación antes de la fecha de vencimiento.',
      });
    }

    // Documentos pendientes de aprobación
    if (data.pendingApprovalDocuments > 0) {
      findings.push({
        id: 'evidence-pending-approval',
        type: 'pending_approval',
        description:
          `${data.pendingApprovalDocuments} documento(s) de evidencia están pendientes de aprobación. ` +
          'Completar el flujo de aprobación para que los documentos queden vigentes.',
      });
    }

    // Adquisiciones sin evidencia
    if (data.totalAcquisitions > 0 && data.acquisitionsWithDocuments === 0) {
      findings.push({
        id: 'evidence-no-acquisition-evidence',
        type: 'missing_evidence',
        description:
          'Ninguna adquisición tiene documentos de evidencia vinculados. ' +
          'Asociar documentos de soporte a las adquisiciones para mejorar la trazabilidad.',
      });
    } else if (data.acquisitionsWithDocuments > 0 && data.acquisitionsWithDocuments < data.totalAcquisitions) {
      const withoutEvidence = data.totalAcquisitions - data.acquisitionsWithDocuments;
      findings.push({
        id: 'evidence-partial-acquisition-evidence',
        type: 'missing_evidence',
        description:
          `${withoutEvidence} adquisición(es) no tienen documentos de evidencia vinculados. ` +
          'Completar la documentación de soporte para todas las adquisiciones.',
      });
    }

    // Adquisiciones pendientes de aprobación
    if ((data.totalPending ?? 0) > 0) {
      findings.push({
        id: 'approval-pending',
        type: 'pending_approval',
        description:
          `${data.totalPending} adquisición(es) están pendientes de aprobación administrativa. ` +
          'Completar el flujo de aprobación para formalizar la gestión.',
      });
    }

    // Adquisiciones rechazadas
    if ((data.totalRejected ?? 0) > 0) {
      findings.push({
        id: 'approval-rejected',
        type: 'missing_evidence',
        description:
          `${data.totalRejected} adquisición(es) fueron rechazadas en el flujo de aprobación. ` +
          'Revisar los motivos de rechazo y corregir antes de reenviar.',
      });
    }

    return findings;
  }

  private emptyContext(companyId: Types.ObjectId): StandardEvidenceContext {
    return {
      standardCode: AcquisitionEvidenceAdapter.STANDARD_CODE,
      companyId: companyId.toString(),
      totalDocuments: 0,
      activeDocuments: 0,
      expiredDocuments: 0,
      expiringDocuments: 0,
      pendingApprovalDocuments: 0,
      acquisitionsWithDocuments: 0,
      acquisitionsWithoutDocuments: 0,
      suppliersWithDocuments: 0,
      suppliersWithoutDocuments: 0,
      documentCoveragePercentage: 0,
      evidenceFindings: [],
    };
  }
}
