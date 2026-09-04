import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateWorkerParticipationDto } from './dto/create-worker-participation.dto';
import { UpdateWorkerParticipationDto } from './dto/update-worker-participation.dto';
import { WorkerParticipation, WorkerParticipationDocument } from './schemas/worker-participation.schema';
import { Risk, RiskDocument } from './schemas/risk.schema';
import { Employee, EmployeeDocument } from '../employees/schemas/employee.schema';

@Injectable()
export class WorkerParticipationService {
  constructor(
    @InjectModel(WorkerParticipation.name)
    private readonly participationModel: Model<WorkerParticipationDocument>,
    @InjectModel(Risk.name)
    private readonly riskModel: Model<RiskDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
  ) {}

  async create(companyId: Types.ObjectId, dto: CreateWorkerParticipationDto): Promise<WorkerParticipation> {
    await this.validateReferences(companyId, dto);
    const created = new this.participationModel({ ...dto, companyId });
    return created.save();
  }

  async findAll(companyId: Types.ObjectId): Promise<WorkerParticipation[]> {
    return this.participationModel
      .find({ companyId })
      .populate('participants', 'name position area')
      .populate('riskId', 'process activity hazard risk riskLevel')
      .sort({ participationDate: -1 })
      .exec();
  }

  async findOne(id: string, companyId: Types.ObjectId): Promise<WorkerParticipation> {
    const participation = await this.participationModel
      .findOne({ _id: id, companyId })
      .populate('participants', 'name position area')
      .populate('riskId', 'process activity hazard risk riskLevel')
      .exec();

    if (!participation) {
      throw new NotFoundException(`Worker participation with id ${id} not found`);
    }

    return participation;
  }

  async update(
    id: string,
    companyId: Types.ObjectId,
    dto: UpdateWorkerParticipationDto,
  ): Promise<WorkerParticipation> {
    await this.validateReferences(companyId, dto);

    const participation = await this.participationModel
      .findOneAndUpdate({ _id: id, companyId }, dto, { new: true, runValidators: true })
      .populate('participants', 'name position area')
      .populate('riskId', 'process activity hazard risk riskLevel')
      .exec();

    if (!participation) {
      throw new NotFoundException(`Worker participation with id ${id} not found`);
    }

    return participation;
  }

  async remove(id: string, companyId: Types.ObjectId): Promise<void> {
    const deleted = await this.participationModel.findOneAndDelete({ _id: id, companyId }).exec();

    if (!deleted) {
      throw new NotFoundException(`Worker participation with id ${id} not found`);
    }
  }

  /**
   * Valida que todas las referencias (riskId, participants) pertenezcan al mismo tenant.
   */
  private async validateReferences(
    companyId: Types.ObjectId,
    dto: CreateWorkerParticipationDto | UpdateWorkerParticipationDto,
  ): Promise<void> {
    const data = dto as Record<string, unknown>;

    // Validar riskId si se proporciona
    if (data.riskId) {
      const risk = await this.riskModel.findOne({ _id: data.riskId, companyId }).exec();
      if (!risk) {
        throw new BadRequestException('Risk not found or does not belong to this company');
      }
    }

    // Validar participants si se proporcionan
    const participants = data.participants as string[] | undefined;
    if (participants && participants.length > 0) {
      const validEmployeeIds = participants.map((id: string) => new Types.ObjectId(id));
      const foundEmployees = await this.employeeModel
        .find({ _id: { $in: validEmployeeIds }, companyId })
        .select('_id')
        .exec();

      if (foundEmployees.length !== participants.length) {
        throw new BadRequestException(
          'One or more participants not found or do not belong to this company',
        );
      }
    }
  }
}
