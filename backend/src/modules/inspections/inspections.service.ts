import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateInspectionActivityDto } from './dto/create-inspection-activity.dto';
import { UpdateInspectionActivityDto } from './dto/update-inspection-activity.dto';
import { InspectionActivity, InspectionActivityDocument } from './schemas/inspection-activity.schema';

@Injectable()
export class InspectionsService {
  constructor(
    @InjectModel(InspectionActivity.name)
    private readonly inspectionActivityModel: Model<InspectionActivityDocument>,
  ) {}

  async create(companyId: Types.ObjectId, dto: CreateInspectionActivityDto): Promise<InspectionActivity> {
    const created = new this.inspectionActivityModel({ ...dto, companyId });
    return created.save();
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

    return activity;
  }

  async remove(id: string, companyId: Types.ObjectId): Promise<void> {
    const deletedActivity = await this.inspectionActivityModel.findOneAndDelete({ _id: id, companyId }).exec();

    if (!deletedActivity) {
      throw new NotFoundException(`Inspection activity with id ${id} not found`);
    }
  }
}
