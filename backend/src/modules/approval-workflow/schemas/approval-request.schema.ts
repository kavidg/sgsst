import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ApprovalStatus } from '../enums/approval-status.enum';
import { ApprovalDecision } from '../enums/approval-decision.enum';
import { ApprovalEntity } from '../enums/approval-entity.enum';

export type ApprovalRequestDocument = HydratedDocument<ApprovalRequest>;

/**
 * Evidencia de firma embebida en la solicitud (preparada para fases futuras).
 */
@Schema({ _id: false })
class ApprovalSignatureEmbedded {
  @Prop({ required: true, enum: ['HASH', 'IMAGE', 'CAMPAIGN'] })
  method!: 'HASH' | 'IMAGE' | 'CAMPAIGN';

  @Prop()
  hash?: string;

  @Prop()
  url?: string;

  @Prop()
  campaignId?: string;
}

/**
 * Solicitud de aprobación del Approval Workflow Core.
 *
 * Fase 0: modelo de datos base. No se conecta a módulos existentes todavía;
 * los adapters se implementan en fases posteriores.
 */
@Schema({ timestamps: true })
export class ApprovalRequest {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true })
  companyId!: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(ApprovalEntity), index: true })
  module!: ApprovalEntity;

  @Prop({ required: true })
  entityType!: string;

  @Prop({ required: true, type: Types.ObjectId, index: true })
  entityId!: Types.ObjectId;

  @Prop({
    required: true,
    enum: Object.values(ApprovalStatus),
    default: ApprovalStatus.PENDING_APPROVAL,
    index: true,
  })
  status!: ApprovalStatus;

  @Prop({ default: 1 })
  currentStep!: number;

  @Prop({ type: Object, required: true })
  requestedBy!: {
    userId: string;
    firebaseUid?: string;
    email: string;
    name?: string;
    role: string;
    timestamp: Date;
  };

  @Prop({ type: [String], default: ['owner', 'manager'] })
  assignedRoles!: string[];

  @Prop({ enum: Object.values(ApprovalDecision) })
  decision?: ApprovalDecision;

  @Prop({ type: Object })
  decidedBy?: {
    userId: string;
    firebaseUid?: string;
    email: string;
    name?: string;
    role: string;
    timestamp: Date;
  };

  @Prop()
  rejectionReason?: string;

  @Prop({ type: ApprovalSignatureEmbedded })
  signature?: ApprovalSignatureEmbedded;

  @Prop({ default: 1 })
  version!: number;

  @Prop()
  comments?: string;

  /**
   * true cuando la solicitud fue creada retroactivamente para auditar una
   * decisión legacy (previa a la integración del Approval Workflow Core).
   */
  @Prop({ default: false })
  legacy!: boolean;
}

export const ApprovalRequestSchema = SchemaFactory.createForClass(ApprovalRequest);

ApprovalRequestSchema.index({ companyId: 1, status: 1 });
ApprovalRequestSchema.index({ companyId: 1, module: 1, status: 1 });
ApprovalRequestSchema.index({ companyId: 1, entityId: 1 });
// Índice compuesto NO único: permite múltiples ciclos de aprobación para la
// misma entidad (p.ej. REJECTED → nuevo submit → PENDING_APPROVAL) sin
// impedir la creación de nuevas solicitudes ni duplicados accidentales.
ApprovalRequestSchema.index({ companyId: 1, module: 1, entityId: 1, status: 1 });
