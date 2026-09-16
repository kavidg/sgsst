import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EmployeesService } from '../employees/employees.service';
import { User, UserDocument } from '../users/schemas/user.schema';
import { WorkRestriction, WorkRestrictionDocument, RestrictionStatus } from './schemas/work-restriction.schema';
import { CreateWorkRestrictionDto } from './dto/create-work-restriction.dto';
import { UpdateWorkRestrictionDto } from './dto/update-work-restriction.dto';

/**
 * Servicio de restricciones y recomendaciones médico-laborales (3.1.6 — FASE 33).
 *
 * Gestiona registros administrativos y operativos de restricciones/
 * recomendaciones laborales, NO contenido clínico. Reglas:
 *
 * 1. Tenant isolation: todas las operaciones se filtran por companyId.
 * 2. employeeId y responsibleUserId deben pertenecer al mismo tenant.
 * 3. Transiciones de estado controladas (ACTIVE/FOLLOW_UP/CLOSED/CANCELLED).
 * 4. Coherencia temporal: effectiveUntil >= effectiveFrom; fechas válidas.
 * 5. FOLLOW_UP exige followUpDate.
 * 6. No almacena contenido clínico (metadata-only).
 * 7. No infiere evidencia desde MedicalRecommendation/JobProfile/OccupationalExam.
 */
@Injectable()
export class WorkRestrictionService {
  /** Estados terminales: no admiten nuevas transiciones. */
  private static readonly TERMINAL_STATUSES = new Set<RestrictionStatus>([
    RestrictionStatus.CLOSED,
    RestrictionStatus.CANCELLED,
  ]);

  /** Transiciones legales de estado administrativo (§6). */
  private static readonly ALLOWED_TRANSITIONS: Record<RestrictionStatus, RestrictionStatus[]> = {
    [RestrictionStatus.ACTIVE]: [
      RestrictionStatus.FOLLOW_UP,
      RestrictionStatus.CLOSED,
      RestrictionStatus.CANCELLED,
    ],
    [RestrictionStatus.FOLLOW_UP]: [
      RestrictionStatus.ACTIVE,
      RestrictionStatus.CLOSED,
      RestrictionStatus.CANCELLED,
    ],
    [RestrictionStatus.CLOSED]: [],
    [RestrictionStatus.CANCELLED]: [],
  };

  constructor(
    @InjectModel(WorkRestriction.name)
    private readonly restrictionModel: Model<WorkRestrictionDocument>,
    private readonly employeesService: EmployeesService,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // CRUD
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Crea una nueva restricción/recomendación laboral.
   *
   * Validaciones:
   * - employeeId debe existir y pertenecer a companyId.
   * - responsibleUserId (si existe) debe pertenecer a companyId.
   * - effectiveUntil >= effectiveFrom.
   * - FOLLOW_UP exige followUpDate.
   * - companyId se deriva de la sesión, nunca del body.
   */
  async create(
    companyId: string,
    dto: CreateWorkRestrictionDto,
    createdBy?: string,
  ): Promise<WorkRestrictionDocument> {
    // 1. Validar que el employee pertenece a este tenant (§10)
    await this.validateEmployee(companyId, dto.employeeId);

    // 2. Validar que el responsable pertenece a este tenant (§11)
    if (dto.responsibleUserId) {
      await this.validateResponsibleUser(companyId, dto.responsibleUserId);
    }

    // 3. Validar coherencia temporal (§12)
    this.validateDates(dto.receivedAt, dto.effectiveFrom, dto.effectiveUntil, dto.followUpDate);

    // 4. Regla de negocio: FOLLOW_UP exige fecha de seguimiento
    const status = dto.status ?? RestrictionStatus.ACTIVE;
    if (status === RestrictionStatus.FOLLOW_UP && !dto.followUpDate) {
      throw new BadRequestException(
        'FOLLOW_UP exige followUpDate (fecha del seguimiento administrativo)',
      );
    }

    // 5. Crear registro con companyId derivado de la sesión
    const created = await this.restrictionModel.create({
      companyId: new Types.ObjectId(companyId),
      employeeId: new Types.ObjectId(dto.employeeId),
      restrictionType: dto.restrictionType,
      status,
      receivedAt: new Date(dto.receivedAt),
      effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : undefined,
      effectiveUntil: dto.effectiveUntil ? new Date(dto.effectiveUntil) : undefined,
      responsibleUserId: dto.responsibleUserId
        ? new Types.ObjectId(dto.responsibleUserId)
        : undefined,
      actions: dto.actions,
      followUpDate: dto.followUpDate ? new Date(dto.followUpDate) : undefined,
      followUpStatus: dto.followUpStatus,
      evidence: dto.evidence,
      active: dto.active ?? true,
      createdBy: createdBy ?? '',
      updatedBy: createdBy ?? '',
    });

    return created.toObject() as WorkRestrictionDocument;
  }

  /**
   * Lista restricciones/recomendaciones del tenant, activos por defecto.
   */
  async findAll(
    companyId: string,
    options: {
      active?: boolean;
      employeeId?: string;
      status?: string;
      restrictionType?: string;
      limit?: number;
      skip?: number;
    } = {},
  ): Promise<WorkRestrictionDocument[]> {
    const filter: Record<string, unknown> = {
      companyId: new Types.ObjectId(companyId),
    };

    if (options.active !== undefined) {
      filter.active = options.active;
    }

    if (options.employeeId) {
      filter.employeeId = new Types.ObjectId(options.employeeId);
    }

    if (options.status) {
      filter.status = options.status;
    }

    if (options.restrictionType) {
      filter.restrictionType = options.restrictionType;
    }

    const limit = options.limit ?? 100;
    const skip = options.skip ?? 0;

    const results = await this.restrictionModel
      .find(filter)
      .sort({ receivedAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();
    return results as unknown as WorkRestrictionDocument[];
  }

  /**
   * Busca una restricción por ID, validando que pertenece al tenant.
   */
  async findOne(
    companyId: string,
    id: string,
  ): Promise<WorkRestrictionDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    const record = await this.restrictionModel
      .findOne({
        _id: new Types.ObjectId(id),
        companyId: new Types.ObjectId(companyId),
      })
      .lean();

    return record as (WorkRestrictionDocument | null);
  }

  /**
   * Actualiza parcialmente una restricción.
   *
   * Validaciones:
   * - El registro debe existir y pertenecer al tenant.
   * - Si se cambia employeeId, debe pertenecer al mismo tenant.
   * - Si se cambia responsibleUserId, debe pertenecer al mismo tenant.
   * - Transición de estado controlada.
   * - effectiveUntil >= effectiveFrom considerando valores previos.
   * - FOLLOW_UP exige followUpDate (existente o nuevo).
   */
  async update(
    companyId: string,
    id: string,
    dto: UpdateWorkRestrictionDto,
    updatedBy?: string,
  ): Promise<WorkRestrictionDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    // Verificar existencia y pertenencia al tenant
    const existing = await this.restrictionModel.findOne({
      _id: new Types.ObjectId(id),
      companyId: new Types.ObjectId(companyId),
    });

    if (!existing) {
      return null;
    }

    // 1. Validar nuevo employeeId (§10)
    if (dto.employeeId !== undefined) {
      await this.validateEmployee(companyId, dto.employeeId);
    }

    // 2. Validar nuevo responsibleUserId (§11)
    if (dto.responsibleUserId !== undefined && dto.responsibleUserId !== null) {
      await this.validateResponsibleUser(companyId, dto.responsibleUserId);
    }

    // 3. Transición de estado controlada (§6)
    if (dto.status !== undefined && dto.status !== existing.status) {
      this.validateTransition(existing.status, dto.status);
    }

    // 4. Coherencia temporal (§12) considerando valores previos
    const receivedAt = dto.receivedAt ?? existing.receivedAt.toISOString();
    const effectiveFrom =
      dto.effectiveFrom ?? (existing.effectiveFrom ? existing.effectiveFrom.toISOString() : undefined);
    const effectiveUntil =
      dto.effectiveUntil ?? (existing.effectiveUntil ? existing.effectiveUntil.toISOString() : undefined);
    this.validateDates(receivedAt, effectiveFrom, effectiveUntil, dto.followUpDate);

    // 5. FOLLOW_UP exige followUpDate (nuevo o ya presente en el registro)
    const finalStatus = dto.status ?? existing.status;
    if (finalStatus === RestrictionStatus.FOLLOW_UP) {
      const hasFollowUpDate =
        dto.followUpDate !== undefined || existing.followUpDate !== undefined && existing.followUpDate !== null;
      if (!hasFollowUpDate) {
        throw new BadRequestException(
          'FOLLOW_UP exige followUpDate (fecha del seguimiento administrativo)',
        );
      }
    }

    // 6. Construir el objeto de actualización (sin campos clínicos)
    const update: Record<string, unknown> = {};

    if (dto.employeeId !== undefined) {
      update.employeeId = new Types.ObjectId(dto.employeeId);
    }
    if (dto.restrictionType !== undefined) {
      update.restrictionType = dto.restrictionType;
    }
    if (dto.status !== undefined) {
      update.status = dto.status;
    }
    if (dto.receivedAt !== undefined) {
      update.receivedAt = new Date(dto.receivedAt);
    }
    if (dto.effectiveFrom !== undefined) {
      update.effectiveFrom = new Date(dto.effectiveFrom);
    }
    if (dto.effectiveUntil !== undefined) {
      update.effectiveUntil = new Date(dto.effectiveUntil);
    }
    if (dto.responsibleUserId !== undefined) {
      update.responsibleUserId = dto.responsibleUserId === null
        ? undefined
        : new Types.ObjectId(dto.responsibleUserId);
    }
    if (dto.actions !== undefined) {
      update.actions = dto.actions;
    }
    if (dto.followUpDate !== undefined) {
      update.followUpDate = new Date(dto.followUpDate);
    }
    if (dto.followUpStatus !== undefined) {
      update.followUpStatus = dto.followUpStatus;
    }
    if (dto.evidence !== undefined) {
      update.evidence = dto.evidence;
    }
    if (dto.active !== undefined) {
      update.active = dto.active;
    }

    update.updatedBy = updatedBy ?? '';

    const updated = await this.restrictionModel
      .findByIdAndUpdate(id, update, { new: true })
      .lean();

    return updated as (WorkRestrictionDocument | null);
  }

  /**
   * Desactiva (borrado lógico) una restricción.
   */
  async deactivate(
    companyId: string,
    id: string,
    updatedBy?: string,
  ): Promise<WorkRestrictionDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    const updated = await this.restrictionModel
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

    return updated as (WorkRestrictionDocument | null);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Validaciones privadas
  // ───────────────────────────────────────────────────────────────────────────

  /** El empleado debe existir y pertenecer al tenant (§10). */
  private async validateEmployee(companyId: string, employeeId: string): Promise<void> {
    if (!Types.ObjectId.isValid(employeeId)) {
      throw new BadRequestException(`employeeId inválido: ${employeeId}`);
    }
    const employee = await this.employeesService.findOne(
      companyId,
      new Types.ObjectId(employeeId),
    );
    if (!employee) {
      throw new BadRequestException(
        `Employee ${employeeId} no existe o no pertenece a la empresa ${companyId}`,
      );
    }
  }

  /**
   * El usuario responsable debe pertenecer al tenant (§11).
   * Reutiliza el modelo User registrado en el módulo (patrón del proyecto:
   * referencia por _id + companyId en un solo query).
   */
  private async validateResponsibleUser(
    companyId: string,
    responsibleUserId: string,
  ): Promise<void> {
    if (!Types.ObjectId.isValid(responsibleUserId)) {
      throw new BadRequestException(`responsibleUserId inválido: ${responsibleUserId}`);
    }
    const user = await this.userModel
      .findOne({
        _id: new Types.ObjectId(responsibleUserId),
        companyId: new Types.ObjectId(companyId),
      })
      .lean();
    if (!user) {
      throw new BadRequestException(
        `Usuario ${responsibleUserId} no existe o no pertenece a la empresa ${companyId}`,
      );
    }
  }

  /** Coherencia temporal (§12): fechas válidas + effectiveUntil >= effectiveFrom. */
  private validateDates(
    receivedAt?: string,
    effectiveFrom?: string,
    effectiveUntil?: string,
    followUpDate?: string,
  ): void {
    for (const [name, value] of [
      ['receivedAt', receivedAt],
      ['effectiveFrom', effectiveFrom],
      ['effectiveUntil', effectiveUntil],
      ['followUpDate', followUpDate],
    ] as const) {
      if (value !== undefined && value !== null && Number.isNaN(new Date(value).getTime())) {
        throw new BadRequestException(`Fecha inválida en ${name}: ${value}`);
      }
    }

    if (effectiveFrom && effectiveUntil) {
      if (new Date(effectiveUntil) < new Date(effectiveFrom)) {
        throw new BadRequestException(
          `effectiveUntil (${effectiveUntil}) no puede ser anterior a effectiveFrom (${effectiveFrom})`,
        );
      }
    }
  }

  /** Transición de estado legal (§6). */
  private validateTransition(from: RestrictionStatus, to: RestrictionStatus): void {
    if (from === to) {
      return;
    }
    if (WorkRestrictionService.TERMINAL_STATUSES.has(from)) {
      throw new BadRequestException(
        `Estado terminal ${from} no admite transición a ${to}`,
      );
    }
    const allowed = WorkRestrictionService.ALLOWED_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw new BadRequestException(
        `Transición de estado no permitida: ${from} → ${to}`,
      );
    }
  }
}
