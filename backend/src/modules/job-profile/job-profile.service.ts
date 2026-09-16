import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateJobProfileDto } from './dto/create-job-profile.dto';
import { UpdateJobProfileDto } from './dto/update-job-profile.dto';
import { JobProfile, JobProfileDocument } from './schemas/job-profile.schema';
import { Risk, RiskDocument } from '../risks/schemas/risk.schema';

/**
 * Servicio de JobProfile (3.1.3).
 *
 * Toda operación está protegida por tenant: cada método recibe companyId y
 * filtra por `companyId`. Las referencias a la matriz de peligros (Risk) se
 * validan contra el mismo tenant para impedir referencias cross-tenant.
 */
@Injectable()
export class JobProfileService {
  constructor(
    @InjectModel(JobProfile.name)
    private readonly jobProfileModel: Model<JobProfileDocument>,
    @InjectModel(Risk.name)
    private readonly riskModel: Model<RiskDocument>,
  ) {}

  /** Crea un perfil de cargo asignando companyId desde la sesión. */
  async create(
    companyId: Types.ObjectId,
    dto: CreateJobProfileDto,
    actorUid?: string,
  ): Promise<JobProfile> {
    await this.assertHazardsInCompany(companyId, dto.associatedHazardIds ?? []);

    const created = new this.jobProfileModel({
      ...dto,
      ...(dto.associatedHazardIds
        ? { associatedHazardIds: dto.associatedHazardIds.map((id) => new Types.ObjectId(id)) }
        : {}),
      companyId,
      createdBy: actorUid ?? '',
      updatedBy: actorUid ?? '',
    });
    return created.save();
  }

  /** Lista los perfiles de la empresa (filtro opcional por estado). */
  async findAll(
    companyId: Types.ObjectId,
    filters?: { active?: boolean },
  ): Promise<JobProfile[]> {
    const query: Record<string, unknown> = { companyId };
    if (filters?.active !== undefined) {
      query.active = filters.active;
    }
    return this.jobProfileModel.find(query).sort({ createdAt: -1 }).exec();
  }

  /** Obtiene un perfil por ID verificando tenant isolation. */
  async findOne(id: string, companyId: Types.ObjectId): Promise<JobProfile> {
    const profile = await this.jobProfileModel.findOne({ _id: id, companyId }).exec();
    if (!profile) {
      throw new NotFoundException(`JobProfile con id ${id} no encontrado`);
    }
    return profile;
  }

  /** Actualiza un perfil verificando tenant isolation. */
  async update(
    id: string,
    companyId: Types.ObjectId,
    dto: UpdateJobProfileDto,
    actorUid?: string,
  ): Promise<JobProfile> {
    if (dto.associatedHazardIds) {
      await this.assertHazardsInCompany(companyId, dto.associatedHazardIds);
    }

    const payload: Record<string, unknown> = {
      ...dto,
      ...(dto.associatedHazardIds
        ? { associatedHazardIds: dto.associatedHazardIds.map((h) => new Types.ObjectId(h)) }
        : {}),
      updatedBy: actorUid ?? '',
    };

    const profile = await this.jobProfileModel
      .findOneAndUpdate({ _id: id, companyId }, payload, { new: true, runValidators: true })
      .exec();

    if (!profile) {
      throw new NotFoundException(`JobProfile con id ${id} no encontrado`);
    }
    return profile;
  }

  /** Desactiva un perfil (borrado blando). Verifica tenant isolation. */
  async deactivate(id: string, companyId: Types.ObjectId, actorUid?: string): Promise<JobProfile> {
    const profile = await this.jobProfileModel
      .findOneAndUpdate(
        { _id: id, companyId },
        { active: false, updatedBy: actorUid ?? '' },
        { new: true, runValidators: true },
      )
      .exec();

    if (!profile) {
      throw new NotFoundException(`JobProfile con id ${id} no encontrado`);
    }
    return profile;
  }

  /**
   * Valida que todos los hazardIds referencien riesgos de la MISMA empresa.
   * Lanza BadRequestException si algún id no existe o pertenece a otra empresa.
   */
  private async assertHazardsInCompany(
    companyId: Types.ObjectId,
    hazardIds: string[],
  ): Promise<void> {
    if (hazardIds.length === 0) return;

    const uniqueIds = [...new Set(hazardIds)];
    const objectIds = uniqueIds.map((id) => new Types.ObjectId(id));
    const found = await this.riskModel
      .find({ _id: { $in: objectIds }, companyId })
      .select('_id')
      .lean()
      .exec();

    if (found.length !== uniqueIds.length) {
      throw new BadRequestException(
        'Uno o más riesgos asociados no existen o no pertenecen a esta empresa',
      );
    }
  }
}
