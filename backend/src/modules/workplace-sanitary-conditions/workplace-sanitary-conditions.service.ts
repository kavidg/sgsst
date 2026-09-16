import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateWorkplaceSanitaryConditionDto } from './dto/create-workplace-sanitary-condition.dto';
import { UpdateWorkplaceSanitaryConditionDto } from './dto/update-workplace-sanitary-condition.dto';
import {
  SanitaryConditionResult,
  SanitaryConditionStatus,
  SanitaryConditionType,
  VerificationFrequency,
  WorkplaceSanitaryCondition,
  WorkplaceSanitaryConditionDocument,
} from './schemas/workplace-sanitary-condition.schema';

/**
 * Servicio de condiciones sanitarias del lugar de trabajo (3.1.8 — FASE 34B).
 *
 * Gestiona los registros verificables de agua potable, servicios sanitarios y
 * manejo/disposición de basuras. Reglas:
 *
 * 1. Tenant isolation: todas las operaciones se filtran por companyId.
 * 2. companyId se deriva de la sesión (controller); nunca del body.
 * 3. Coherencia temporal: nextVerificationDate >= lastVerificationDate.
 * 4. Frecuencia de verificación con enum cerrado (VerificationFrequency).
 * 5. Un registro DEFICIENT sigue siendo evidencia de verificación, pero la
 *    corrección del estado corresponde a acciones operativas (el provider
 *    puntúa la condición, no la intención).
 * 6. Borrado lógico exclusivamente (active = false). No hay delete físico.
 * 7. METADATA-ONLY: sin información clínica ni datos sensibles innecesarios.
 */
@Injectable()
export class WorkplaceSanitaryConditionsService {
  constructor(
    @InjectModel(WorkplaceSanitaryCondition.name)
    private readonly conditionModel: Model<WorkplaceSanitaryConditionDocument>,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // CRUD
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Crea una condición sanitaria.
   *
   * Validaciones: dates coherentes, enums cerrados (DTO), companyId derivado
   * de la sesión (controller). code/location/responsible obligatorios.
   */
  async create(
    companyId: string,
    dto: CreateWorkplaceSanitaryConditionDto,
    createdBy?: string,
  ): Promise<WorkplaceSanitaryConditionDocument> {
    this.validateDates(
      dto.lastVerificationDate,
      dto.nextVerificationDate,
    );

    const created = await this.conditionModel.create({
      companyId: new Types.ObjectId(companyId),
      conditionType: dto.conditionType,
      code: dto.code.trim(),
      description: dto.description.trim(),
      location: dto.location.trim(),
      status: dto.status ?? SanitaryConditionStatus.OPERATIONAL,
      conditionResult: dto.conditionResult ?? SanitaryConditionResult.APT,
      lastVerificationDate: new Date(dto.lastVerificationDate),
      nextVerificationDate: dto.nextVerificationDate
        ? new Date(dto.nextVerificationDate)
        : undefined,
      verificationFrequency:
        dto.verificationFrequency ?? VerificationFrequency.ANNUAL,
      responsible: dto.responsible.trim(),
      evidenceUrl: dto.evidenceUrl?.trim(),
      observations: dto.observations?.trim(),
      active: dto.active ?? true,
      createdBy: createdBy ?? '',
      updatedBy: createdBy ?? '',
    });

    return created.toObject() as WorkplaceSanitaryConditionDocument;
  }

  /**
   * Lista condiciones sanitarias del tenant, activas por defecto.
   *
   * Filtros opcionales: active, conditionType, status, conditionResult, limit, skip.
   */
  async findAll(
    companyId: string,
    options: {
      active?: boolean;
      conditionType?: string;
      status?: string;
      conditionResult?: string;
      limit?: number;
      skip?: number;
    } = {},
  ): Promise<WorkplaceSanitaryConditionDocument[]> {
    const filter: Record<string, unknown> = {
      companyId: new Types.ObjectId(companyId),
    };

    if (options.active !== undefined) {
      filter.active = options.active;
    }
    if (options.conditionType) {
      filter.conditionType = options.conditionType;
    }
    if (options.status) {
      filter.status = options.status;
    }
    if (options.conditionResult) {
      filter.conditionResult = options.conditionResult;
    }

    const limit = options.limit ?? 100;
    const skip = options.skip ?? 0;

    const results = await this.conditionModel
      .find(filter)
      .sort({ lastVerificationDate: -1 })
      .limit(limit)
      .skip(skip)
      .lean();
    return results as unknown as WorkplaceSanitaryConditionDocument[];
  }

  /**
   * Busca una condición por ID, validando que pertenece al tenant.
   */
  async findOne(
    companyId: string,
    id: string,
  ): Promise<WorkplaceSanitaryConditionDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    const record = await this.conditionModel
      .findOne({
        _id: new Types.ObjectId(id),
        companyId: new Types.ObjectId(companyId),
      })
      .lean();

    return record as (WorkplaceSanitaryConditionDocument | null);
  }

  /**
   * Actualiza parcialmente una condición.
   *
   * Validaciones: existencia + tenant, coherencia temporal considerando
   * valores previos, enums cerrados (DTO).
   */
  async update(
    companyId: string,
    id: string,
    dto: UpdateWorkplaceSanitaryConditionDto,
    updatedBy?: string,
  ): Promise<WorkplaceSanitaryConditionDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    // Verificar existencia y pertenencia al tenant
    const existing = await this.conditionModel.findOne({
      _id: new Types.ObjectId(id),
      companyId: new Types.ObjectId(companyId),
    });

    if (!existing) {
      throw new NotFoundException(
        `Condición sanitaria ${id} no existe o no pertenece a la empresa ${companyId}`,
      );
    }

    // Coherencia temporal considerando valores previos (§5)
    const lastVerificationDate =
      dto.lastVerificationDate ?? existing.lastVerificationDate.toISOString();
    const nextVerificationDate =
      dto.nextVerificationDate ??
      (existing.nextVerificationDate
        ? existing.nextVerificationDate.toISOString()
        : undefined);
    this.validateDates(lastVerificationDate, nextVerificationDate);

    // Construir el objeto de actualización (sin campos clínicos)
    const update: Record<string, unknown> = {};

    if (dto.conditionType !== undefined) {
      update.conditionType = dto.conditionType;
    }
    if (dto.code !== undefined) {
      update.code = dto.code.trim();
    }
    if (dto.description !== undefined) {
      update.description = dto.description.trim();
    }
    if (dto.location !== undefined) {
      update.location = dto.location.trim();
    }
    if (dto.status !== undefined) {
      update.status = dto.status;
    }
    if (dto.conditionResult !== undefined) {
      update.conditionResult = dto.conditionResult;
    }
    if (dto.lastVerificationDate !== undefined) {
      update.lastVerificationDate = new Date(dto.lastVerificationDate);
    }
    if (dto.nextVerificationDate !== undefined) {
      update.nextVerificationDate = new Date(dto.nextVerificationDate);
    }
    if (dto.verificationFrequency !== undefined) {
      update.verificationFrequency = dto.verificationFrequency;
    }
    if (dto.responsible !== undefined) {
      update.responsible = dto.responsible.trim();
    }
    if (dto.evidenceUrl !== undefined) {
      update.evidenceUrl = dto.evidenceUrl?.trim();
    }
    if (dto.observations !== undefined) {
      update.observations = dto.observations?.trim();
    }
    if (dto.active !== undefined) {
      update.active = dto.active;
    }

    update.updatedBy = updatedBy ?? '';

    const updated = await this.conditionModel
      .findByIdAndUpdate(id, update, { new: true })
      .lean();

    return updated as (WorkplaceSanitaryConditionDocument | null);
  }

  /**
   * Desactiva (borrado lógico) una condición. No existe delete físico.
   */
  async deactivate(
    companyId: string,
    id: string,
    updatedBy?: string,
  ): Promise<WorkplaceSanitaryConditionDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    const updated = await this.conditionModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(id),
          companyId: new Types.ObjectId(companyId),
        },
        {
          active: false,
          updatedBy: updatedBy ?? '',
        },
        { new: true },
      )
      .lean();

    return updated as (WorkplaceSanitaryConditionDocument | null);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Validaciones privadas
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Coherencia temporal (§5): fechas válidas y
   * nextVerificationDate >= lastVerificationDate cuando ambas existan.
   */
  private validateDates(
    lastVerificationDate: string | undefined,
    nextVerificationDate: string | undefined,
  ): void {
    for (const [name, value] of [
      ['lastVerificationDate', lastVerificationDate],
      ['nextVerificationDate', nextVerificationDate],
    ] as const) {
      if (
        value !== undefined &&
        value !== null &&
        Number.isNaN(new Date(value).getTime())
      ) {
        throw new BadRequestException(`Fecha inválida en ${name}: ${value}`);
      }
    }

    if (lastVerificationDate && nextVerificationDate) {
      if (new Date(nextVerificationDate) < new Date(lastVerificationDate)) {
        throw new BadRequestException(
          `nextVerificationDate (${nextVerificationDate}) no puede ser anterior a lastVerificationDate (${lastVerificationDate})`,
        );
      }
    }
  }
}
