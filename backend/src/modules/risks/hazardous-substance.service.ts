import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateHazardousSubstanceDto } from './dto/create-hazardous-substance.dto';
import { UpdateHazardousSubstanceDto } from './dto/update-hazardous-substance.dto';
import {
  HazardousSubstance,
  HazardousSubstanceDocument,
} from './schemas/hazardous-substance.schema';
import { Risk, RiskDocument } from './schemas/risk.schema';

@Injectable()
export class HazardousSubstanceService {
  constructor(
    @InjectModel(HazardousSubstance.name)
    private readonly substanceModel: Model<HazardousSubstanceDocument>,
    @InjectModel(Risk.name)
    private readonly riskModel: Model<RiskDocument>,
  ) {}

  async create(
    companyId: Types.ObjectId,
    dto: CreateHazardousSubstanceDto,
  ): Promise<HazardousSubstance> {
    await this.validateReferences(companyId, dto);
    const created = new this.substanceModel({ ...dto, companyId });
    return created.save();
  }

  async findAll(companyId: Types.ObjectId): Promise<HazardousSubstance[]> {
    return this.substanceModel
      .find({ companyId })
      .populate('riskId', 'process activity hazard risk riskLevel')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(
    id: string,
    companyId: Types.ObjectId,
  ): Promise<HazardousSubstance> {
    const substance = await this.substanceModel
      .findOne({ _id: id, companyId })
      .populate('riskId', 'process activity hazard risk riskLevel')
      .exec();

    if (!substance) {
      throw new NotFoundException(
        `Hazardous substance with id ${id} not found`,
      );
    }

    return substance;
  }

  async update(
    id: string,
    companyId: Types.ObjectId,
    dto: UpdateHazardousSubstanceDto,
  ): Promise<HazardousSubstance> {
    await this.validateReferences(companyId, dto);

    const substance = await this.substanceModel
      .findOneAndUpdate({ _id: id, companyId }, dto, {
        new: true,
        runValidators: true,
      })
      .populate('riskId', 'process activity hazard risk riskLevel')
      .exec();

    if (!substance) {
      throw new NotFoundException(
        `Hazardous substance with id ${id} not found`,
      );
    }

    return substance;
  }

  async remove(id: string, companyId: Types.ObjectId): Promise<void> {
    const deleted = await this.substanceModel
      .findOneAndDelete({ _id: id, companyId })
      .exec();

    if (!deleted) {
      throw new NotFoundException(
        `Hazardous substance with id ${id} not found`,
      );
    }
  }

  /**
   * Valida que todas las referencias (riskId) pertenezcan al mismo tenant.
   */
  private async validateReferences(
    companyId: Types.ObjectId,
    dto: CreateHazardousSubstanceDto | UpdateHazardousSubstanceDto,
  ): Promise<void> {
    const data = dto as Record<string, unknown>;

    // Validar riskId si se proporciona
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
