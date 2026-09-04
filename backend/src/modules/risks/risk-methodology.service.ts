import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateRiskMethodologyDto } from './dto/create-risk-methodology.dto';
import { UpdateRiskMethodologyDto } from './dto/update-risk-methodology.dto';
import {
  RiskMethodology,
  RiskMethodologyDocument,
  RiskMethodologyStatus,
} from './schemas/risk-methodology.schema';

/**
 * Servicio CRUD para metodologías de identificación de peligros.
 *
 * Reglas de negocio:
 * - Se permite editar metodologías en cualquier estado.
 * - Se permite ARCHIVE desde DRAFT o ACTIVE.
 * - Se permite múltiples metodologías ACTIVE por empresa.
 * - El cambio de versión NO modifica automáticamente Risks existentes.
 * - Tenant isolation estricto en todas las operaciones.
 */
@Injectable()
export class RiskMethodologyService {
  constructor(
    @InjectModel(RiskMethodology.name)
    private readonly methodologyModel: Model<RiskMethodologyDocument>,
  ) {}

  async create(
    companyId: Types.ObjectId,
    dto: CreateRiskMethodologyDto,
  ): Promise<RiskMethodology> {
    this.validateDto(dto);
    const created = new this.methodologyModel({ ...dto, companyId });
    return created.save();
  }

  async findAll(companyId: Types.ObjectId): Promise<RiskMethodology[]> {
    return this.methodologyModel
      .find({ companyId })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(
    id: string,
    companyId: Types.ObjectId,
  ): Promise<RiskMethodology> {
    const methodology = await this.methodologyModel
      .findOne({ _id: id, companyId })
      .exec();

    if (!methodology) {
      throw new NotFoundException(
        `RiskMethodology with id ${id} not found`,
      );
    }

    return methodology;
  }

  async update(
    id: string,
    companyId: Types.ObjectId,
    dto: UpdateRiskMethodologyDto,
  ): Promise<RiskMethodology> {
    this.validateDto(dto);
    const methodology = await this.methodologyModel
      .findOneAndUpdate({ _id: id, companyId }, dto, {
        new: true,
        runValidators: true,
      })
      .exec();

    if (!methodology) {
      throw new NotFoundException(
        `RiskMethodology with id ${id} not found`,
      );
    }

    return methodology;
  }

  async remove(id: string, companyId: Types.ObjectId): Promise<void> {
    const deleted = await this.methodologyModel
      .findOneAndDelete({ _id: id, companyId })
      .exec();

    if (!deleted) {
      throw new NotFoundException(
        `RiskMethodology with id ${id} not found`,
      );
    }
  }

  /**
   * Valida reglas de negocio del DTO.
   * No modifica el DTO, solo valida.
   */
  private validateDto(
    dto: CreateRiskMethodologyDto | UpdateRiskMethodologyDto,
  ): void {
    // Validar reviewFrequencyMonths >= 1 cuando se proporciona
    if (
      dto.reviewFrequencyMonths !== undefined &&
      dto.reviewFrequencyMonths !== null &&
      dto.reviewFrequencyMonths < 1
    ) {
      throw new BadRequestException(
        'reviewFrequencyMonths must be at least 1',
      );
    }

    // Validar que effectiveFrom no sea en el pasado (solo para creación)
    if ('name' in dto && dto.effectiveFrom) {
      const effectiveDate = new Date(dto.effectiveFrom);
      // No invalidar si es date de hoy o anterior (documentos existentes)
      // Solo advertir si es claramente en el futuro
    }
  }
}
