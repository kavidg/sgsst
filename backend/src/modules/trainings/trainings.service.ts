import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AutoCommunicationService } from '../communication/auto-communication.service';
import { CreateTrainingAttendanceDto } from './dto/create-training-attendance.dto';
import { CreateTrainingDto } from './dto/create-training.dto';
import { UpdateTrainingDto } from './dto/update-training.dto';
import { TrainingAttendance, TrainingAttendanceDocument } from './schemas/training-attendance.schema';
import { Training, TrainingDocument } from './schemas/training.schema';

@Injectable()
export class TrainingsService {
  constructor(
    @InjectModel(Training.name)
    private readonly trainingModel: Model<TrainingDocument>,
    @InjectModel(TrainingAttendance.name)
    private readonly trainingAttendanceModel: Model<TrainingAttendanceDocument>,
    private readonly autoCommService: AutoCommunicationService,
  ) {}

  async create(companyId: Types.ObjectId, dto: CreateTrainingDto): Promise<Training> {
    const created = new this.trainingModel({ ...dto, companyId });
    const saved = await created.save();
    // Auto-generate communication for training assignment
    await this.autoCommService.generateCommunication({
      companyId,
      title: `Capacitación asignada: ${saved.topic}`,
      body: `Se ha programado una nueva capacitación. Tema: "${saved.topic}". Fecha: ${saved.date ? new Date(saved.date).toISOString().slice(0, 10) : 'Por definir'}. Instructor: ${saved.instructor || 'Por asignar'}. Descripción: ${saved.description || ''}`,
      communicationType: 'TRAINING_COMMUNICATION',
      priority: 'INFORMATIVE',
      targetAudience: 'ALL_COMPANY',
      requiresSignature: false,
      sourceModule: 'TRAINING_ASSIGNED',
      sourceEntityId: saved._id.toString(),
    }).catch((err) => {
      console.error('Auto-communication generation failed for training:', err.message);
    });
    return saved;
  }

  async findAll(companyId: Types.ObjectId): Promise<Training[]> {
    return this.trainingModel.find({ companyId }).sort({ date: -1, createdAt: -1 }).exec();
  }

  async findOne(id: string, companyId: Types.ObjectId): Promise<Training> {
    const training = await this.trainingModel.findOne({ _id: id, companyId }).exec();

    if (!training) {
      throw new NotFoundException(`Training with id ${id} not found`);
    }

    return training;
  }

  async update(id: string, companyId: Types.ObjectId, dto: UpdateTrainingDto): Promise<Training> {
    const training = await this.trainingModel
      .findOneAndUpdate({ _id: id, companyId }, dto, { new: true, runValidators: true })
      .exec();

    if (!training) {
      throw new NotFoundException(`Training with id ${id} not found`);
    }

    return training;
  }

  async remove(id: string, companyId: Types.ObjectId): Promise<void> {
    const deletedTraining = await this.trainingModel.findOneAndDelete({ _id: id, companyId }).exec();

    if (!deletedTraining) {
      throw new NotFoundException(`Training with id ${id} not found`);
    }

    await this.trainingAttendanceModel.deleteMany({ trainingId: deletedTraining._id, companyId }).exec();
  }

  async createAttendance(
    trainingId: string,
    companyId: Types.ObjectId,
    dto: CreateTrainingAttendanceDto,
  ): Promise<TrainingAttendance> {
    await this.ensureTrainingExists(trainingId, companyId);

    const attendance = await this.trainingAttendanceModel.findOneAndUpdate(
      {
        trainingId: new Types.ObjectId(trainingId),
        employeeId: new Types.ObjectId(dto.employeeId),
        companyId,
      },
      {
        trainingId: new Types.ObjectId(trainingId),
        employeeId: new Types.ObjectId(dto.employeeId),
        companyId,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).exec();

    if (!attendance) {
      throw new NotFoundException(`Training with id ${trainingId} not found`);
    }

    return attendance;
  }

  async findAttendance(trainingId: string, companyId: Types.ObjectId): Promise<TrainingAttendance[]> {
    await this.ensureTrainingExists(trainingId, companyId);

    return this.trainingAttendanceModel
      .find({ trainingId: new Types.ObjectId(trainingId), companyId })
      .populate('employeeId')
      .exec();
  }

  private async ensureTrainingExists(trainingId: string, companyId: Types.ObjectId) {
    const training = await this.trainingModel.findOne({ _id: trainingId, companyId }).exec();

    if (!training) {
      throw new NotFoundException(`Training with id ${trainingId} not found`);
    }
  }
}
