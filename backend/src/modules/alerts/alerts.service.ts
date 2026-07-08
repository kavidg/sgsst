import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateAlertDto } from './dto/create-alert.dto';
import { AlertsGateway } from './alerts.gateway';
import { Alert, AlertDocument, AlertSeverity } from './schemas/alert.schema';

@Injectable()
export class AlertsService {
  constructor(
    @InjectModel(Alert.name)
    private readonly alertModel: Model<AlertDocument>,
    private readonly alertsGateway: AlertsGateway,
  ) {}

  async create(dto: CreateAlertDto): Promise<Alert> {
    return this.createUnique({
      companyId: new Types.ObjectId(dto.companyId),
      type: dto.type,
      message: dto.message,
      severity: dto.severity,
      targetUserId: dto.targetUserId ? new Types.ObjectId(dto.targetUserId) : undefined,
      actionUrl: dto.actionUrl,
      moduleCode: dto.moduleCode,
      moduleName: dto.moduleName,
      submittedBy: dto.submittedBy,
      submittedAt: dto.submittedAt ? new Date(dto.submittedAt) : undefined,
      documentId: dto.documentId,
    });
  }

  async createUnique(params: {
    companyId: Types.ObjectId;
    type: string;
    message: string;
    severity: AlertSeverity;
    targetUserId?: Types.ObjectId;
    actionUrl?: string;
    moduleCode?: string;
    moduleName?: string;
    submittedBy?: string;
    submittedAt?: Date;
    documentId?: string;
  }): Promise<Alert> {
    const existingAlert = await this.alertModel
      .findOne({
        companyId: params.companyId,
        type: params.type,
        message: params.message,
      })
      .exec();

    if (existingAlert) {
      return existingAlert;
    }

    try {
      const createdAlert = await this.alertModel.create({
        companyId: params.companyId,
        type: params.type,
        message: params.message,
        severity: params.severity,
        isRead: false,
        targetUserId: params.targetUserId,
        actionUrl: params.actionUrl,
        moduleCode: params.moduleCode,
        moduleName: params.moduleName,
        submittedBy: params.submittedBy,
        submittedAt: params.submittedAt,
        documentId: params.documentId,
      });

      this.alertsGateway.emitNewAlert({
        companyId: createdAlert.companyId.toString(),
        message: createdAlert.message,
        severity: createdAlert.severity,
        actionUrl: createdAlert.actionUrl,
        targetUserId: createdAlert.targetUserId?.toString(),
      });

      return createdAlert;
    } catch {
      return this.alertModel
        .findOne({
          companyId: params.companyId,
          type: params.type,
          message: params.message,
        })
        .orFail()
        .exec();
    }
  }

  async findByCompany(companyId: string): Promise<Alert[]> {
    return this.alertModel
      .find({ companyId: new Types.ObjectId(companyId) })
      .sort({ isRead: 1, createdAt: -1 })
      .exec();
  }

  async findByCompanyAndUser(companyId: string, userId: string): Promise<Alert[]> {
    const companyObjectId = new Types.ObjectId(companyId);
    return this.alertModel
      .find({
        companyId: companyObjectId,
        $or: [
          { targetUserId: new Types.ObjectId(userId) },
          { targetUserId: { $exists: false } },
        ],
      })
      .sort({ isRead: 1, createdAt: -1 })
      .exec();
  }

  async markAsRead(id: string): Promise<Alert> {
    const alert = await this.alertModel.findByIdAndUpdate(id, { isRead: true }, { new: true }).exec();

    if (!alert) {
      throw new NotFoundException(`Alert with id ${id} not found`);
    }

    return alert;
  }

  async remove(id: string): Promise<void> {
    const deleted = await this.alertModel.findByIdAndDelete(id).exec();

    if (!deleted) {
      throw new NotFoundException(`Alert with id ${id} not found`);
    }
  }
}
