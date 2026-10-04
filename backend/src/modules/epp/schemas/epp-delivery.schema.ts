import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { SST_EPP_ITEM_CODE } from '../../phva-advanced/schemas/phva-advanced-epp.schema';

export type EppDeliveryDocument = HydratedDocument<EppDelivery>;

/**
 * Condición física del EPP entregado (enum cerrado, coherente con
 * SstEppCondition del catálogo/matriz SstEpp).
 */
export enum EppDeliveryCondition {
  GOOD = 'GOOD',
  FAIR = 'FAIR',
  POOR = 'POOR',
  DAMAGED = 'DAMAGED',
}

/**
 * Estado del evento de entrega (4.2.6 — Alternativa B).
 *
 * NOTA sobre EXPIRED: NO se persiste un estado "vencido" manual. El
 * vencimiento de reposición se calcula DINÁMICAMENTE comparando
 * expectedReplacementDate con la fecha actual (ver
 * utils/epp-delivery-status.util.ts — isEppDeliveryOverdue), mismo patrón
 * OVERDUE de Maintenance (4.2.5). Sin cron ni scheduler.
 */
export enum EppDeliveryStatus {
  ACTIVE = 'ACTIVE',
  REPLACED = 'REPLACED',
  RETURNED = 'RETURNED',
  DAMAGED = 'DAMAGED',
}

/**
 * Transiciones permitidas (validadas en service):
 *   ACTIVE → REPLACED | RETURNED | DAMAGED
 *   REPLACED/RETURNED/DAMAGED → (terminales)
 */
export const EPP_DELIVERY_STATUS_TRANSITIONS: Record<EppDeliveryStatus, EppDeliveryStatus[]> = {
  [EppDeliveryStatus.ACTIVE]: [
    EppDeliveryStatus.REPLACED,
    EppDeliveryStatus.RETURNED,
    EppDeliveryStatus.DAMAGED,
  ],
  [EppDeliveryStatus.REPLACED]: [],
  [EppDeliveryStatus.RETURNED]: [],
  [EppDeliveryStatus.DAMAGED]: [],
};

/** Eventos del historial (server-side only; el cliente nunca lo envía). */
export enum EppDeliveryHistoryAction {
  CREATED = 'CREATED',
  UPDATED = 'UPDATED',
  REPLACED = 'REPLACED',
  RETURNED = 'RETURNED',
  DAMAGED = 'DAMAGED',
}

/**
 * Entrada del historial de la entrega (trazabilidad documental 4.2.6).
 *
 * Subdocumento INMUTABLE por diseño: los DTOs nunca lo reciben; el service
 * lo agrega server-side con el uid autenticado. Registra quién, cuándo,
 * qué acción y un comentario opcional.
 */
@Schema({ _id: false })
export class EppDeliveryHistoryEntry {
  @Prop({ required: true, enum: Object.values(EppDeliveryHistoryAction), type: String })
  action!: EppDeliveryHistoryAction;

  @Prop({ required: true, type: Date })
  date!: Date;

  /** UID Firebase del usuario autenticado que ejecutó la acción. */
  @Prop({ required: true, trim: true, maxlength: 128 })
  performedBy!: string;

  @Prop({ trim: true, maxlength: 500 })
  comment?: string;
}

/**
 * Registro operativo de entrega/reposición de EPP (4.2.6 — Alternativa B).
 *
 * PROPÓSITO: evidencia documental de la entrega real de Elementos de
 * Protección Personal a un trabajador de la empresa, con reposición
 * programada, condición, evidencia específica del evento e historial
 * inmutable. La reposición (REPLACED) crea un nuevo registro de entrega;
 * este documento conserva el historial completo de su ciclo de vida.
 *
 * FRONTERAS (anti-double-scoring):
 *  - SstEpp  → catálogo/matriz de necesidades EPP (1 doc por empresa; NO se
 *              migra ni se elimina en esta etapa).
 *  - Employee→ trabajador REAL (employeeId referencia su _id; el nombre solo
 *              viaja como snapshot de auditoría).
 *  - Risk    → referencia de necesidad (fuera de alcance de esta etapa).
 *
 * El scoring futuro de 4.2.6 (EppComplianceProvider) consumirá esta colección;
 * esta etapa NO modifica la fórmula del provider.
 */
@Schema({ timestamps: true })
export class EppDelivery {
  /** Empresa propietaria del registro (tenant isolation). */
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true })
  companyId!: Types.ObjectId;

  /** Trabajador REAL (Employee._id de la misma empresa; validado en service). */
  @Prop({ required: true, type: Types.ObjectId, ref: 'Employee' })
  employeeId!: Types.ObjectId;

  /** Snapshot de auditoría del nombre del trabajador al momento de la entrega. */
  @Prop({ required: true, trim: true, maxlength: 200 })
  employeeNameSnapshot!: string;

  /**
   * Referencia al elemento del catálogo/matriz EPP (SstEpp.catalog[].eppItemId
   * de la misma empresa; validado en service). Snapshot del nombre para
   * auditoría; no se duplica el catálogo completo.
   */
  @Prop({ required: true, trim: true, maxlength: 128 })
  eppItemId!: string;

  @Prop({ required: true, trim: true, maxlength: 200 })
  eppNameSnapshot!: string;

  /** Fecha de la ENTREGA REALIZADA (no futura; validado en service). */
  @Prop({ required: true, type: Date })
  deliveryDate!: Date;

  /** Reposición esperada (>= deliveryDate; validado en service). */
  @Prop({ type: Date })
  expectedReplacementDate?: Date;

  /** Reposición efectiva (>= deliveryDate; validado en service). */
  @Prop({ type: Date })
  actualReplacementDate?: Date;

  /** Cantidad entregada (siempre positiva). */
  @Prop({ required: true, min: 1, default: 1 })
  quantity!: number;

  @Prop({ required: true, enum: Object.values(EppDeliveryCondition), type: String, default: EppDeliveryCondition.GOOD })
  condition!: EppDeliveryCondition;

  @Prop({ required: true, enum: Object.values(EppDeliveryStatus), type: String, default: EppDeliveryStatus.ACTIVE })
  status!: EppDeliveryStatus;

  /**
   * Evidencia ESPECÍFICA del evento de entrega (firma/acta/foto). No se
   * hereda del documento global SstEpp: pertenece a esta entrega.
   */
  @Prop({ trim: true, maxlength: 500 })
  evidenceUrl?: string;

  /** URL del certificado/conformidad del elemento (trazabilidad técnica). */
  @Prop({ trim: true, maxlength: 500 })
  certificateUrl?: string;

  @Prop({ trim: true, maxlength: 2000 })
  observations?: string;

  /** UID Firebase del creador (server-side; nunca del cliente). */
  @Prop({ required: true, trim: true, maxlength: 128 })
  createdBy!: string;

  /** UID Firebase del último editor (server-side). */
  @Prop({ trim: true, maxlength: 128 })
  updatedBy?: string;

  /** Historial inmutable generado server-side (ver EppDeliveryHistoryEntry). */
  @Prop({ type: [EppDeliveryHistoryEntry], default: [] })
  history!: EppDeliveryHistoryEntry[];
}

export const EppDeliverySchema = SchemaFactory.createForClass(EppDelivery);

/** Índices tenant-scoped (patrón Maintenance): consultas por empresa. */
EppDeliverySchema.index({ companyId: 1, employeeId: 1 });
EppDeliverySchema.index({ companyId: 1, eppItemId: 1 });
EppDeliverySchema.index({ companyId: 1, deliveryDate: -1 });
EppDeliverySchema.index({ companyId: 1, expectedReplacementDate: 1 });
EppDeliverySchema.index({ companyId: 1, status: 1 });

/** Identidad del módulo de entrega (reutiliza la constante canónica de EPP). */
export const EPP_DELIVERY_ITEM_CODE = SST_EPP_ITEM_CODE;
