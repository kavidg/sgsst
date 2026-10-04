import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  EppDelivery,
  EppDeliveryCondition,
  EppDeliveryDocument,
  EppDeliveryHistoryAction,
  EppDeliveryStatus,
} from './schemas/epp-delivery.schema';
import { SST_EPP_ITEM_CODE, SST_EPP_LEGACY_ITEM_CODES } from '../phva-advanced/schemas/phva-advanced-epp.schema';
import { Employee, EmployeeDocument } from '../employees/schemas/employee.schema';
import { SstEpp, SstEppDocument } from '../phva-advanced/schemas/phva-advanced-epp.schema';
import { EppApplicability, EppApplicabilityDocument } from './schemas/epp-applicability.schema';
import { JobProfile, JobProfileDocument } from '../job-profile/schemas/job-profile.schema';
import { CreateEppDeliveryDto } from './dto/create-epp-delivery.dto';
import { UpdateEppDeliveryDto } from './dto/update-epp-delivery.dto';
import { UpdateEppDeliveryStatusDto } from './dto/update-epp-delivery-status.dto';
import { CreateEppApplicabilityDto } from './dto/create-epp-applicability.dto';
import { UpdateEppApplicabilityDto } from './dto/update-epp-applicability.dto';
import { EppApplicabilityMatrixDto } from './dto/epp-applicability-matrix.dto';
import { isEppDeliveryOverdue, isEppDeliveryTransitionAllowed, normalizeEppDeliveryStatus } from './utils/epp-delivery-status.util';

export interface EppDeliveryFilters {
  employeeId?: string;
  eppItemId?: string;
  status?: string;
  from?: string;
  to?: string;
  overdue?: string;
}

/**
 * Service del módulo de entregas de EPP (4.2.6 — Alternativa B).
 *
 * Reglas defensivas (server-side, nunca delegadas al frontend):
 *  - companyId SIEMPRE del usuario autenticado; las consultas son tenant-scoped.
 *  - employeeId debe ser un Employee REAL de la MISMA empresa (404 si no).
 *  - eppItemId debe existir en el catálogo SstEpp de la MISMA empresa
 *    (identidad canónica '4.2.6' o legacy '1.2.3' para lectura) — 404/400 si no.
 *  - deliveryDate no futura; expected/actualReplacementDate >= deliveryDate.
 *  - transiciones de estado validadas; historial inmutable server-side.
 */
@Injectable()
export class EppService {
  constructor(
    @InjectModel(EppDelivery.name) private readonly deliveryModel: Model<EppDeliveryDocument>,
    @InjectModel(Employee.name) private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(SstEpp.name) private readonly eppModel: Model<SstEppDocument>,
    @InjectModel(EppApplicability.name) private readonly applicabilityModel: Model<EppApplicabilityDocument>,
    @InjectModel(JobProfile.name) private readonly jobProfileModel: Model<JobProfileDocument>,
  ) {}

  /** Permisos de escritura V1 (patrón Maintenance): owner/admin; manager y member read-only. */
  assertCanWrite(role?: string): void {
    if (role !== 'owner' && role !== 'admin') {
      throw new ForbiddenException('Solo owner o admin pueden modificar entregas de EPP');
    }
  }

  async create(companyId: Types.ObjectId, dto: CreateEppDeliveryDto, userUid: string): Promise<EppDeliveryDocument> {
    // ── Trabajador real, misma empresa (404 si no existe / cross-tenant) ──
    const employee = await this.employeeModel
      .findOne({ _id: new Types.ObjectId(dto.employeeId), companyId })
      .exec();
    if (!employee) {
      throw new NotFoundException('Trabajador no encontrado en la empresa actual');
    }
    if (!employee.name || employee.name.trim().length === 0) {
      throw new BadRequestException('El trabajador no tiene nombre registrado');
    }

    // ── Elemento del catálogo/matriz SstEpp de la MISMA empresa ──
    const epp = await this.findEppRecord(companyId);
    const catalogItem = (epp.catalog ?? []).find((item) => item.eppId === dto.eppItemId);
    if (!catalogItem) {
      throw new NotFoundException(
        'El elemento EPP indicado no existe en el catálogo de la empresa (gestiónelo en el módulo EPP)',
      );
    }

    // ── Fechas y cantidad ──
    const deliveryDate = new Date(dto.deliveryDate);
    if (Number.isNaN(deliveryDate.getTime())) {
      throw new BadRequestException('deliveryDate no es una fecha válida');
    }
    // deliveryDate representa ENTREGA REALIZADA: no se aceptan fechas futuras
    // (la programación preventiva vive en la matriz/planificación, no aquí).
    if (deliveryDate.getTime() > Date.now() + 60_000) {
      throw new BadRequestException('deliveryDate no puede ser una fecha futura (la entrega debe estar realizada)');
    }

    const expectedReplacementDate = dto.expectedReplacementDate
      ? new Date(dto.expectedReplacementDate)
      : undefined;
    if (expectedReplacementDate && Number.isNaN(expectedReplacementDate.getTime())) {
      throw new BadRequestException('expectedReplacementDate no es una fecha válida');
    }
    if (expectedReplacementDate && expectedReplacementDate.getTime() < deliveryDate.getTime()) {
      throw new BadRequestException('expectedReplacementDate no puede ser anterior a deliveryDate');
    }

    const quantity = dto.quantity ?? 1;
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new BadRequestException('quantity debe ser un entero positivo');
    }

    // El estado inicial es SIEMPRE ACTIVE (server-side); el cliente no lo envía.
    const created = await this.deliveryModel.create({
      companyId,
      employeeId: employee._id,
      employeeNameSnapshot: employee.name.trim(),
      eppItemId: dto.eppItemId,
      eppNameSnapshot: catalogItem.name,
      deliveryDate,
      expectedReplacementDate,
      quantity,
      condition: dto.condition ?? EppDeliveryCondition.GOOD,
      status: EppDeliveryStatus.ACTIVE,
      evidenceUrl: dto.evidenceUrl?.trim() || undefined,
      certificateUrl: dto.certificateUrl?.trim() || undefined,
      observations: dto.observations?.trim() || undefined,
      createdBy: userUid,
      history: [
        {
          action: EppDeliveryHistoryAction.CREATED,
          date: new Date(),
          performedBy: userUid,
          comment: `Entrega de ${quantity} × ${catalogItem.name} a ${employee.name.trim()}`,
        },
      ],
    });
    return created;
  }

  async findAll(companyId: Types.ObjectId, filters: EppDeliveryFilters = {}): Promise<EppDeliveryDocument[]> {
    const query: Record<string, unknown> = { companyId };

    if (filters.employeeId) query.employeeId = new Types.ObjectId(filters.employeeId);
    if (filters.eppItemId) query.eppItemId = filters.eppItemId;

    if (filters.status) {
      const status = normalizeEppDeliveryStatus(filters.status);
      if (!status) throw new BadRequestException(`Estado desconocido: ${filters.status}`);
      query.status = status;
    }

    const dateFilter: Record<string, Date> = {};
    if (filters.from) {
      const from = new Date(filters.from);
      if (Number.isNaN(from.getTime())) throw new BadRequestException('from no es una fecha válida');
      dateFilter.$gte = from;
    }
    if (filters.to) {
      const to = new Date(filters.to);
      if (Number.isNaN(to.getTime())) throw new BadRequestException('to no es una fecha válida');
      dateFilter.$lte = to;
    }
    if (Object.keys(dateFilter).length > 0) query.deliveryDate = dateFilter;

    const deliveries = await this.deliveryModel.find(query).sort({ deliveryDate: -1 }).exec();

    // "overdue" es un estado DINÁMICO de reposición: se calcula en memoria
    // (sin cron) sobre las entregas del tenant.
    if (filters.overdue === 'true') {
      const now = new Date();
      return deliveries.filter((d) => isEppDeliveryOverdue(d, now));
    }
    return deliveries;
  }

  async findOne(id: string, companyId: Types.ObjectId): Promise<EppDeliveryDocument> {
    const delivery = await this.deliveryModel.findOne({ _id: id, companyId }).exec();
    if (!delivery) {
      // 404 único: no revela si el recurso existe en otra empresa (cross-tenant).
      throw new NotFoundException(`EppDelivery with id ${id} not found`);
    }
    return delivery;
  }

  async update(id: string, companyId: Types.ObjectId, dto: UpdateEppDeliveryDto, userUid: string): Promise<EppDeliveryDocument> {
    const existing = await this.findOne(id, companyId);

    const update: Record<string, unknown> = { updatedBy: userUid };

    if (dto.deliveryDate !== undefined) {
      const deliveryDate = new Date(dto.deliveryDate);
      if (Number.isNaN(deliveryDate.getTime())) {
        throw new BadRequestException('deliveryDate no es una fecha válida');
      }
      if (deliveryDate.getTime() > Date.now() + 60_000) {
        throw new BadRequestException('deliveryDate no puede ser una fecha futura (la entrega debe estar realizada)');
      }
      update.deliveryDate = deliveryDate;
    }

    if (dto.expectedReplacementDate !== undefined) {
      const expected = new Date(dto.expectedReplacementDate);
      if (Number.isNaN(expected.getTime())) {
        throw new BadRequestException('expectedReplacementDate no es una fecha válida');
      }
      const deliveryDate = (update.deliveryDate as Date) ?? existing.deliveryDate;
      if (expected.getTime() < deliveryDate.getTime()) {
        throw new BadRequestException('expectedReplacementDate no puede ser anterior a deliveryDate');
      }
      update.expectedReplacementDate = expected;
    }

    if (dto.actualReplacementDate !== undefined) {
      const actual = new Date(dto.actualReplacementDate);
      if (Number.isNaN(actual.getTime())) {
        throw new BadRequestException('actualReplacementDate no es una fecha válida');
      }
      const deliveryDate = (update.deliveryDate as Date) ?? existing.deliveryDate;
      if (actual.getTime() < deliveryDate.getTime()) {
        throw new BadRequestException('actualReplacementDate no puede ser anterior a deliveryDate');
      }
      update.actualReplacementDate = actual;
    }

    if (dto.quantity !== undefined) update.quantity = dto.quantity;
    if (dto.condition !== undefined) update.condition = dto.condition;
    if (dto.evidenceUrl !== undefined) update.evidenceUrl = dto.evidenceUrl.trim() || undefined;
    if (dto.certificateUrl !== undefined) update.certificateUrl = dto.certificateUrl.trim() || undefined;
    if (dto.observations !== undefined) update.observations = dto.observations.trim() || undefined;

    // El historial es inmutable y server-side: nunca entra en $set del cliente.
    const delivery = await this.deliveryModel
      .findOneAndUpdate(
        { _id: id, companyId },
        {
          $set: update,
          $push: {
            history: {
              action: EppDeliveryHistoryAction.UPDATED,
              date: new Date(),
              performedBy: userUid,
              comment: 'Actualización de datos de la entrega',
            },
          },
        },
        { new: true, runValidators: true },
      )
      .exec();

    if (!delivery) throw new NotFoundException(`EppDelivery with id ${id} not found`);
    return delivery;
  }

  async updateStatus(
    id: string,
    companyId: Types.ObjectId,
    dto: UpdateEppDeliveryStatusDto,
    userUid: string,
  ): Promise<EppDeliveryDocument> {
    const targetStatus = normalizeEppDeliveryStatus(dto.status);
    if (!targetStatus || targetStatus === EppDeliveryStatus.ACTIVE) {
      throw new BadRequestException(`Estado destino no permitido: ${dto.status}`);
    }

    const existing = await this.findOne(id, companyId);
    const currentStatus = normalizeEppDeliveryStatus(existing.status) ?? EppDeliveryStatus.ACTIVE;

    if (!isEppDeliveryTransitionAllowed(currentStatus, targetStatus)) {
      throw new BadRequestException(`Transición de estado no permitida: ${currentStatus} → ${targetStatus}`);
    }

    const update: Record<string, unknown> = { status: targetStatus, updatedBy: userUid };

    if (targetStatus === EppDeliveryStatus.REPLACED) {
      const actualReplacementDate = dto.actualReplacementDate ? new Date(dto.actualReplacementDate) : new Date();
      if (Number.isNaN(actualReplacementDate.getTime())) {
        throw new BadRequestException('actualReplacementDate no es una fecha válida');
      }
      if (actualReplacementDate.getTime() < existing.deliveryDate.getTime()) {
        throw new BadRequestException('actualReplacementDate no puede ser anterior a deliveryDate');
      }
      update.actualReplacementDate = actualReplacementDate;
    }

    if (dto.evidenceUrl !== undefined && dto.evidenceUrl.trim().length > 0) {
      update.evidenceUrl = dto.evidenceUrl.trim();
    }
    if (dto.comment !== undefined && dto.comment.trim().length > 0) {
      update.observations = dto.comment.trim();
    }

    const delivery = await this.deliveryModel
      .findOneAndUpdate(
        { _id: id, companyId },
        {
          $set: update,
          $push: {
            history: {
              action: targetStatus,
              date: new Date(),
              performedBy: userUid,
              ...(dto.comment ? { comment: dto.comment.trim() } : {}),
            },
          },
        },
        { new: true, runValidators: true },
      )
      .exec();

    if (!delivery) throw new NotFoundException(`EppDelivery with id ${id} not found`);
    return delivery;
  }

  // ── helpers ──

  private async findEppRecord(companyId: Types.ObjectId): Promise<SstEppDocument> {
    const record = await this.eppModel
      .findOne({
        companyId,
        itemCode: { $in: [SST_EPP_ITEM_CODE, ...SST_EPP_LEGACY_ITEM_CODES] },
      })
      .exec();
    if (!record) {
      throw new BadRequestException(
        'La empresa no tiene catálogo/matriz EPP configurado (módulo EPP). Defínalo antes de registrar entregas.',
      );
    }
    return record;
  }

  // ═════════════════════════════════════════════════════════════════════
  // Matriz de aplicabilidad Cargo → EPP (4.2.6)
  //
  // SOLO define REQUISITOS (qué EPP requiere cada JobProfile). NO acredita
  // entregas (esa es EppDelivery) y NO genera score (el scoring se adapta en
  // una etapa posterior). Consultas SIEMPRE tenant-scoped (§7).
  // ═════════════════════════════════════════════════════════════════════

  /** Crea una relación Cargo → EPP con validaciones de negocio (§6). */
  async createApplicability(
    companyId: Types.ObjectId,
    dto: CreateEppApplicabilityDto,
    userUid: string,
  ): Promise<EppApplicabilityDocument> {
    // ── Validación 1: JobProfile real de la MISMA empresa (404 si no) ──
    const jobProfile = await this.jobProfileModel
      .findOne({ _id: new Types.ObjectId(dto.jobProfileId), companyId })
      .exec();
    if (!jobProfile) {
      throw new NotFoundException('Perfil de cargo no encontrado en la empresa actual');
    }

    // ── Validación 2/3: eppItemId en el catálogo SstEpp de la empresa ──
    // Identidad canónica '4.2.6' con legacy '1.2.3' SOLO para lectura
    // histórica (nunca se crean documentos nuevos con el código legacy).
    const eppRecord = await this.findEppRecord(companyId);
    const catalogItem = (eppRecord.catalog ?? []).find((item) => item.eppId === dto.eppItemId);
    if (!catalogItem) {
      throw new NotFoundException(
        'El elemento EPP indicado no existe en el catálogo de la empresa (gestiónelo en el módulo EPP)',
      );
    }
    // Un ítem INACTIVO no admite NUEVAS relaciones (una relación histórica ya
    // creada puede conservarse y desactivarse posteriormente).
    if (catalogItem.active === false) {
      throw new BadRequestException(
        'El elemento EPP está inactivo en el catálogo: no se pueden crear nuevas relaciones de aplicabilidad',
      );
    }

    // ── Validación 4: unicidad lógica empresa+cargo+EPP (409) ──
    const duplicate = await this.applicabilityModel
      .findOne({ companyId, jobProfileId: jobProfile._id, eppItemId: dto.eppItemId })
      .exec();
    if (duplicate) {
      throw new ConflictException(
        'Ya existe una relación entre este cargo y este elemento EPP (desactívela o edítela en lugar de duplicarla)',
      );
    }

    // Server-side: companyId/createdBy nunca provienen del DTO.
    return this.applicabilityModel.create({
      companyId,
      jobProfileId: jobProfile._id,
      eppItemId: dto.eppItemId,
      required: dto.required ?? true,
      reason: dto.reason?.trim() || undefined,
      scope: dto.scope?.trim() || undefined,
      active: dto.active ?? true,
      createdBy: userUid,
    });
  }

  /** Matriz completa del tenant (owner/admin/manager/member: lectura). */
  async findApplicabilities(companyId: Types.ObjectId): Promise<EppApplicabilityDocument[]> {
    return this.applicabilityModel.find({ companyId }).sort({ createdAt: 1 }).exec();
  }

  /** Relaciones de UN cargo del tenant (404 si el cargo no es de la empresa). */
  async findApplicabilitiesByJobProfile(
    companyId: Types.ObjectId,
    jobProfileId: string,
  ): Promise<EppApplicabilityDocument[]> {
    const jobProfile = await this.jobProfileModel
      .findOne({ _id: new Types.ObjectId(jobProfileId), companyId })
      .exec();
    if (!jobProfile) {
      throw new NotFoundException('Perfil de cargo no encontrado en la empresa actual');
    }
    return this.applicabilityModel.find({ companyId, jobProfileId: jobProfile._id }).exec();
  }

  /** Relaciones de UN elemento EPP del tenant (404 si el ítem no existe). */
  async findApplicabilitiesByEppItem(
    companyId: Types.ObjectId,
    eppItemId: string,
  ): Promise<EppApplicabilityDocument[]> {
    const eppRecord = await this.findEppRecord(companyId);
    if (!(eppRecord.catalog ?? []).some((item) => item.eppId === eppItemId)) {
      throw new NotFoundException('El elemento EPP indicado no existe en el catálogo de la empresa');
    }
    return this.applicabilityModel.find({ companyId, eppItemId }).exec();
  }

  /** Una relación, SIEMPRE tenant-scoped (nunca findById como autoridad única). */
  async findApplicability(id: string, companyId: Types.ObjectId): Promise<EppApplicabilityDocument> {
    const relation = await this.applicabilityModel.findOne({ _id: id, companyId }).exec();
    if (!relation) {
      // 404 único: no revela si el recurso existe en otra empresa (cross-tenant).
      throw new NotFoundException(`EppApplicability with id ${id} not found`);
    }
    return relation;
  }

  /**
   * Actualiza SOLO contenido (required/reason/scope/active). La identidad
   * (jobProfileId/eppItemId/companyId) es inmutable por DTO: para cambiar
   * cargo o EPP, desactivar y crear una nueva relación.
   */
  async updateApplicability(
    id: string,
    companyId: Types.ObjectId,
    dto: UpdateEppApplicabilityDto,
    userUid: string,
  ): Promise<EppApplicabilityDocument> {
    const update: Record<string, unknown> = { updatedBy: userUid };
    if (dto.required !== undefined) update.required = dto.required;
    if (dto.reason !== undefined) update.reason = dto.reason.trim() || undefined;
    if (dto.scope !== undefined) update.scope = dto.scope.trim() || undefined;
    if (dto.active !== undefined) update.active = dto.active;

    const relation = await this.applicabilityModel
      .findOneAndUpdate({ _id: id, companyId }, { $set: update }, { new: true, runValidators: true })
      .exec();
    if (!relation) {
      throw new NotFoundException(`EppApplicability with id ${id} not found`);
    }
    return relation;
  }

  /** Forma enriquecida de una relación para la UI (snapshots de RESPUESTA;
   *  la fuente de verdad sigue siendo JobProfile + SstEpp.catalog + esta tabla). */
  private enrichRelation(
    relation: EppApplicabilityDocument,
    profileNames: Map<string, { name: string; code: string }>,
    catalogById: Map<string, { name: string; category: string; standard: string }>,
  ): EppApplicabilityMatrixDto['assignments'][number] {
    const profile = profileNames.get(String(relation.jobProfileId));
    const item = catalogById.get(relation.eppItemId);
    return {
      id: String(relation._id),
      jobProfileId: String(relation.jobProfileId),
      jobProfileName: profile?.name ?? '(perfil eliminado)',
      eppItemId: relation.eppItemId,
      eppName: item?.name ?? '(elemento no encontrado)',
      category: item?.category ?? '',
      standard: item?.standard ?? '',
      required: relation.required,
      ...(relation.reason ? { reason: relation.reason } : {}),
      ...(relation.scope ? { scope: relation.scope } : {}),
      active: relation.active,
    };
  }

  /**
   * Endpoint de matriz para la UI (§10): JobProfiles de la empresa + EPP
   * activos del catálogo + relaciones (activas e inactivas, cada una con su
   * flag). Tres consultas en total (sin N+1); los nombres son snapshots de
   * respuesta, NUNCA duplicados persistentes.
   */
  async getEppApplicabilityMatrix(companyId: Types.ObjectId): Promise<EppApplicabilityMatrixDto> {
    const [profiles, eppRecords, relations] = await Promise.all([
      this.jobProfileModel.find({ companyId }).sort({ name: 1 }).exec(),
      // Búsqueda directa (sin findEppRecord): una empresa sin matriz EPP aún
      // puede tener JobProfiles; simplemente no tendrá eppItems.
      this.eppModel
        .findOne({ companyId, itemCode: { $in: [SST_EPP_ITEM_CODE, ...SST_EPP_LEGACY_ITEM_CODES] } })
        .exec(),
      this.applicabilityModel.find({ companyId }).sort({ createdAt: 1 }).exec(),
    ]);

    const jobProfiles = profiles.map((p) => ({
      id: String(p._id),
      code: p.code,
      name: p.name,
      active: p.active === true,
    }));

    const activeCatalog = (eppRecords?.catalog ?? []).filter((item) => item.active !== false);
    const eppItems = activeCatalog.map((item) => ({
      id: item.eppId,
      name: item.name,
      category: item.category,
      standard: item.standard ?? '',
      active: true,
    }));

    const profileNames = new Map(
      profiles.map((p) => [String(p._id), { name: p.name, code: p.code }]),
    );
    const catalogById = new Map(
      (eppRecords?.catalog ?? []).map((item) => [
        item.eppId,
        { name: item.name, category: item.category, standard: item.standard ?? '' },
      ]),
    );

    return {
      jobProfiles,
      eppItems,
      assignments: relations.map((r) => this.enrichRelation(r, profileNames, catalogById)),
    };
  }
}
