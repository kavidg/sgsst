import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';
import { Incident, IncidentDocument } from './schemas/incident.schema';

@Injectable()
export class IncidentsService {
  constructor(
    @InjectModel(Incident.name)
    private readonly incidentModel: Model<IncidentDocument>,
  ) {}

  async create(companyId: Types.ObjectId, dto: CreateIncidentDto): Promise<Incident> {
    const created = new this.incidentModel({
      ...dto,
      employeeId: new Types.ObjectId(dto.employeeId),
      companyId,
    });

    return created.save();
  }

  async findAll(companyId: Types.ObjectId): Promise<Incident[]> {
    return this.incidentModel.find({ companyId }).sort({ date: -1, createdAt: -1 }).exec();
  }

  async findOne(id: string, companyId: Types.ObjectId): Promise<Incident> {
    const incident = await this.incidentModel.findOne({ _id: id, companyId }).exec();

    if (!incident) {
      throw new NotFoundException(`Incident with id ${id} not found`);
    }

    return incident;
  }

  async update(id: string, companyId: Types.ObjectId, dto: UpdateIncidentDto): Promise<Incident> {
    const payload = dto.employeeId
      ? { ...dto, employeeId: new Types.ObjectId(dto.employeeId) }
      : dto;

    const incident = await this.incidentModel
      .findOneAndUpdate({ _id: id, companyId }, payload, { new: true, runValidators: true })
      .exec();

    if (!incident) {
      throw new NotFoundException(`Incident with id ${id} not found`);
    }

    return incident;
  }

  async remove(id: string, companyId: Types.ObjectId): Promise<void> {
    const deletedIncident = await this.incidentModel.findOneAndDelete({ _id: id, companyId }).exec();

    if (!deletedIncident) {
      throw new NotFoundException(`Incident with id ${id} not found`);
    }
  }
}
