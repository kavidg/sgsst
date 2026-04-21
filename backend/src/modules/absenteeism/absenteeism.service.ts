import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateAbsenteeismDto } from './dto/create-absenteeism.dto';
import { UpdateAbsenteeismDto } from './dto/update-absenteeism.dto';
import { Absenteeism, AbsenteeismDocument } from './schemas/absenteeism.schema';

@Injectable()
export class AbsenteeismService {
  constructor(
    @InjectModel(Absenteeism.name)
    private readonly absenteeismModel: Model<AbsenteeismDocument>,
  ) {}

  async create(dto: CreateAbsenteeismDto): Promise<Absenteeism> {
    const created = new this.absenteeismModel({
      ...dto,
      companyId: new Types.ObjectId(dto.companyId),
      userId: new Types.ObjectId(dto.userId),
      dias: this.calculateDias(dto.fechaInicio, dto.fechaFin),
    });

    return created.save();
  }

  async findAllByCompany(companyId: string): Promise<Absenteeism[]> {
    return this.absenteeismModel
      .find({ companyId: new Types.ObjectId(companyId) })
      .sort({ fechaInicio: -1, createdAt: -1 })
      .exec();
  }

  async findAllByUser(userId: string): Promise<Absenteeism[]> {
    return this.absenteeismModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ fechaInicio: -1, createdAt: -1 })
      .exec();
  }

  async update(id: string, dto: UpdateAbsenteeismDto): Promise<Absenteeism> {
    const current = await this.absenteeismModel.findById(id).exec();

    if (!current) {
      throw new NotFoundException(`Absenteeism with id ${id} not found`);
    }

    const fechaInicio = dto.fechaInicio ?? current.fechaInicio;
    const fechaFin = dto.fechaFin ?? current.fechaFin;

    const payload = {
      ...dto,
      ...(dto.companyId ? { companyId: new Types.ObjectId(dto.companyId) } : {}),
      ...(dto.userId ? { userId: new Types.ObjectId(dto.userId) } : {}),
      dias: this.calculateDias(fechaInicio, fechaFin),
    };

    const updated = await this.absenteeismModel
      .findByIdAndUpdate(id, payload, { new: true, runValidators: true })
      .exec();

    if (!updated) {
      throw new NotFoundException(`Absenteeism with id ${id} not found`);
    }

    return updated;
  }

  async remove(id: string): Promise<void> {
    const deleted = await this.absenteeismModel.findByIdAndDelete(id).exec();

    if (!deleted) {
      throw new NotFoundException(`Absenteeism with id ${id} not found`);
    }
  }

  async getCompanyStats(companyId: string): Promise<{ totalDiasPerdidos: number; totalCasos: number; promedioDias: number }> {
    const stats = await this.absenteeismModel
      .aggregate<{ totalDiasPerdidos: number; totalCasos: number; promedioDias: number }>([
        { $match: { companyId: new Types.ObjectId(companyId) } },
        {
          $group: {
            _id: null,
            totalDiasPerdidos: { $sum: '$dias' },
            totalCasos: { $sum: 1 },
            promedioDias: { $avg: '$dias' },
          },
        },
        {
          $project: {
            _id: 0,
            totalDiasPerdidos: 1,
            totalCasos: 1,
            promedioDias: { $round: ['$promedioDias', 2] },
          },
        },
      ])
      .exec();

    return (
      stats[0] ?? {
        totalDiasPerdidos: 0,
        totalCasos: 0,
        promedioDias: 0,
      }
    );
  }

  private calculateDias(fechaInicio: Date, fechaFin: Date): number {
    const start = new Date(fechaInicio);
    const end = new Date(fechaFin);

    if (end < start) {
      throw new BadRequestException('fechaFin must be greater than or equal to fechaInicio');
    }

    const millisecondsPerDay = 1000 * 60 * 60 * 24;
    return Math.floor((end.getTime() - start.getTime()) / millisecondsPerDay) + 1;
  }
}
