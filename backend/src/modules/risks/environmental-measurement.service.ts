import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateEnvironmentalMeasurementDto } from './dto/create-environmental-measurement.dto';
import { UpdateEnvironmentalMeasurementDto } from './dto/update-environmental-measurement.dto';
import {
  EnvironmentalMeasurement,
  EnvironmentalMeasurementDocument,
} from './schemas/environmental-measurement.schema';
import { Risk, RiskDocument } from './schemas/risk.schema';

@Injectable()
export class EnvironmentalMeasurementService {
  constructor(
    @InjectModel(EnvironmentalMeasurement.name)
    private readonly measurementModel: Model<EnvironmentalMeasurementDocument>,
    @InjectModel(Risk.name)
    private readonly riskModel: Model<RiskDocument>,
  ) {}

  async create(
    companyId: Types.ObjectId,
    dto: CreateEnvironmentalMeasurementDto,
  ): Promise<EnvironmentalMeasurement> {
    await this.validateReferences(companyId, dto);
    const created = new this.measurementModel({ ...dto, companyId });
    return created.save();
  }

  async findAll(companyId: Types.ObjectId): Promise<EnvironmentalMeasurement[]> {
    return this.measurementModel
      .find({ companyId })
      .populate('riskId', 'process activity hazard risk riskLevel')
      .sort({ measurementDate: -1 })
      .exec();
  }

  async findOne(
    id: string,
    companyId: Types.ObjectId,
  ): Promise<EnvironmentalMeasurement> {
    const measurement = await this.measurementModel
      .findOne({ _id: id, companyId })
      .populate('riskId', 'process activity hazard risk riskLevel')
      .exec();

    if (!measurement) {
      throw new NotFoundException(
        `Environmental measurement with id ${id} not found`,
      );
    }

    return measurement;
  }

  async update(
    id: string,
    companyId: Types.ObjectId,
    dto: UpdateEnvironmentalMeasurementDto,
  ): Promise<EnvironmentalMeasurement> {
    await this.validateReferences(companyId, dto);

    const measurement = await this.measurementModel
      .findOneAndUpdate({ _id: id, companyId }, dto, {
        new: true,
        runValidators: true,
      })
      .populate('riskId', 'process activity hazard risk riskLevel')
      .exec();

    if (!measurement) {
      throw new NotFoundException(
        `Environmental measurement with id ${id} not found`,
      );
    }

    return measurement;
  }

  async remove(id: string, companyId: Types.ObjectId): Promise<void> {
    const deleted = await this.measurementModel
      .findOneAndDelete({ _id: id, companyId })
      .exec();

    if (!deleted) {
      throw new NotFoundException(
        `Environmental measurement with id ${id} not found`,
      );
    }
  }

  /**
   * Validates that all references (riskId) belong to the same tenant.
   */
  private async validateReferences(
    companyId: Types.ObjectId,
    dto: CreateEnvironmentalMeasurementDto | UpdateEnvironmentalMeasurementDto,
  ): Promise<void> {
    const data = dto as Record<string, unknown>;

    if (data.riskId) {
      const risk = await this.riskModel
        .findOne({ _id: data.riskId, companyId })
        .exec();
      if (!risk) {
        throw new BadRequestException(
          'Risk not found or does not belong to this company',
        );
      }
    }
  }
}
