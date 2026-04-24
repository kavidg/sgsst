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
    });
  }

  async createUnique(params: {
    companyId: Types.ObjectId;
    type: string;
    message: string;
    severity: AlertSeverity;
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
      });

      this.alertsGateway.emitNewAlert({
        companyId: createdAlert.companyId.toString(),
        message: createdAlert.message,
        severity: createdAlert.severity,
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
