import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  EpidemiologicalSurveillanceProgram,
  EpidemiologicalSurveillanceProgramDocument,
  SurveillanceActivity,
  SurveillanceActivityStatus,
} from './schemas/epidemiological-surveillance.schema';
import {
  CreateEpidemiologicalSurveillanceProgramDto,
  CreateSurveillanceActivityDto,
  UpdateEpidemiologicalSurveillanceProgramDto,
} from './dto/create-epidemiological-surveillance.dto';

@Injectable()
export class EpidemiologicalSurveillanceService {
  constructor(
    @InjectModel(EpidemiologicalSurveillanceProgram.name)
    private readonly programModel: Model<EpidemiologicalSurveillanceProgramDocument>,
  ) {}

  /**
   * Crea un nuevo programa de vigilancia epidemiológica.
   * Valida consistencia de fechas y normaliza actividades.
   */
  async create(
    companyId: Types.ObjectId,
    dto: CreateEpidemiologicalSurveillanceProgramDto,
  ): Promise<EpidemiologicalSurveillanceProgram> {
    this.validateDates(dto.startDate, dto.endDate);
    const activities = this.normalizeActivities(dto.activities);

    const created = new this.programModel({
      ...dto,
      companyId,
      activities,
      standardNumber: '3.3.1',
    });

    return created.save();
  }

  /**
   * Lista todos los programas de vigilancia de la empresa.
   * Soporta filtros opcionales por status y surveillanceType.
   */
  async findAll(
    companyId: Types.ObjectId,
    filters?: {
      status?: string;
      surveillanceType?: string;
    },
  ): Promise<EpidemiologicalSurveillanceProgram[]> {
    const query: Record<string, unknown> = { companyId };

    if (filters?.status) {
      query.status = filters.status;
    }
    if (filters?.surveillanceType) {
      query.surveillanceType = filters.surveillanceType;
    }

    return this.programModel
      .find(query)
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Obtiene un programa por ID verificando tenant isolation.
   */
  async findOne(
    id: string,
    companyId: Types.ObjectId,
  ): Promise<EpidemiologicalSurveillanceProgramDocument> {
    const program = await this.programModel
      .findOne({ _id: id, companyId })
      .exec();

    if (!program) {
      throw new NotFoundException(
        `Programa de vigilancia epidemiológica con id ${id} no encontrado`,
      );
    }

    return program;
  }

  /**
   * Actualiza un programa verificando tenant isolation.
   */
  async update(
    id: string,
    companyId: Types.ObjectId,
    dto: UpdateEpidemiologicalSurveillanceProgramDto,
  ): Promise<EpidemiologicalSurveillanceProgram> {
    const program = await this.findOne(id, companyId);

    if (dto.startDate !== undefined && dto.endDate !== undefined) {
      this.validateDates(dto.startDate, dto.endDate);
    } else if (dto.startDate !== undefined) {
      this.validateDates(dto.startDate, program.endDate.toISOString());
    } else if (dto.endDate !== undefined) {
      this.validateDates(program.startDate.toISOString(), dto.endDate);
    }

    const activities = dto.activities
      ? this.normalizeActivities(dto.activities)
      : undefined;

    const payload: Record<string, unknown> = { ...dto };
    if (activities !== undefined) {
      payload.activities = activities;
    }

    // Proteger standardNumber contra modificación
    delete payload.standardNumber;

    const updated = await this.programModel
      .findOneAndUpdate({ _id: id, companyId }, payload, {
        new: true,
        runValidators: true,
      })
      .exec();

    if (!updated) {
      throw new NotFoundException(
        `Programa de vigilancia epidemiológica con id ${id} no encontrado`,
      );
    }

    return updated;
  }

  /**
   * Elimina un programa verificando tenant isolation.
   */
  async remove(
    id: string,
    companyId: Types.ObjectId,
  ): Promise<void> {
    const result = await this.programModel
      .findOneAndDelete({ _id: id, companyId })
      .exec();

    if (!result) {
      throw new NotFoundException(
        `Programa de vigilancia epidemiológica con id ${id} no encontrado`,
      );
    }
  }

  // ── Validaciones de negocio ──

  private validateDates(startDate: string, endDate: string): void {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (end < start) {
      throw new BadRequestException(
        'endDate no debe ser anterior a startDate',
      );
    }
  }

  private normalizeActivities(
    activities?: CreateSurveillanceActivityDto[],
  ): SurveillanceActivity[] | undefined {
    if (!activities) return undefined;

    return activities.map((a) => {
      const progress = Math.max(0, Math.min(100, a.progress ?? 0));
      return {
        title: a.title.trim(),
        description: (a.description ?? '').trim(),
        responsible: (a.responsible ?? '').trim(),
        startDate: new Date(a.startDate),
        endDate: new Date(a.endDate),
        status: a.status ?? SurveillanceActivityStatus.PENDING,
        progress,
        evidence: a.evidence ?? [],
      };
    });
  }
}
