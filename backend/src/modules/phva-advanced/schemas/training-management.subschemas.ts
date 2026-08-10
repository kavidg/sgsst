import { Prop, Schema } from '@nestjs/mongoose';

/**
 * Sub-schemas compartidos del dominio de capacitación de PHVA Advanced.
 *
 * Extraídos mecánicamente desde `phva-advanced-training-management.schema.ts`
 * (1.2.1) para ser reutilizados por otros estándares de capacitación
 * (p. ej. 1.1.7 Capacitación COPASST) SIN duplicar definiciones ni alterar
 * el comportamiento existente de 1.2.1.
 *
 * REGLA DE MANTENIMIENTO: cualquier cambio aquí afecta a TODOS los estándares
 * que reutilicen estos sub-schemas. Antes de modificar un campo, verifica los
 * estándares que lo consumen.
 */
@Schema({ _id: false })
export class AuditEntry {
  @Prop({ required: true }) action!: string;
  @Prop({ required: true }) createdBy!: string;
  @Prop({ default: Date.now }) createdAt!: Date;
  @Prop() details?: string;
}

@Schema({ _id: false })
export class Approval {
  @Prop() approvedBy?: string;
  @Prop() approvedAt?: Date;
  @Prop() comments?: string;
  @Prop({ default: 1 }) version!: number;
  @Prop({ default: 'PENDING' }) status!: 'PENDING'|'APPROVED'|'REJECTED'|'ADJUSTMENTS_REQUESTED';
}

@Schema({ _id: false })
export class Session {
  @Prop({ required: true }) title!: string;
  @Prop() type?: string;
  @Prop() responsible?: string;
  @Prop() scheduledDate?: Date;
  @Prop() expirationDate?: Date;
  @Prop({ default: 'Pendiente' }) status!: string;
  @Prop({ type: [String], default: [] }) participants!: string[];
  @Prop({ type: [String], default: [] }) evidences!: string[];
  @Prop({ type: [String], default: [] }) multimedia!: string[];
  @Prop() instructor?: string;
  @Prop() location?: string;
  @Prop() duration?: string;
  @Prop() evaluation?: string;
  @Prop() completionDate?: Date;
}

@Schema({ _id: false })
export class ChecklistItem {
  @Prop({ required: true }) key!: string;
  @Prop({ required: true }) label!: string;
  @Prop({ default: 'PENDING' }) status!: 'COMPLETED'|'PENDING'|'NOT_APPLICABLE';
}

@Schema({ _id: false })
export class TrainingSignature {
  @Prop() signedBy?: string;
  @Prop() signedAt?: Date;
  @Prop() ipAddress?: string;
  @Prop() device?: string;
  @Prop() signatureUrl?: string;
  @Prop() scannedDocumentUrl?: string;
}

@Schema({ _id: false })
export class EvaluationAttempt {
  @Prop({ default: 1 }) attemptNumber!: number;
  @Prop({ default: 0 }) score!: number;
  @Prop({ default: false }) passed!: boolean;
  @Prop({ default: 0 }) completionPercentage!: number;
  @Prop({ default: Date.now }) attemptedAt!: Date;
}
