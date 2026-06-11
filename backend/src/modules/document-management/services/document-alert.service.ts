import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AlertsService } from '../../alerts/alerts.service';
import { AlertSeverity } from '../../alerts/schemas/alert.schema';
import { DocumentMaster, DocumentMasterDocument, DocumentStatus } from '../schemas/document-master.schema';
import { DocumentRetentionService } from './document-retention.service';

@Injectable()
export class DocumentAlertService {
  constructor(
    @InjectModel(DocumentMaster.name)
    private readonly documentMasterModel: Model<DocumentMasterDocument>,
    private readonly alertsService: AlertsService,
    private readonly retentionService: DocumentRetentionService,
  ) {}

  async checkExpirationAlerts(companyId: Types.ObjectId): Promise<void> {
    const alertDays = [60, 30, 15, 5, 1];

    for (const days of alertDays) {
      await this.generateExpirationAlerts(companyId, days);
    }

    await this.generateExpiredAlerts(companyId);
  }

  private async generateExpirationAlerts(companyId: Types.ObjectId, daysBefore: number): Promise<void> {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysBefore);

    const documents = await this.documentMasterModel
      .find({
        companyId,
        status: DocumentStatus.ACTIVE,
        expirationDate: {
          $gte: new Date(targetDate.getTime() - 24 * 60 * 60 * 1000),
          $lte: new Date(targetDate.getTime() + 24 * 60 * 60 * 1000),
        },
      })
      .exec();

    for (const doc of documents) {
      const severity = daysBefore <= 5 ? AlertSeverity.HIGH : daysBefore <= 15 ? AlertSeverity.MEDIUM : AlertSeverity.LOW;

      await this.alertsService.createUnique({
        companyId,
        type: 'DOCUMENT_EXPIRATION',
        message: `El documento "${doc.name}" (${doc.code}) vence en ${daysBefore} días.`,
        severity,
      });
    }
  }

  private async generateExpiredAlerts(companyId: Types.ObjectId): Promise<void> {
    const expiredDocs = await this.retentionService.getExpiredDocuments(companyId);

    for (const doc of expiredDocs) {
      await this.alertsService.createUnique({
        companyId,
        type: 'DOCUMENT_EXPIRED',
        message: `El documento "${doc.name}" (${doc.code}) ha vencido. Se requiere acción inmediata.`,
        severity: AlertSeverity.HIGH,
      });
    }
  }

  async checkDocumentStatusAlerts(companyId: Types.ObjectId): Promise<void> {
    const pendingApprovals = await this.documentMasterModel
      .find({
        companyId,
        status: DocumentStatus.PENDING_APPROVAL,
      })
      .countDocuments()
      .exec();

    if (pendingApprovals > 0) {
      await this.alertsService.createUnique({
        companyId,
        type: 'DOCUMENT_PENDING_APPROVAL',
        message: `Hay ${pendingApprovals} documento(s) pendientes de aprobación gerencial.`,
        severity: AlertSeverity.MEDIUM,
      });
    }

    const activeDocuments = await this.documentMasterModel
      .find({
        companyId,
        status: DocumentStatus.ACTIVE,
        isActive: true,
      })
      .countDocuments()
      .exec();

    if (activeDocuments > 0) {
      await this.alertsService.createUnique({
        companyId,
        type: 'DOCUMENT_ACTIVE_COUNT',
        message: `La compañía tiene ${activeDocuments} documento(s) activo(s) en el repositorio.`,
        severity: AlertSeverity.LOW,
      });
    }
  }
}
