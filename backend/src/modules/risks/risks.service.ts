import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateRiskDto } from './dto/create-risk.dto';
import { UpdateRiskDto } from './dto/update-risk.dto';
import { Risk, RiskDocument } from './schemas/risk.schema';

@Injectable()
export class RisksService {
  constructor(
    @InjectModel(Risk.name)
    private readonly riskModel: Model<RiskDocument>,
  ) {}

  async create(companyId: Types.ObjectId, dto: CreateRiskDto): Promise<Risk> {
    const created = new this.riskModel({ ...dto, companyId });
    return created.save();
  }

  async findAll(companyId: Types.ObjectId): Promise<Risk[]> {
    return this.riskModel.find({ companyId }).sort({ createdAt: -1 }).exec();
  }

  async findOne(id: string, companyId: Types.ObjectId): Promise<Risk> {
    const risk = await this.riskModel.findOne({ _id: id, companyId }).exec();

    if (!risk) {
      throw new NotFoundException(`Risk with id ${id} not found`);
    }

    return risk;
  }

  async update(id: string, companyId: Types.ObjectId, dto: UpdateRiskDto): Promise<Risk> {
    const risk = await this.riskModel
      .findOneAndUpdate({ _id: id, companyId }, dto, { new: true, runValidators: true })
      .exec();

    if (!risk) {
      throw new NotFoundException(`Risk with id ${id} not found`);
    }

    return risk;
  }

  async remove(id: string, companyId: Types.ObjectId): Promise<void> {
    const deletedRisk = await this.riskModel.findOneAndDelete({ _id: id, companyId }).exec();

    if (!deletedRisk) {
      throw new NotFoundException(`Risk with id ${id} not found`);
    }
  }
}
