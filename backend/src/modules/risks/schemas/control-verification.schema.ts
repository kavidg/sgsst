import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ControlVerificationResult } from '../enums/control-verification-result.enum';
import { FollowUpStatus } from '../enums/follow-up-status.enum';

export type ControlVerificationDocument = HydratedDocument<ControlVerification>;

/**
 * ETAPA 2 (PHVA 4.2.2) — Verificación de aplicación de una medida de control.
 *
 * Evidencia puntual e INMUTABLE de que una medida de control
 * (`Risk.controls[]`, referenciada por `controlId`) fue comprobada en campo:
 * qué riesgo/control, cuándo, quién, con qué resultado y qué se observó.
 *
 * Decisiones de diseño aprobadas en auditoría:
 * - Referencia doble: `riskId` (ObjectId) + `controlId` (string = hex del
 *   _id del subdocumento) + snapshot textual del control para que la
 *   verificación siga siendo legible aunque el riesgo/control cambie o
 *   se elimine (evita referencias rotas).
 * - `result` (evidencia de campo) y `followUpStatus` (estado administrativo)
 *   viven en campos separados, nunca mezclados en un único estado.
 * - Sin periodicidad, tipo de control, responsable adicional, criticidad ni
 *   CAPA: campos especulativos expresamente excluidos en esta etapa.
 * - Sin lógica de scoring ni hooks que modifiquen Risk.
 *
 * Validación condicional `requiresFollowUp → followUpDueDate`:
 * Mongoose no soporta validadores a nivel de documento vía @Prop, por lo que
 * se implementa en un hook `pre('validate')` (mismo patrón de hooks que
 * risk.schema.ts con pre('save')). Si no hay fecha, la validación falla con
 * mensaje explícito.
 */
@Schema({ timestamps: true })
export class ControlVerification {
  /** Empresa propietaria (tenant isolation). */
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  /** Riesgo verificado. Validación de pertenencia al tenant: etapa 3 (service). */
  @Prop({ required: true, type: Types.ObjectId, ref: 'Risk' })
  riskId!: Types.ObjectId;

  /** Hex del _id del subdocumento ControlMeasure dentro de Risk.controls[]. */
  @Prop({ required: true, type: String })
  controlId!: string;

  /** Snapshot textual de la descripción del control al momento de verificar. */
  @Prop({ required: true, type: String, trim: true })
  controlDescriptionSnapshot!: string;

  /** Fecha de la verificación en campo. */
  @Prop({ required: true, type: Date })
  verificationDate!: Date;

  /** Quien realizó la verificación (patrón textual `responsible` del repo). */
  @Prop({ required: true, type: String, trim: true })
  verifiedBy!: string;

  /** Resultado de campo de la verificación. */
  @Prop({ required: true, enum: Object.values(ControlVerificationResult), type: String })
  result!: ControlVerificationResult;

  /** Qué se observó durante la verificación. */
  @Prop({ type: String, trim: true })
  observations?: string;

  /** Indica si la verificación genera seguimiento. */
  @Prop({ type: Boolean, default: false })
  requiresFollowUp!: boolean;

  /** Fecha límite del seguimiento (obligatoria si requiresFollowUp = true). */
  @Prop({ type: Date })
  followUpDueDate?: Date;

  /** Estado administrativo del seguimiento. */
  @Prop({ enum: Object.values(FollowUpStatus), type: String, default: FollowUpStatus.OPEN })
  followUpStatus?: FollowUpStatus;
}

export const ControlVerificationSchema = SchemaFactory.createForClass(ControlVerification);

// Índices requeridos (sin únicos sobre controlId: un control puede tener
// múltiples verificaciones históricas).
ControlVerificationSchema.index({ companyId: 1, riskId: 1 });
ControlVerificationSchema.index({ companyId: 1, verificationDate: -1 });
ControlVerificationSchema.index({ companyId: 1, riskId: 1, controlId: 1, verificationDate: -1 });

// Validación condicional a nivel de documento (ver documentación de la clase).
ControlVerificationSchema.pre('validate', function (next) {
  if (this.requiresFollowUp && !this.followUpDueDate) {
    this.invalidate(
      'followUpDueDate',
      'followUpDueDate es obligatorio cuando requiresFollowUp es true',
    );
  }
  next();
});
