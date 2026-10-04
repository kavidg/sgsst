import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateRiskDto } from './dto/create-risk.dto';
import { UpdateRiskDto } from './dto/update-risk.dto';
import { Risk, RiskDocument } from './schemas/risk.schema';
import { RiskMethodology, RiskMethodologyDocument } from './schemas/risk-methodology.schema';
import { ControlMeasure } from './schemas/control-measure.schema';

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
    // ETAPA 1 (4.2.2): mapeo explícito del array opcional de controles.
    // El flujo legacy (solo `controlMeasures` string) no cambia.
    const { controls, ...rest } = resolvedDto as CreateRiskDto & { controls?: { id?: string; description: string; isActive?: boolean }[] };
    const doc: Record<string, unknown> = { ...rest, companyId };
    if (Array.isArray(controls)) {
      doc.controls = controls.map((c) => ({
        ...(c.id ? { _id: new Types.ObjectId(c.id) } : {}),
        description: c.description,
        isActive: c.isActive ?? true,
      }));
    }
    const created = new this.riskModel(doc as any);
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
    // ETAPA 1 (4.2.2): `controls` opcional — reemplazo atómico del array.
    // Si no viene, no se toca el campo (compatibilidad con el flujo legacy).
    const { controls, ...rest } = resolvedDto as UpdateRiskDto & { controls?: { id?: string; description: string; isActive?: boolean }[] };
    const updatePayload: Record<string, unknown> = { ...rest };
    if (Array.isArray(controls)) {
      updatePayload.controls = controls.map((c) => ({
        ...(c.id ? { _id: new Types.ObjectId(c.id) } : {}),
        description: c.description,
        isActive: c.isActive ?? true,
      }));
    }
    const risk = await this.riskModel
      .findOneAndUpdate({ _id: id, companyId }, updatePayload, { new: true, runValidators: true })
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
   * ETAPA 1 (PHVA 4.2.2) — Bootstrap legacy de controles estructurados.
   *
   * Si el riesgo NO tiene controles estructurados y SÍ tiene el string
   * legacy `controlMeasures`, crea UN único ControlMeasure con la
   * descripción completa del string (sin dividir por comas, sin crear
   * múltiples controles).
   *
   * Garantías:
   * - Nunca sobrescribe controles estructurados existentes.
   * - Idempotente: llamadas repetidas no duplican.
   * - Write explícito y controlado: SOLO persiste cuando aplica el
   *   bootstrap. Con datos ya canónicos no hay write, por lo que puede
   *   invocarse desde flujos de lectura sin mutaciones silenciosas.
   *
   * NOTA DE DESPLIEGUE: el bootstrap NO se auto-ejecuta en GET en esta
   * etapa. Queda como método explícito para ser invocado de forma
   * controlada (tarea de adopción o flujo de edición) — pendiente
   * decidir el disparador definitivo cuando exista ControlVerification.
   */
  async bootstrapLegacyControls(risk: RiskDocument | Risk): Promise<Risk | RiskDocument> {
    const existingControls = (risk as RiskDocument).controls ?? (risk as Risk).controls ?? [];

    if (existingControls.length > 0) {
      // Ya hay controles estructurados: nada que hacer, sin writes.
      return risk;
    }

    const legacyText = ((risk as RiskDocument).controlMeasures ?? (risk as Risk).controlMeasures ?? '').trim();

    if (!legacyText) {
      return risk;
    }

    const bootstrapMeasure: ControlMeasure = {
      description: legacyText,
      isActive: true,
    } as ControlMeasure;

    // Write explícito y controlado (no en lecturas de datos canónicos).
    const updated = await this.riskModel
      .findOneAndUpdate(
        { _id: (risk as RiskDocument)._id, companyId: (risk as RiskDocument).companyId },
        { $set: { controls: [bootstrapMeasure] } },
        { new: true, runValidators: true },
      )
      .exec();

    return updated ?? risk;
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
