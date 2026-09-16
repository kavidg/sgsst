import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateHealthPromotionActivityDto } from './dto/create-health-promotion.dto';
import { UpdateHealthPromotionActivityDto } from './dto/update-health-promotion.dto';
import {
  HealthPromotionActivity,
  HealthPromotionActivityDocument,
  HealthPromotionActivityStatus,
} from './schemas/health-promotion-activity.schema';
import { Employee, EmployeeDocument } from '../employees/schemas/employee.schema';
import { Risk, RiskDocument } from '../risks/schemas/risk.schema';

/**
 * Servicio de HealthPromotionActivity (3.1.2 — Promoción y prevención en salud).
 *
 * Toda operación está protegida por tenant: cada método recibe companyId y
 * filtra por `companyId`. Las referencias a trabajadores (Employee) y a la
 * matriz de peligros (Risk) se validan contra el MISMO tenant para impedir
 * referencias cross-tenant.
 *
 * Integridad: una actividad marcada como COMPLETED (ejecución real) exige
 * fecha y no puede tener una fecha futura. Las actividades futuras permanecen
 * PLANNED y NO se consideran evidencia de ejecución.
 */
@Injectable()
export class HealthPromotionService {
  constructor(
    @InjectModel(HealthPromotionActivity.name)
    private readonly activityModel: Model<HealthPromotionActivityDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(Risk.name)
    private readonly riskModel: Model<RiskDocument>,
  ) {}

  /** Crea una actividad asignando companyId desde la sesión. */
  async create(
    companyId: Types.ObjectId,
    dto: CreateHealthPromotionActivityDto,
    actorUid?: string,
  ): Promise<HealthPromotionActivity> {
    await this.assertIntegrity(companyId, dto);

    const employeeIds = this.collectEmployeeIds(dto);
    await this.assertEmployeesInCompany(companyId, employeeIds);
    await this.assertRisksInCompany(companyId, dto.relatedRiskIds ?? []);

    const created = new this.activityModel({
      ...dto,
      ...(dto.targetEmployeeIds
        ? { targetEmployeeIds: dto.targetEmployeeIds.map((id) => new Types.ObjectId(id)) }
        : {}),
      ...(dto.participantEmployeeIds
        ? { participantEmployeeIds: dto.participantEmployeeIds.map((id) => new Types.ObjectId(id)) }
        : {}),
      ...(dto.relatedRiskIds
        ? { relatedRiskIds: dto.relatedRiskIds.map((id) => new Types.ObjectId(id)) }
        : {}),
      ...(dto.activityDate ? { activityDate: new Date(dto.activityDate) } : {}),
      companyId,
      createdBy: actorUid ?? '',
      updatedBy: actorUid ?? '',
    });
    return created.save();
  }

  /** Lista las actividades de la empresa (filtros opcionales). */
  async findAll(
    companyId: Types.ObjectId,
    filters?: {
      active?: boolean;
      status?: string;
      category?: string;
    },
  ): Promise<HealthPromotionActivity[]> {
    const query: Record<string, unknown> = { companyId };
    if (filters?.active !== undefined) query.active = filters.active;
    if (filters?.status) query.status = filters.status;
    if (filters?.category) query.category = filters.category;
    return this.activityModel.find(query).sort({ activityDate: -1, createdAt: -1 }).exec();
  }

  /** Obtiene una actividad por ID verificando tenant isolation. */
  async findOne(id: string, companyId: Types.ObjectId): Promise<HealthPromotionActivity> {
    const activity = await this.activityModel.findOne({ _id: id, companyId }).exec();
    if (!activity) {
      throw new NotFoundException(`Actividad de promoción y prevención con id ${id} no encontrada`);
    }
    return activity;
  }

  /** Actualiza una actividad verificando tenant isolation. */
  async update(
    id: string,
    companyId: Types.ObjectId,
    dto: UpdateHealthPromotionActivityDto,
    actorUid?: string,
  ): Promise<HealthPromotionActivity> {
    await this.assertIntegrity(companyId, dto);

    const employeeIds = this.collectEmployeeIds(dto);
    await this.assertEmployeesInCompany(companyId, employeeIds);
    await this.assertRisksInCompany(companyId, dto.relatedRiskIds ?? []);

    const payload: Record<string, unknown> = {
      ...dto,
      ...(dto.targetEmployeeIds
        ? { targetEmployeeIds: dto.targetEmployeeIds.map((id) => new Types.ObjectId(id)) }
        : {}),
      ...(dto.participantEmployeeIds
        ? { participantEmployeeIds: dto.participantEmployeeIds.map((id) => new Types.ObjectId(id)) }
        : {}),
      ...(dto.relatedRiskIds
        ? { relatedRiskIds: dto.relatedRiskIds.map((id) => new Types.ObjectId(id)) }
        : {}),
      ...(dto.activityDate ? { activityDate: new Date(dto.activityDate) } : {}),
      updatedBy: actorUid ?? '',
    };

    const activity = await this.activityModel
      .findOneAndUpdate({ _id: id, companyId }, payload, { new: true, runValidators: true })
      .exec();

    if (!activity) {
      throw new NotFoundException(`Actividad de promoción y prevención con id ${id} no encontrada`);
    }
    return activity;
  }

  /** Desactiva una actividad (borrado blando). Verifica tenant isolation. */
  async deactivate(id: string, companyId: Types.ObjectId, actorUid?: string): Promise<HealthPromotionActivity> {
    const activity = await this.activityModel
      .findOneAndUpdate(
        { _id: id, companyId },
        { active: false, updatedBy: actorUid ?? '' },
        { new: true, runValidators: true },
      )
      .exec();

    if (!activity) {
      throw new NotFoundException(`Actividad de promoción y prevención con id ${id} no encontrada`);
    }
    return activity;
  }

  /**
   * Integridad temporal de la ejecución: status COMPLETED exige activityDate
   * y prohíbe fechas futuras (una actividad futura NO demuestra ejecución).
   */
  private async assertIntegrity(
    companyId: Types.ObjectId,
    dto: CreateHealthPromotionActivityDto | UpdateHealthPromotionActivityDto,
  ): Promise<void> {
    const status = dto.status;
    if (status === undefined) return;

    if (status === HealthPromotionActivityStatus.COMPLETED && !dto.activityDate) {
      throw new BadRequestException(
        'Una actividad COMPLETED debe tener activityDate (fecha de ejecución)',
      );
    }

    if (dto.activityDate) {
      const date = new Date(dto.activityDate);
      if (Number.isNaN(date.getTime())) {
        throw new BadRequestException('activityDate no es una fecha válida');
      }
      if (status === HealthPromotionActivityStatus.COMPLETED && date.getTime() > Date.now()) {
        throw new BadRequestException(
          'Una actividad ejecutada no puede tener fecha futura (activityDate debe ser <= hoy)',
        );
      }
    }
  }

  private collectEmployeeIds(
    dto: CreateHealthPromotionActivityDto | UpdateHealthPromotionActivityDto,
  ): string[] {
    return [...new Set([...(dto.targetEmployeeIds ?? []), ...(dto.participantEmployeeIds ?? [])])];
  }

  /**
   * Valida que todos los employeeIds referencien empleados de la MISMA empresa.
   * Lanza BadRequestException si algún id no existe o pertenece a otra empresa.
   */
  private async assertEmployeesInCompany(
    companyId: Types.ObjectId,
    employeeIds: string[],
  ): Promise<void> {
    if (employeeIds.length === 0) return;

    const uniqueIds = [...new Set(employeeIds)];
    const found = await this.employeeModel
      .find({ _id: { $in: uniqueIds.map((id) => new Types.ObjectId(id)) }, companyId })
      .select('_id')
      .lean()
      .exec();

    if (found.length !== uniqueIds.length) {
      throw new BadRequestException(
        'Uno o más trabajadores referenciados no existen o no pertenecen a esta empresa',
      );
    }
  }

  /**
   * Valida que todos los relatedRiskIds referencien riesgos de la MISMA empresa.
   */
  private async assertRisksInCompany(
    companyId: Types.ObjectId,
    riskIds: string[],
  ): Promise<void> {
    if (riskIds.length === 0) return;

    const uniqueIds = [...new Set(riskIds)];
    const found = await this.riskModel
      .find({ _id: { $in: uniqueIds.map((id) => new Types.ObjectId(id)) }, companyId })
      .select('_id')
      .lean()
      .exec();

    if (found.length !== uniqueIds.length) {
      throw new BadRequestException(
        'Uno o más riesgos relacionados no existen o no pertenecen a esta empresa',
      );
    }
  }
}
