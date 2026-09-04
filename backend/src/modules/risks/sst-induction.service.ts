import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { SstInduction, SstInductionDocument } from './schemas/sst-induction.schema';
import { CreateSstInductionDto } from './dto/create-sst-induction.dto';
import { UpdateSstInductionDto } from './dto/update-sst-induction.dto';

@Injectable()
export class SstInductionService {
  constructor(
    @InjectModel(SstInduction.name)
    private readonly inductionModel: Model<SstInductionDocument>,
  ) {}

  async findAll(companyId: Types.ObjectId): Promise<SstInduction[]> {
    return this.inductionModel.find({ companyId }).sort({ date: -1 }).exec();
  }

  async findById(id: string, companyId: Types.ObjectId): Promise<SstInduction> {
    const induction = await this.inductionModel.findById(id).exec();
    if (!induction) throw new NotFoundException('Inducción no encontrada');
    if (induction.companyId.toString() !== companyId.toString()) {
      throw new ForbiddenException('Acceso denegado');
    }
    return induction;
  }

  async create(dto: CreateSstInductionDto, companyId: Types.ObjectId): Promise<SstInduction> {
    return this.inductionModel.create({
      ...dto,
      companyId,
      employee: new Types.ObjectId(dto.employee),
      date: new Date(dto.date),
    });
  }

  async update(id: string, dto: UpdateSstInductionDto, companyId: Types.ObjectId): Promise<SstInduction> {
    const induction = await this.inductionModel.findById(id).exec();
    if (!induction) throw new NotFoundException('Inducción no encontrada');
    if (induction.companyId.toString() !== companyId.toString()) {
      throw new ForbiddenException('Acceso denegado');
    }
    const updateData: Record<string, unknown> = { ...dto };
    const partial = dto as Record<string, unknown>;
    if (partial.employee) updateData.employee = new Types.ObjectId(partial.employee as string);
    if (partial.date) updateData.date = new Date(partial.date as string);
    Object.assign(induction, updateData);
    return induction.save();
  }

  async remove(id: string, companyId: Types.ObjectId): Promise<void> {
    const induction = await this.inductionModel.findById(id).exec();
    if (!induction) throw new NotFoundException('Inducción no encontrada');
    if (induction.companyId.toString() !== companyId.toString()) {
      throw new ForbiddenException('Acceso denegado');
    }
    await induction.deleteOne();
  }
}
