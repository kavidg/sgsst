import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateControlVerificationDto } from './dto/create-control-verification.dto';
import { UpdateControlVerificationFollowUpDto } from './dto/update-control-verification-follow-up.dto';
import { ControlVerification, ControlVerificationDocument } from './schemas/control-verification.schema';
import { Risk, RiskDocument } from './schemas/risk.schema';
import { FollowUpStatus } from './enums/follow-up-status.enum';

/**
 * ETAPA 3 (PHVA 4.2.2) — CRUD seguro de verificaciones de controles.
 *
 * Reglas multiempresa (patrón resolveCompanyId / resolveMethodology del repo):
 * - El companyId SIEMPRE se resuelve en el controller desde el usuario
 *   autenticado (nunca del body).
 * - El riesgo se resuelve con findOne({ _id: riskId, companyId }) antes de
 *   cualquier operación; un riesgo de otra empresa responde 404
 *   (recurso ajeno = no encontrado, sin filtrar información).
 * - Toda query a ControlVerification filtra por companyId + riskId.
 *
 * Snapshot: controlDescriptionSnapshot se toma de Risk.controls[] en el
 * momento de crear y nunca se actualiza después (inmutabilidad de evidencia).
 *
 * Seguimiento (convención documentada):
 * - requiresFollowUp=false → followUpStatus se normaliza a CLOSED (neutro;
 *   el schema no tiene campo closedAt, por lo que no se exige fecha de cierre).
 * - requiresFollowUp=true  → followUpDueDate obligatorio; followUpStatus OPEN/CLOSED.
 * - Las validaciones de coherencia viven en DTO + service (explícitas),
 *   no dependen solo de hooks de documento.
 */
@Injectable()
export class ControlVerificationService {
  constructor(
    @InjectModel(ControlVerification.name)
    private readonly verificationModel: Model<ControlVerificationDocument>,
    @InjectModel(Risk.name)
    private readonly riskModel: Model<RiskDocument>,
  ) {}

  /** Regla 1: resolver el riesgo dentro del tenant (o 404 estándar). */
  private async resolveRisk(riskId: string, companyId: Types.ObjectId): Promise<RiskDocument> {
    if (!Types.ObjectId.isValid(riskId)) {
      throw new BadRequestException('Invalid riskId');
    }
    const risk = await this.riskModel.findOne({ _id: riskId, companyId }).exec();
    if (!risk) {
      throw new NotFoundException(`Risk with id ${riskId} not found`);
    }
    return risk;
  }

  /** Regla 2: validar el control dentro de Risk.controls[] (por _id, patrón real de Mongoose). */
  private resolveControl(risk: RiskDocument, controlId: string) {
    const control = (risk.controls ?? []).find(
      (c) => String((c as unknown as { _id: Types.ObjectId })._id) === controlId,
    );
    if (!control) {
      throw new NotFoundException(`Control with id ${controlId} not found in risk ${String(risk._id)}`);
    }
    if (control.isActive === false) {
      throw new BadRequestException('Control is inactive and cannot be verified');
    }
    return control;
  }

  async create(
    riskId: string,
    companyId: Types.ObjectId,
    dto: CreateControlVerificationDto,
  ): Promise<ControlVerification> {
    const risk = await this.resolveRisk(riskId, companyId);
    const control = this.resolveControl(risk, dto.controlId);

    if (dto.requiresFollowUp === true && !dto.followUpDueDate) {
      throw new BadRequestException('followUpDueDate es obligatorio cuando requiresFollowUp es true');
    }

    const followUpStatus = dto.requiresFollowUp === true ? FollowUpStatus.OPEN : FollowUpStatus.CLOSED;

    // Regla 4: backend establece companyId/riskId/controlId/snapshot; nunca el cliente.
    const created = new this.verificationModel({
      companyId,
      riskId: risk._id,
      controlId: dto.controlId,
      controlDescriptionSnapshot: control.description,
      verificationDate: new Date(dto.verificationDate),
      verifiedBy: dto.verifiedBy.trim(),
      result: dto.result,
      observations: dto.observations?.trim(),
      requiresFollowUp: dto.requiresFollowUp ?? false,
      followUpDueDate: dto.followUpDueDate ? new Date(dto.followUpDueDate) : undefined,
      followUpStatus,
    });
    return created.save();
  }

  /** Regla 5: lista siempre filtrada por companyId + riskId, ordenada por fecha descendente. */
  async findAll(riskId: string, companyId: Types.ObjectId): Promise<ControlVerification[]> {
    await this.resolveRisk(riskId, companyId);
    return this.verificationModel
      .find({ companyId, riskId })
      .sort({ verificationDate: -1 })
      .exec();
  }

  /** Regla 6: valida verificationId + riskId + companyId simultáneamente. */
  async findOne(
    riskId: string,
    verificationId: string,
    companyId: Types.ObjectId,
  ): Promise<ControlVerification> {
    await this.resolveRisk(riskId, companyId);
    if (!Types.ObjectId.isValid(verificationId)) {
      throw new BadRequestException('Invalid verificationId');
    }
    const verification = await this.verificationModel
      .findOne({ _id: verificationId, riskId, companyId })
      .exec();
    if (!verification) {
      // Recurso ajeno al riesgo/tenant → 404 estándar, sin detalles cruzados.
      throw new NotFoundException(`Verification with id ${verificationId} not found`);
    }
    return verification;
  }

  /**
   * Regla 7: actualización explícita de SOLO los campos de seguimiento.
   * Nunca un update abierto con el body completo: la evidencia histórica
   * (result, verificationDate, verifiedBy, observations, controlId, snapshot)
   * no puede modificarse por construcción.
   */
  async updateFollowUp(
    riskId: string,
    verificationId: string,
    companyId: Types.ObjectId,
    dto: UpdateControlVerificationFollowUpDto,
  ): Promise<ControlVerification> {
    await this.resolveRisk(riskId, companyId);

    if (!Types.ObjectId.isValid(verificationId)) {
      throw new BadRequestException('Invalid verificationId');
    }

    const current = await this.verificationModel
      .findOne({ _id: verificationId, riskId, companyId })
      .exec();
    if (!current) {
      throw new NotFoundException(`Verification with id ${verificationId} not found`);
    }

    // Regla 8: coherencia de seguimiento, explícita en service (no solo hooks).
    const requiresFollowUp = dto.requiresFollowUp ?? current.requiresFollowUp;
    const followUpDueDate =
      dto.followUpDueDate !== undefined ? new Date(dto.followUpDueDate) : current.followUpDueDate;
    let followUpStatus = dto.followUpStatus ?? current.followUpStatus;

    if (requiresFollowUp === true && !followUpDueDate) {
      throw new BadRequestException('followUpDueDate es obligatorio cuando requiresFollowUp es true');
    }
    if (requiresFollowUp === false) {
      // Convención: sin seguimiento → CLOSED (neutro). El schema no tiene closedAt,
      // por lo que no se exige fecha de cierre para CLOSED.
      followUpStatus = FollowUpStatus.CLOSED;
    }
    if (followUpStatus === FollowUpStatus.OPEN && !followUpDueDate && requiresFollowUp === true) {
      throw new BadRequestException('followUpDueDate es obligatorio para un seguimiento OPEN');
    }

    const updated = await this.verificationModel
      .findOneAndUpdate(
        { _id: verificationId, riskId, companyId },
        {
          $set: {
            ...(dto.requiresFollowUp !== undefined ? { requiresFollowUp } : {}),
            ...(dto.followUpDueDate !== undefined || requiresFollowUp === false
              ? { followUpDueDate }
              : {}),
            ...(followUpStatus !== undefined ? { followUpStatus } : {}),
          },
        },
        { new: true, runValidators: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException(`Verification with id ${verificationId} not found`);
    }
    return updated;
  }

  /** Guard defensive para operaciones de escritura desde roles no autorizados. */
  assertCanWrite(role: string | undefined): void {
    if (role && !['owner', 'admin'].includes(role)) {
      throw new ForbiddenException('Insufficient role for this operation');
    }
  }
}
