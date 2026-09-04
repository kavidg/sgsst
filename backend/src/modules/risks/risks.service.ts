import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateRiskDto } from './dto/create-risk.dto';
import { UpdateRiskDto } from './dto/update-risk.dto';
import { Risk, RiskDocument } from './schemas/risk.schema';
import { RiskMethodology, RiskMethodologyDocument } from './schemas/risk-methodology.schema';

@Injectable()
export class RisksService {
  constructor(
    @InjectModel(Risk.name)
    private readonly riskModel: Model<RiskDocument>,
    @InjectModel(RiskMethodology.name)
    private readonly methodologyModel: Model<RiskMethodologyDocument>,
  ) {}

  async create(companyId: Types.ObjectId, dto: CreateRiskDto): Promise<Risk> {
    const resolvedDto = await this.resolveMethodology(companyId, dto);
    const created = new this.riskModel({ ...resolvedDto, companyId });
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
    const resolvedDto = await this.resolveMethodology(companyId, dto);
    const risk = await this.riskModel
      .findOneAndUpdate({ _id: id, companyId }, resolvedDto, { new: true, runValidators: true })
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

  /**
   * Resuelve y valida la metodología asociada.
   *
   * Si methodologyId se proporciona:
   * 1. Valida que exista
   * 2. Valida que pertenezca al mismo tenant
   * 3. Obtiene automáticamente la versión de la metodología
   *
   * Si methodologyId es null/undefined:
   * - methodologyVersion se establece en null/undefined
   *
   * Esto garantiza:
   * - Tenant isolation cross-tenant
   * - Integridad de referencia
   * - Trazabilidad de versión
   */
  private async resolveMethodology(
    companyId: Types.ObjectId,
    dto: CreateRiskDto | UpdateRiskDto,
  ): Promise<CreateRiskDto | UpdateRiskDto> {
    // Si no se proporciona methodologyId, no hay nada que validar
    if (!dto.methodologyId) {
      return { ...dto, methodologyVersion: undefined };
    }

    // Validar que la metodología exista y pertenezca al mismo tenant
    const methodology = await this.methodologyModel
      .findOne({ _id: dto.methodologyId, companyId })
      .exec();

    if (!methodology) {
      throw new BadRequestException(
        'Methodology not found or does not belong to this company',
      );
    }

    // Obtener la versión automáticamente de la metodología
    // No confiar en el methodologyVersion enviado por el cliente
    return {
      ...dto,
      methodologyVersion: methodology.version,
    };
  }
}
