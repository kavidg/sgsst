import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { DocumentMasterService } from '../../document-management/services/document-master.service';
import { DocumentMaster, DocumentStatus } from '../../document-management/schemas/document-master.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { classifyComplianceLevel } from '../utils/compliance-score';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Cumplimiento documental: proporción de documentos activos/aprobados y
 * detección de documentos vencidos.
 */
@Injectable()
export class DocumentsProvider implements ComplianceProvider {
  constructor(private readonly documentMasterService: DocumentMasterService) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const documents = await this.documentMasterService.findAll(new Types.ObjectId(companyId));
    const compliant = documents.filter((doc) => this.isCompliant(doc)).length;
    const percentage = documents.length > 0 ? Math.round((compliant / documents.length) * 100) : 0;

    const now = new Date();
    const expired = documents.filter(
      (doc) =>
        doc.expirationDate &&
        doc.expirationDate < now &&
        doc.status !== DocumentStatus.OBSOLETE &&
        doc.status !== DocumentStatus.ARCHIVED,
    );

    const findings = expired.map((doc, index) => ({
      id: `document-${index}`,
      module: 'documents',
      title: `Documento vencido: ${doc.code} - ${doc.name}`,
      description: `Vencimiento: ${doc.expirationDate?.toISOString()}. Requiere actualización.`,
      priority: FindingPriority.MEDIUM,
      status: 'OPEN',
      responsible: '',
      dueDate: doc.expirationDate?.toISOString() ?? '',
      createdAt: doc.createdAt ? doc.createdAt.toISOString() : new Date().toISOString(),
    }));

    return {
      module: 'documents',
      percentage,
      status: classifyComplianceLevel(percentage),
      findings,
      pending: documents.length - compliant,
      completed: compliant,
    };
  }

  private isCompliant(doc: DocumentMaster): boolean {
    return doc.status === DocumentStatus.ACTIVE || doc.status === DocumentStatus.APPROVED;
  }
}
