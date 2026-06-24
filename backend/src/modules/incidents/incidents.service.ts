import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AutoCommunicationService } from '../communication/auto-communication.service';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';
import { Incident, IncidentDocument } from './schemas/incident.schema';

@Injectable()
export class IncidentsService {
  constructor(
    @InjectModel(Incident.name)
    private readonly incidentModel: Model<IncidentDocument>,
    private readonly autoCommService: AutoCommunicationService,
  ) {}

  async create(companyId: Types.ObjectId, dto: CreateIncidentDto): Promise<Incident> {
    const created = new this.incidentModel({
      ...dto,
      employeeId: new Types.ObjectId(dto.employeeId),
      companyId,
    });

    const saved = await created.save();

    // Auto-generate communication for emergency-type incidents (e.g., emergency drill, serious incident)
    const emergencyTypes = ['EMERGENCIA', 'EMERGENCY', 'INCENDIO', 'FIRE', 'TERREMOTO', 'EARTHQUAKE', 
      'DERRAME', 'SPILL', 'EVACUACION', 'EVACUATION', 'SIMULACRO', 'DRILL', 'ACCIDENTE_GRAVE', 'SERIOUS_ACCIDENT'];
    const incidentType = (dto.type || '').toUpperCase();
    const isEmergency = emergencyTypes.some((et) => incidentType.includes(et));

    if (isEmergency) {
      await this.autoCommService.generateCommunication({
        companyId,
        title: `Aviso de Emergencia: ${dto.type}`,
        body: `Se ha reportado un incidente de tipo "${dto.type}" en la empresa. Descripción: ${dto.description || 'Sin descripción'}. Fecha: ${dto.date || new Date().toISOString().slice(0, 10)}. Por favor tomar las medidas de seguridad correspondientes.`,
        communicationType: 'EMERGENCY_NOTICE',
        priority: 'URGENT',
        targetAudience: 'ALL_COMPANY',
        requiresSignature: false,
        sourceModule: 'EMERGENCY_DRILL',
        sourceEntityId: saved._id.toString(),
      }).catch((err) => {
        console.error('Auto-communication generation failed for emergency:', err.message);
      });
    }

    return saved;
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
