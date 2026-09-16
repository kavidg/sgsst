import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateWasteManagementRecordDto } from './dto/create-waste-management-record.dto';
import { UpdateWasteManagementRecordDto } from './dto/update-waste-management-record.dto';
import { DeclareWasteTypesDto } from './dto/declare-waste-types.dto';
import {
  WasteDisposalFrequency,
  WasteManagementStatus,
  WasteManagementRecord,
  WasteManagementRecordDocument,
} from './schemas/waste-management-record.schema';
import {
  WasteTypeDeclaration,
  WasteTypeDeclarationDocument,
} from './schemas/waste-type-declaration.schema';

/**
 * Servicio de gestión de residuos (3.1.9 — FASE 34C).
 *
 * Gestiona los registros verificables de residuos sólidos, líquidos y
 * gaseosos generados por la operación. Reglas:
 *
 * 1. Tenant isolation: todas las operaciones se filtran por companyId.
 * 2. companyId se deriva de la sesión (controller); nunca del body.
 * 3. Coherencia temporal: nextDisposalDate >= lastDisposalDate.
 * 4. Estado y disposición coherentes: ACTIVE exige disposalMethod
 *    (nuevo o ya presente en el registro); PLANNED no exige disposición
 *    porque la gestión aún no se ejecuta.
 * 5. hazardous = true es SOLO clasificación operativa: no implica
 *    cumplimiento ni evidencia de eliminación.
 * 6. Borrado lógico exclusivamente (active = false). No hay delete físico.
 * 7. METADATA-ONLY: sin información clínica ni datos personales innecesarios.
 */
@Injectable()
export class WasteManagementService {
  constructor(
    @InjectModel(WasteManagementRecord.name)
    private readonly recordModel: Model<WasteManagementRecordDocument>,
    @InjectModel(WasteTypeDeclaration.name)
    private readonly declarationModel: Model<WasteTypeDeclarationDocument>,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Declaración de tipos de residuo generados (C1 de 3.1.9)
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Declara (upsert) los tipos de residuo que la empresa REALMENTE genera.
   * Metadata operativa mínima: un documento por empresa (C1 del provider).
   */
  async declareWasteTypes(
    companyId: string,
    dto: DeclareWasteTypesDto,
    actorUid?: string,
  ): Promise<WasteTypeDeclarationDocument> {
    const updated = await this.declarationModel
      .findOneAndUpdate(
        { companyId: new Types.ObjectId(companyId) },
        {
          companyId: new Types.ObjectId(companyId),
          declaredWasteTypes: dto.declaredWasteTypes,
          updatedBy: actorUid ?? '',
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .lean();
    return updated as unknown as WasteTypeDeclarationDocument;
  }

  /** Obtiene la declaración de tipos generados (o null si no existe). */
  async getWasteTypeDeclaration(
    companyId: string,
  ): Promise<WasteTypeDeclarationDocument | null> {
    const declaration = await this.declarationModel
      .findOne({ companyId: new Types.ObjectId(companyId) })
      .lean();
    return declaration as (WasteTypeDeclarationDocument | null);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // CRUD
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Crea un registro de residuo.
   *
   * Validaciones: fechas coherentes; ACTIVE exige disposalMethod.
   */
  async create(
    companyId: string,
    dto: CreateWasteManagementRecordDto,
    createdBy?: string,
  ): Promise<WasteManagementRecordDocument> {
    this.validateDates(dto.lastDisposalDate, dto.nextDisposalDate);

    const status = dto.status ?? WasteManagementStatus.PLANNED;
    this.validateActiveRequiresDisposal(status, dto.disposalMethod);

    const created = await this.recordModel.create({
      companyId: new Types.ObjectId(companyId),
      code: dto.code.trim(),
      wasteType: dto.wasteType,
      hazardous: dto.hazardous ?? false,
      source: dto.source.trim(),
      generationDescription: dto.generationDescription.trim(),
      handlingMethod: dto.handlingMethod.trim(),
      disposalMethod: dto.disposalMethod?.trim(),
      disposalDestination: dto.disposalDestination?.trim(),
      disposalFrequency:
        dto.disposalFrequency ?? WasteDisposalFrequency.ANNUAL,
      lastDisposalDate: dto.lastDisposalDate ? new Date(dto.lastDisposalDate) : undefined,
      nextDisposalDate: dto.nextDisposalDate ? new Date(dto.nextDisposalDate) : undefined,
      responsible: dto.responsible.trim(),
      evidenceUrl: dto.evidenceUrl?.trim(),
      observations: dto.observations?.trim(),
      status,
      active: dto.active ?? true,
      createdBy: createdBy ?? '',
      updatedBy: createdBy ?? '',
    });

    return created.toObject() as WasteManagementRecordDocument;
  }

  /**
   * Lista registros de residuos del tenant, activos por defecto.
   *
   * Filtros opcionales: active, wasteType, hazardous, status, limit, skip.
   */
  async findAll(
    companyId: string,
    options: {
      active?: boolean;
      wasteType?: string;
      hazardous?: boolean;
      status?: string;
      limit?: number;
      skip?: number;
    } = {},
  ): Promise<WasteManagementRecordDocument[]> {
    const filter: Record<string, unknown> = {
      companyId: new Types.ObjectId(companyId),
    };

    if (options.active !== undefined) {
      filter.active = options.active;
    }
    if (options.wasteType) {
      filter.wasteType = options.wasteType;
    }
    if (options.hazardous !== undefined) {
      filter.hazardous = options.hazardous;
    }
    if (options.status) {
      filter.status = options.status;
    }

    const limit = options.limit ?? 100;
    const skip = options.skip ?? 0;

    const results = await this.recordModel
      .find(filter)
      .sort({ lastDisposalDate: -1, createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();
    return results as unknown as WasteManagementRecordDocument[];
  }

  /**
   * Busca un registro por ID, validando que pertenece al tenant.
   */
  async findOne(
    companyId: string,
    id: string,
  ): Promise<WasteManagementRecordDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    const record = await this.recordModel
      .findOne({
        _id: new Types.ObjectId(id),
        companyId: new Types.ObjectId(companyId),
      })
      .lean();

    return record as (WasteManagementRecordDocument | null);
  }

  /**
   * Actualiza parcialmente un registro.
   *
   * Validaciones: existencia + tenant, coherencia temporal considerando
   * valores previos, ACTIVE exige disposalMethod (nuevo o previo).
   */
  async update(
    companyId: string,
    id: string,
    dto: UpdateWasteManagementRecordDto,
    updatedBy?: string,
  ): Promise<WasteManagementRecordDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    // Verificar existencia y pertenencia al tenant
    const existing = await this.recordModel.findOne({
      _id: new Types.ObjectId(id),
      companyId: new Types.ObjectId(companyId),
    });

    if (!existing) {
      throw new NotFoundException(
        `Registro de residuo ${id} no existe o no pertenece a la empresa ${companyId}`,
      );
    }

    // Coherencia temporal considerando valores previos (§12)
    const lastDisposalDate =
      dto.lastDisposalDate ??
      (existing.lastDisposalDate ? existing.lastDisposalDate.toISOString() : undefined);
    const nextDisposalDate =
      dto.nextDisposalDate ??
      (existing.nextDisposalDate ? existing.nextDisposalDate.toISOString() : undefined);
    this.validateDates(lastDisposalDate, nextDisposalDate);

    // ACTIVE exige disposalMethod (nuevo o ya presente) (§12)
    const finalStatus = dto.status ?? existing.status;
    const finalDisposalMethod =
      dto.disposalMethod !== undefined ? dto.disposalMethod : existing.disposalMethod;
    this.validateActiveRequiresDisposal(finalStatus, finalDisposalMethod);

    // Construir el objeto de actualización
    const update: Record<string, unknown> = {};

    if (dto.code !== undefined) {
      update.code = dto.code.trim();
    }
    if (dto.wasteType !== undefined) {
      update.wasteType = dto.wasteType;
    }
    if (dto.hazardous !== undefined) {
      update.hazardous = dto.hazardous;
    }
    if (dto.source !== undefined) {
      update.source = dto.source.trim();
    }
    if (dto.generationDescription !== undefined) {
      update.generationDescription = dto.generationDescription.trim();
    }
    if (dto.handlingMethod !== undefined) {
      update.handlingMethod = dto.handlingMethod.trim();
    }
    if (dto.disposalMethod !== undefined) {
      update.disposalMethod = dto.disposalMethod?.trim();
    }
    if (dto.disposalDestination !== undefined) {
      update.disposalDestination = dto.disposalDestination?.trim();
    }
    if (dto.disposalFrequency !== undefined) {
      update.disposalFrequency = dto.disposalFrequency;
    }
    if (dto.lastDisposalDate !== undefined) {
      update.lastDisposalDate = new Date(dto.lastDisposalDate);
    }
    if (dto.nextDisposalDate !== undefined) {
      update.nextDisposalDate = new Date(dto.nextDisposalDate);
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
    if (dto.status !== undefined) {
      update.status = dto.status;
    }
    if (dto.active !== undefined) {
      update.active = dto.active;
    }

    update.updatedBy = updatedBy ?? '';

    const updated = await this.recordModel
      .findByIdAndUpdate(id, update, { new: true })
      .lean();

    return updated as (WasteManagementRecordDocument | null);
  }

  /**
   * Desactiva (borrado lógico) un registro. No existe delete físico.
   */
  async deactivate(
    companyId: string,
    id: string,
    updatedBy?: string,
  ): Promise<WasteManagementRecordDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    const updated = await this.recordModel
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

    return updated as (WasteManagementRecordDocument | null);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Validaciones privadas
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Coherencia temporal (§12): fechas válidas y
   * nextDisposalDate >= lastDisposalDate cuando ambas existan.
   */
  private validateDates(
    lastDisposalDate: string | undefined,
    nextDisposalDate: string | undefined,
  ): void {
    for (const [name, value] of [
      ['lastDisposalDate', lastDisposalDate],
      ['nextDisposalDate', nextDisposalDate],
    ] as const) {
      if (
        value !== undefined &&
        value !== null &&
        Number.isNaN(new Date(value).getTime())
      ) {
        throw new BadRequestException(`Fecha inválida en ${name}: ${value}`);
      }
    }

    if (lastDisposalDate && nextDisposalDate) {
      if (new Date(nextDisposalDate) < new Date(lastDisposalDate)) {
        throw new BadRequestException(
          `nextDisposalDate (${nextDisposalDate}) no puede ser anterior a lastDisposalDate (${lastDisposalDate})`,
        );
      }
    }
  }

  /** Un registro ACTIVE exige método de disposición (§12). */
  private validateActiveRequiresDisposal(
    status: WasteManagementStatus,
    disposalMethod: string | undefined,
  ): void {
    if (status === WasteManagementStatus.ACTIVE && !(disposalMethod ?? '').trim()) {
      throw new BadRequestException(
        'Un registro ACTIVE exige disposalMethod (método de disposición ejecutado/en curso)',
      );
    }
  }
}
