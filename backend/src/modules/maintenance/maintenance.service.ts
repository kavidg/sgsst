import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import {
  Maintenance,
  MaintenanceDocument,
  MaintenanceStatus,
} from './schemas/maintenance.schema';
import {
  isMaintenanceCompleted,
  isMaintenanceTransitionAllowed,
  normalizeMaintenanceStatus,
} from './utils/maintenance-status.util';
import { CreateMaintenanceDto } from './dto/create-maintenance.dto';
import { UpdateMaintenanceDto } from './dto/update-maintenance.dto';
import { UpdateMaintenanceStatusDto } from './dto/update-maintenance-status.dto';

/** Roles con permiso de escritura en mantenimiento (patrón assertCanWrite del repo). */
const MAINTENANCE_WRITE_ROLES = new Set(['owner', 'admin']);

/**
 * Servicio del módulo Maintenance (4.2.5 — V1).
 *
 * Reglas de negocio:
 * - Transiciones de estado validadas (PROGRAMMED → IN_PROGRESS → COMPLETED,
 *   CANCELLED terminal salvo reapertura explícita).
 * - COMPLETED exige completedDate + evidencia (completar sin evidencia
 *   viola la trazabilidad documental del estándar).
 * - OVERDUE se calcula dinámicamente en los listados (sin cron).
 * - Toda operación es tenant-scoped: el companyId SIEMPRE se resuelve
 *   server-side (controller) y el service re-valida pertenencia.
 * - El historial se agrega server-side con el uid autenticado y nunca se
 *   acepta del cliente.
 */
@Injectable()
export class MaintenanceService {
  constructor(
    @InjectModel(Maintenance.name)
    private readonly maintenanceModel: Model<MaintenanceDocument>,
  ) {}

  /** V1: la escritura queda reservada a owner/admin (patrón @Roles + assertCanWrite). */
  assertCanWrite(role: string | undefined): void {
    if (!role || !MAINTENANCE_WRITE_ROLES.has(role)) {
      throw new ForbiddenException('No tiene permisos para modificar mantenimientos');
    }
  }

  async create(companyId: Types.ObjectId, dto: CreateMaintenanceDto, userUid: string): Promise<Maintenance> {
    const requested = dto.status ? normalizeMaintenanceStatus(dto.status) : undefined;
    if (requested === MaintenanceStatus.COMPLETED || requested === MaintenanceStatus.CANCELLED) {
      throw new BadRequestException(
        'Un mantenimiento no puede crearse con estado COMPLETED o CANCELLED: registre la ejecución con PATCH /maintenance/:id/status',
      );
    }
    const status = requested ?? MaintenanceStatus.PROGRAMMED;

    const created = new this.maintenanceModel({
      ...dto,
      status,
      companyId,
      createdBy: userUid,
      updatedBy: userUid,
      statusHistory: [],
    });
    return created.save();
  }

  /**
   * Listado tenant-scoped con filtros opcionales (status, maintenanceType,
   * itemType, rango de fechas sobre plannedDate). Re-valida companyId aunque
   * el controller ya lo haya resuelto (defensa en profundidad).
   */
  async findAll(
    companyId: Types.ObjectId,
    filters: {
      status?: string;
      maintenanceType?: string;
      itemType?: string;
      from?: string;
      to?: string;
    } = {},
  ): Promise<Maintenance[]> {
    const query: FilterQuery<MaintenanceDocument> = { companyId };
    if (filters.status) query.status = filters.status;
    if (filters.maintenanceType) query.maintenanceType = filters.maintenanceType;
    if (filters.itemType) query.itemType = filters.itemType;
    if (filters.from || filters.to) {
      query.plannedDate = {};
      if (filters.from) query.plannedDate.$gte = new Date(filters.from);
      if (filters.to) query.plannedDate.$lte = new Date(filters.to);
    }
    return this.maintenanceModel.find(query).sort({ plannedDate: 1, createdAt: 1 }).exec();
  }

  async findOne(id: string, companyId: Types.ObjectId): Promise<Maintenance> {
    const maintenance = await this.maintenanceModel
      .findOne({ _id: id, companyId })
      .exec();

    if (!maintenance) {
      throw new NotFoundException(`Maintenance with id ${id} not found`);
    }
    return maintenance;
  }

  /**
   * Edición de información. Las transiciones de estado NO pasan por aquí
   * (ver updateStatus). Sobre COMPLETED solo se permite registrar/editar
   * ejecución (evidencia, observaciones) — no se "reabre" por la vía de
   * edición.
   */
  async update(
    id: string,
    companyId: Types.ObjectId,
    dto: UpdateMaintenanceDto,
    userUid: string,
  ): Promise<Maintenance> {
    const existing = await this.findOne(id, companyId);

    if (isMaintenanceCompleted(existing.status)) {
      const executableFields: string[] = ['evidenceUrl', 'observations'];
      const requestedFields = Object.keys(dto).filter((key) => (dto as Record<string, unknown>)[key] !== undefined);
      const onlyExecutionFields = requestedFields.length > 0 && requestedFields.every((f) => executableFields.includes(f));
      if (!onlyExecutionFields) {
        throw new BadRequestException(
          'Un mantenimiento COMPLETED solo permite registrar evidencia u observaciones',
        );
      }
    }

    const maintenance = await this.maintenanceModel
      .findOneAndUpdate(
        { _id: id, companyId },
        { $set: { ...dto, updatedBy: userUid } },
        { new: true, runValidators: true },
      )
      .exec();

    if (!maintenance) {
      throw new NotFoundException(`Maintenance with id ${id} not found`);
    }
    return maintenance;
  }

  async remove(id: string, companyId: Types.ObjectId): Promise<void> {
    const result = await this.maintenanceModel
      .deleteOne({ _id: id, companyId })
      .exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException(`Maintenance with id ${id} not found`);
    }
  }

  /**
   * Cambio de estado con transición validada + historial inmutable
   * (from/to/changedAt/changedBy). Server-side only.
   */
  async updateStatus(
    id: string,
    companyId: Types.ObjectId,
    dto: UpdateMaintenanceStatusDto,
    userUid: string,
  ): Promise<Maintenance> {
    const targetStatus = normalizeMaintenanceStatus(dto.status);
    if (!targetStatus) {
      throw new BadRequestException(`Estado de mantenimiento desconocido: ${dto.status}`);
    }

    const existing = await this.findOne(id, companyId);
    const currentStatus = normalizeMaintenanceStatus(existing.status) ?? MaintenanceStatus.PROGRAMMED;

    if (!isMaintenanceTransitionAllowed(currentStatus, targetStatus)) {
      throw new BadRequestException(
        `Transición de estado no permitida: ${currentStatus} → ${targetStatus}`,
      );
    }

    const update: Record<string, unknown> = {
      status: targetStatus,
      updatedBy: userUid,
    };

    if (targetStatus === MaintenanceStatus.COMPLETED) {
      const completedDate = dto.completedDate ? new Date(dto.completedDate) : undefined;
      if (!completedDate || Number.isNaN(completedDate.getTime())) {
        throw new BadRequestException('completedDate es obligatorio al completar un mantenimiento');
      }
      // ETAPA 6C — Regla de negocio: no puede completarse con fecha futura
      // (la ejecución ya ocurrió o no ocurrió; nunca "ocurrirá"). Tolerancia
      // de 60s para diferencias de reloj cliente/servidor.
      const now = new Date();
      if (completedDate.getTime() > now.getTime() + 60_000) {
        throw new BadRequestException('completedDate no puede ser una fecha futura');
      }
      // ETAPA 6C — Evidencia ASOCIADA AL CIERRE: la URL previa de un registro
      // PROGRAMMED no acredita la ejecución; la evidencia válida es la que
      // acompaña la operación de COMPLETED y queda registrada en el historial.
      const closureEvidence = dto.evidenceUrl !== undefined ? dto.evidenceUrl.trim() : '';
      if (closureEvidence.length === 0) {
        throw new BadRequestException(
          'evidenceUrl es obligatorio al completar un mantenimiento (trazabilidad documental de la ejecución)',
        );
      }
      update.completedDate = completedDate;
      update.evidenceUrl = closureEvidence;
      if (dto.observations !== undefined && dto.observations.trim().length > 0) {
        update.observations = dto.observations.trim();
      }
    }

    if (targetStatus === MaintenanceStatus.CANCELLED && dto.comment) {
      update.observations = dto.comment;
    }

    const historyEntry = {
      from: currentStatus,
      to: targetStatus,
      changedAt: new Date(),
      changedBy: userUid,
      // ETAPA 6C: la evidencia queda asociada al evento de cierre del estado.
      ...(targetStatus === MaintenanceStatus.COMPLETED ? { evidenceUrl: update.evidenceUrl as string } : {}),
      ...(dto.comment ? { comment: dto.comment } : {}),
    };

    const maintenance = await this.maintenanceModel
      .findOneAndUpdate(
        { _id: id, companyId },
        {
          $set: update,
          $push: { statusHistory: historyEntry },
        },
        { new: true, runValidators: true },
      )
      .exec();

    if (!maintenance) {
      throw new NotFoundException(`Maintenance with id ${id} not found`);
    }
    return maintenance;
  }
}
