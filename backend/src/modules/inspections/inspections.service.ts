import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AlertsService } from '../alerts/alerts.service';
import { AlertSeverity } from '../alerts/schemas/alert.schema';
import { CreateInspectionActivityDto } from './dto/create-inspection-activity.dto';
import { UpdateInspectionActivityDto } from './dto/update-inspection-activity.dto';
import { InspectionActivity, InspectionActivityDocument } from './schemas/inspection-activity.schema';

@Injectable()
export class InspectionsService {
  constructor(
    @InjectModel(InspectionActivity.name)
    private readonly inspectionActivityModel: Model<InspectionActivityDocument>,
    private readonly alertsService: AlertsService,
  ) {}

  async create(companyId: Types.ObjectId, dto: CreateInspectionActivityDto): Promise<InspectionActivity> {
    const created = new this.inspectionActivityModel({ ...dto, companyId });
    const saved = await created.save();
    await this.ensureInspectionAlert(saved);
    return saved;
  }

  async findAll(companyId: Types.ObjectId): Promise<InspectionActivity[]> {
    return this.inspectionActivityModel.find({ companyId }).sort({ plannedDate: 1, createdAt: 1 }).exec();
  }

  async findOne(id: string, companyId: Types.ObjectId): Promise<InspectionActivity> {
    const activity = await this.inspectionActivityModel.findOne({ _id: id, companyId }).exec();

    if (!activity) {
      throw new NotFoundException(`Inspection activity with id ${id} not found`);
    }

    return activity;
  }

  async update(
    id: string,
    companyId: Types.ObjectId,
    dto: UpdateInspectionActivityDto,
  ): Promise<InspectionActivity> {
    const activity = await this.inspectionActivityModel
      .findOneAndUpdate({ _id: id, companyId }, dto, { new: true, runValidators: true })
      .exec();

    if (!activity) {
      throw new NotFoundException(`Inspection activity with id ${id} not found`);
    }

    await this.ensureInspectionAlert(activity);
    return activity;
  }


  private async ensureInspectionAlert(activity: InspectionActivity): Promise<void> {
    const rawStatus = activity.status as unknown;
    const isPending =
      rawStatus === false ||
      rawStatus === 'false' ||
      String(rawStatus ?? '').toLowerCase() === 'pendiente';
    const isOverdue = isPending && new Date(activity.plannedDate) < new Date();

    if (!isOverdue) {
      return;
    }

    await this.alertsService.createUnique({
      companyId: activity.companyId,
      type: 'INSPECTION',
      message: `Inspection activity "${activity.title}" is overdue and still pending.`,
      severity: AlertSeverity.MEDIUM,
    });
  }

  async remove(id: string, companyId: Types.ObjectId): Promise<void> {
    const deletedActivity = await this.inspectionActivityModel.findOneAndDelete({ _id: id, companyId }).exec();

    if (!deletedActivity) {
      throw new NotFoundException(`Inspection activity with id ${id} not found`);
    }
  }
}
