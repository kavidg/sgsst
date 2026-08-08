import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ApprovalDecision } from '../enums/approval-decision.enum';
import { ApprovalEntity } from '../enums/approval-entity.enum';
import { ApprovalStatus } from '../enums/approval-status.enum';
import { ApprovalAdapter, ApplyDecisionContext } from './approval-adapter.interface';
import { InitialEvaluationStatus } from '../../initial-evaluation/schemas/initial-evaluation.schema';
import { InitialEvaluationService } from '../../initial-evaluation/initial-evaluation.service';
import { SignApprovalDto } from '../../initial-evaluation/dto/initial-evaluation.dto';
import { User, UserDocument } from '../../users/schemas/user.schema';

/**
 * Adapter de Initial Evaluation para el Approval Workflow Core.
 *
 * Conecta el motor de aprobaciones con el flujo existente de la Evaluación
 * Inicial SIN modificar sus endpoints ni su lógica: reutiliza
 * InitialEvaluationService.managerSign para aplicar la aprobación (conserva la
 * firma existente, approvalDocumentUrl y la auditoría local) y traduce
 * InitialEvaluationStatus al ApprovalStatus canónico.
 *
 * Particularidad del dominio: la evaluación inicial es UNA por empresa
 * (findCurrent), por lo que getEntity soporta entityId opcional — cuando no se
 * provee, resuelve la evaluación vigente por companyId (caso preparado para el
 * contrato flexible del motor).
 *
 * El módulo de Evaluación Inicial NO posee flujo de rechazo (los estados son
 * Borrador → En evaluación → Pendiente aprobación → Aprobada/Archivada), por lo
 * que REJECTED y ADJUSTMENTS_REQUESTED no están soportados: se conserva el
 * comportamiento actual lanzando un error explícito.
 */
@Injectable()
export class InitialEvaluationAdapter implements ApprovalAdapter {
  readonly module = ApprovalEntity.INITIAL_EVALUATION;

  constructor(
    @Inject(forwardRef(() => InitialEvaluationService))
    private readonly evaluationService: InitialEvaluationService,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  /**
   * Carga la evaluación validando pertenencia por companyId y devuelve el
   * contexto de la entidad (entity, status, version).
   *
   * Soporta dos escenarios:
   * A) entityId presente → carga la evaluación específica.
   * B) entityId undefined → carga la evaluación vigente de la empresa.
   */
  async getEntity(companyId: string, entityId?: string) {
    const evaluation = entityId
      ? await this.evaluationService.findById(new Types.ObjectId(entityId))
      : await this.evaluationService.findCurrent(new Types.ObjectId(companyId));

    if (evaluation.companyId.toString() !== companyId) {
      throw new NotFoundException('Initial evaluation not found');
    }

    return {
      entity: evaluation,
      status: evaluation.status,
      // La Evaluación Inicial no tiene control de versiones; se expone 1 por contrato.
      version: 1,
    };
  }

  /**
   * Aplica una decisión del motor sobre la evaluación real, reutilizando la
   * lógica existente (InitialEvaluationService.managerSign) que conserva la
   * firma, approvalDocumentUrl, historial y auditoría local.
   */
  async applyDecision(ctx: ApplyDecisionContext) {
    // Validación de pertenencia: la evaluación pertenece a la empresa del contexto.
    const evaluation = await this.evaluationService.findById(
      new Types.ObjectId(ctx.entityId.toString()),
    );
    if (evaluation.companyId.toString() !== ctx.companyId.toString()) {
      throw new NotFoundException('Initial evaluation not found');
    }

    switch (ctx.decision) {
      case ApprovalDecision.APPROVED: {
        const signer: SignApprovalDto = {
          signerName: this.signatureValue(ctx, 'signerName') ?? ctx.actor.name ?? 'Manager',
          signerEmail: this.signatureValue(ctx, 'signerEmail') ?? ctx.actor.email,
          signatureUrl: this.signatureValue(ctx, 'signatureUrl'),
          comments: ctx.comments ?? ctx.reason,
        };
        const user = await this.resolveUser(ctx.actor);
        // managerSign genera la firma existente (signatureHash), approvalDocumentUrl
        // y la auditoría local; conserva EvaluationApproval y EvaluationSignature.
        return this.evaluationService.managerSign(ctx.companyId, signer, user);
      }
      case ApprovalDecision.REJECTED:
        // No existe flujo de rechazo en el módulo: conservar comportamiento actual.
        throw new BadRequestException('Initial evaluation does not support rejection');
      case ApprovalDecision.ADJUSTMENTS_REQUESTED:
        throw new BadRequestException(
          'ADJUSTMENTS_REQUESTED is not supported by InitialEvaluationAdapter',
        );
    }
  }

  mapStatus(localStatus: string): ApprovalStatus {
    switch (localStatus) {
      case InitialEvaluationStatus.PENDING_APPROVAL:
        return ApprovalStatus.PENDING_APPROVAL;
      case InitialEvaluationStatus.APPROVED:
        return ApprovalStatus.APPROVED;
      case InitialEvaluationStatus.ARCHIVED:
        return ApprovalStatus.ARCHIVED;
      case InitialEvaluationStatus.DRAFT:
      case InitialEvaluationStatus.IN_PROGRESS:
      default:
        return ApprovalStatus.DRAFT;
    }
  }

  allowedRoles(): string[] {
    return ['owner', 'manager'];
  }

  /**
   * Resuelve el usuario que firma: si el actor trae un ObjectId lo usa
   * directamente; si trae un UID de Firebase (o userId sin ObjectId) lo busca
   * en la colección User.
   */
  private async resolveUser(actor: {
    userId: string;
    firebaseUid?: string;
  }): Promise<UserDocument> {
    let user: UserDocument | null = null;
    if (Types.ObjectId.isValid(actor.userId)) {
      user = await this.userModel.findById(actor.userId).exec();
    }
    if (!user) {
      user = await this.userModel
        .findOne({ firebaseUid: actor.firebaseUid ?? actor.userId })
        .exec();
    }
    if (!user) {
      throw new NotFoundException(`User ${actor.userId} not found`);
    }
    return user;
  }

  private signatureValue(ctx: ApplyDecisionContext, key: string): string | undefined {
    const value = ctx.metadata?.[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
}
