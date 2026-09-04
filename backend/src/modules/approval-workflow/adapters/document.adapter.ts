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
import { ApprovalNotificationEvent } from '../services/approval-notification.service';
import { ApplyDecisionContext } from './approval-adapter.interface';
import { BaseApprovalAdapter } from './base-approval.adapter';
import { DocumentStatus } from '../../document-management/schemas/document-master.schema';
import { DocumentMasterService } from '../../document-management/services/document-master.service';
import { User, UserDocument } from '../../users/schemas/user.schema';

/**
 * Adapter de Document Management para el Approval Workflow Core.
 *
 * Conecta el motor de aprobaciones con el flujo documental existente SIN
 * modificar sus endpoints ni su lógica: reutiliza DocumentMasterService para
 * aplicar aprobaciones/rechazos y traduce DocumentStatus al ApprovalStatus
 * canónico. Mantiene DocumentApproval, DocumentSignature e historial intactos.
 *
 * Extiende BaseApprovalAdapter para obtener comportamiento por defecto
 * (allowedRoles, mapDecisionToStatus) y soporte para notificaciones
 * genéricas (getNotificationMessage, getModuleCode, getModuleName).
 *
 * El actor del workflow puede llegar como UID de Firebase o como ObjectId de
 * usuario; el adapter resuelve el `_id` real del usuario para registrar quién
 * aprueba (campo `approvedBy` del DocumentApproval).
 */
@Injectable()
export class DocumentAdapter extends BaseApprovalAdapter {
  readonly module = ApprovalEntity.DOCUMENT;

  constructor(
    @Inject(forwardRef(() => DocumentMasterService))
    private readonly documentService: DocumentMasterService,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {
    super();
  }

  // ─── Entity metadata ─────────────────────────────────────────────────

  getEntityLabel(entity: unknown): string {
    const doc = entity as { code?: string; name?: string } | undefined;
    return doc?.code ?? doc?.name ?? 'Documento';
  }

  getDefaultActionUrl(): string {
    return '/document-management';
  }

  getModuleCode(): string {
    return '2.5.1';
  }

  getModuleName(): string {
    return 'Conservación documental';
  }

  getNotificationMessage(event: ApprovalNotificationEvent, entityLabel: string): string {
    switch (event) {
      case 'APPROVAL_SUBMITTED':
        return `Documento "${entityLabel}" enviado al flujo de aprobación y requiere revisión.`;
      case 'APPROVED':
        return `Documento "${entityLabel}" fue aprobado correctamente.`;
      case 'REJECTED':
        return `Documento "${entityLabel}" fue rechazado y requiere revisión.`;
      case 'ADJUSTMENTS_REQUESTED':
        return `Documento "${entityLabel}": se solicitaron ajustes antes de continuar con la aprobación.`;
    }
  }

  // ─── Core adapter contract ───────────────────────────────────────────

  /**
   * Obtiene la entidad documental filtrando por companyId (tenant isolation).
   * La búsqueda incluye companyId para garantizar que no se pueda acceder
   * a documentos de otra empresa.
   */
  async getEntity(companyId: string, entityId?: string) {
    if (!entityId) {
      throw new BadRequestException('entityId is required by DocumentAdapter');
    }
    return this.documentService.findById(
      new Types.ObjectId(entityId),
      new Types.ObjectId(companyId),
    );
  }

  /**
   * Aplica una decisión del motor sobre el documento real, reutilizando la
   * lógica existente (DocumentMasterService.approve / reject).
   *
   * APPROVED → documento pasa a ACTIVE
   * REJECTED → documento vuelve a DRAFT
   * ADJUSTMENTS_REQUESTED → documento vuelve a DRAFT con razón de ajustes
   */
  async applyDecision(ctx: ApplyDecisionContext) {
    const documentId = new Types.ObjectId(ctx.entityId.toString());

    // Localiza la aprobación documental pendiente de la entidad.
    const approval = await this.documentService.findPendingApprovalByDocument(
      ctx.companyId,
      documentId,
    );
    if (!approval) {
      throw new NotFoundException('No pending document approval found for entity');
    }

    switch (ctx.decision) {
      case ApprovalDecision.APPROVED: {
        const approvedBy =
          this.metadataObjectId(ctx, 'approvedById') ??
          (await this.resolveUserId(ctx.actor.userId));
        return this.documentService.approve(
          approval._id,
          ctx.companyId,
          approvedBy,
          ctx.comments,
          this.signatureValue(ctx, 'signatureHash'),
          this.signatureValue(ctx, 'signatureUrl'),
          this.signatureValue(ctx, 'signerName') ?? ctx.actor.name,
          this.signatureValue(ctx, 'signerEmail') ?? ctx.actor.email,
        );
      }
      case ApprovalDecision.REJECTED:
        return this.documentService.reject(
          approval._id,
          ctx.reason ?? 'Document rejected',
          ctx.comments,
        );
      case ApprovalDecision.ADJUSTMENTS_REQUESTED:
        // Rechaza el documento con la razón de ajustes solicitados,
        // permitiendo que el autor realice correcciones y lo reenvíe.
        return this.documentService.reject(
          approval._id,
          ctx.reason ?? 'Ajustes solicitados',
          ctx.comments,
        );
    }
  }

  mapStatus(localStatus: string): ApprovalStatus {
    switch (localStatus) {
      case DocumentStatus.PENDING_APPROVAL:
        return ApprovalStatus.PENDING_APPROVAL;
      case DocumentStatus.APPROVED:
      case DocumentStatus.ACTIVE:
        return ApprovalStatus.APPROVED;
      case DocumentStatus.OBSOLETE:
      case DocumentStatus.ARCHIVED:
        return ApprovalStatus.ARCHIVED;
      case DocumentStatus.DRAFT:
      case DocumentStatus.UNDER_REVIEW:
      default:
        return ApprovalStatus.DRAFT;
    }
  }

  // ─── Private helpers ─────────────────────────────────────────────────

  /**
   * Resuelve el `_id` del usuario que aprueba: si el actor trae un ObjectId lo
   * usa directamente; si trae un UID de Firebase lo busca en la colección User.
   */
  private async resolveUserId(userId: string): Promise<Types.ObjectId> {
    if (Types.ObjectId.isValid(userId)) {
      return new Types.ObjectId(userId);
    }
    const user = await this.userModel
      .findOne({ firebaseUid: userId }, { _id: 1 })
      .lean()
      .exec();
    if (!user) {
      throw new NotFoundException(`User with firebaseUid ${userId} not found`);
    }
    return user._id;
  }

  private metadataObjectId(ctx: ApplyDecisionContext, key: string): Types.ObjectId | undefined {
    const value = ctx.metadata?.[key];
    return typeof value === 'string' && Types.ObjectId.isValid(value)
      ? new Types.ObjectId(value)
      : undefined;
  }

  private signatureValue(ctx: ApplyDecisionContext, key: string): string | undefined {
    const value = ctx.metadata?.[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
}
