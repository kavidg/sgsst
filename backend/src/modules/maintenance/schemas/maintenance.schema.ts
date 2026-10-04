import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type MaintenanceDocument = HydratedDocument<Maintenance>;

/**
 * Tipo de elemento mantenible (V1 — 4.2.5).
 *
 * En V1 el elemento mantenible se registra directamente en el mantenimiento
 * (itemName/itemType). El modelo queda preparado para una futura entidad
 * Asset independiente: `assetId` es opcional y NINGÚN flujo lo exige hoy.
 */
export enum MaintenanceItemType {
  EQUIPMENT = 'EQUIPMENT',
  MACHINE = 'MACHINE',
  TOOL = 'TOOL',
  INSTALLATION = 'INSTALLATION',
  INFRASTRUCTURE = 'INFRASTRUCTURE',
  OTHER = 'OTHER',
}

/** Tipo de mantenimiento (V1 — 4.2.5): solo preventivo y correctivo. */
export enum MaintenanceType {
  PREVENTIVE = 'PREVENTIVE',
  CORRECTIVE = 'CORRECTIVE',
}

/**
 * Estado operativo del mantenimiento (V1 — 4.2.5).
 *
 * NOTA sobre OVERDUE: se calcula DINÁMICAMENTE (programado cuya plannedDate
 * ya pasó sin completar/cancelar) — nunca se persiste como estado. Ver
 * utils/maintenance-status.util.ts (isMaintenanceOverdue / isMaintenanceCompleted).
 */
export enum MaintenanceStatus {
  PROGRAMMED = 'PROGRAMMED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/**
 * V1 — Transiciones de estado permitidas (validadas en service):
 *
 *   PROGRAMMED  → IN_PROGRESS | COMPLETED | CANCELLED
 *   IN_PROGRESS → COMPLETED | CANCELLED
 *   COMPLETED   → (terminal; solo edición de evidencia/observaciones)
 *   CANCELLED   → PROGRAMMED (reapertura explícita del servicio)
 */
export const MAINTENANCE_STATUS_TRANSITIONS: Record<MaintenanceStatus, MaintenanceStatus[]> = {
  [MaintenanceStatus.PROGRAMMED]: [MaintenanceStatus.IN_PROGRESS, MaintenanceStatus.COMPLETED, MaintenanceStatus.CANCELLED],
  [MaintenanceStatus.IN_PROGRESS]: [MaintenanceStatus.COMPLETED, MaintenanceStatus.CANCELLED],
  [MaintenanceStatus.COMPLETED]: [],
  [MaintenanceStatus.CANCELLED]: [MaintenanceStatus.PROGRAMMED],
};

/**
 * Entrada del historial de cambios de estado (trazabilidad documental 4.2.5).
 *
 * Subdocumento INMUTABLE por diseño: el usuario no puede alterarlo vía API
 * (los DTOs nunca lo reciben; el service lo agrega server-side con el uid
 * autenticado). El criterio normativo exige saber quién cambió el estado,
 * cuándo y desde qué estado previo.
 */
@Schema({ _id: false })
class MaintenanceStatusHistoryEntry {
  @Prop({ required: true, enum: Object.values(MaintenanceStatus), type: String })
  from!: MaintenanceStatus;

  @Prop({ required: true, enum: Object.values(MaintenanceStatus), type: String })
  to!: MaintenanceStatus;

  @Prop({ required: true, type: Date })
  changedAt!: Date;

  /** UID Firebase del usuario autenticado que ejecutó el cambio. */
  @Prop({ required: true, trim: true, maxlength: 128 })
  changedBy!: string;

  /** Comentario opcional del cambio (motivo de cancelación, etc.). */
  @Prop({ trim: true, maxlength: 500 })
  comment?: string;

  /**
   * ETAPA 6C — Evidencia documental ASOCIADA AL EVENTO de cambio de estado.
   *
   * Al COMPLETAR, el service registra aquí la evidencia efectiva usada para
   * validar el cierre. Así, la trazabilidad de ejecución queda ligada a la
   * operación (quién/cuándo/evidencia) y no a una URL preexistente en un
   * registro PROGRAMMED. Campos opcionales (comment/evidenceUrl) para no
   * romper entradas históricas.
   */
  @Prop({ trim: true, maxlength: 500 })
  evidenceUrl?: string;
}

/**
 * Registro de mantenimiento (estándar PHVA 4.2.5 — V1).
 *
 * PROPÓSITO: gestión operativa del programa de mantenimiento preventivo y
 * correctivo de equipos, instalaciones y herramientas, con trazabilidad
 * documental (fecha, responsable, evidencia, historial de estados).
 *
 * FRONTERA NORMATIVA (anti-double-scoring): esta entidad es la fuente
 * EXCLUSIVA de evidencia de 4.2.5. NO reutiliza ni convierte
 * InspectionActivity (4.2.4); ambos estándares puntuán colecciones
 * independientes desde esta versión.
 */
@Schema({ timestamps: true })
export class Maintenance {
  /** Empresa propietaria del registro (tenant isolation). */
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  /** Nombre del elemento mantenible (equipo, máquina, herramienta, instalación). */
  @Prop({ required: true, trim: true, maxlength: 200 })
  itemName!: string;

  /** Tipo de elemento mantenible (enum cerrado V1). */
  @Prop({ required: true, enum: Object.values(MaintenanceItemType), type: String })
  itemType!: MaintenanceItemType;

  /**
   * RESERVADO (no usado en V1): referencia a una futura entidad Asset.
   * Opcional para no romper registros existentes en la evolución del modelo.
   */
  @Prop({ type: Types.ObjectId, ref: 'Asset' })
  assetId?: Types.ObjectId;

  /** Descripción del mantenimiento (falla/problema en correctivos, alcance en preventivos). */
  @Prop({ required: true, trim: true, maxlength: 1000 })
  description!: string;

  /** Tipo de mantenimiento: PREVENTIVE | CORRECTIVE. */
  @Prop({ required: true, enum: Object.values(MaintenanceType), type: String })
  maintenanceType!: MaintenanceType;

  /** Fecha programada del mantenimiento. */
  @Prop({ required: true, type: Date })
  plannedDate!: Date;

  /** Fecha de ejecución real (obligatoria al COMPLETAR; validado en service). */
  @Prop({ type: Date })
  completedDate?: Date;

  /** Estado operativo (OVERDUE se calcula dinámicamente, nunca se persiste). */
  @Prop({ required: true, enum: Object.values(MaintenanceStatus), type: String, default: MaintenanceStatus.PROGRAMMED })
  status!: MaintenanceStatus;

  /** Responsable de la ejecución (interno). */
  @Prop({ required: true, trim: true, maxlength: 200 })
  responsible!: string;

  /** Proveedor externo del servicio (opcional en V1). */
  @Prop({ trim: true, maxlength: 200 })
  provider?: string;

  /** Frecuencia del mantenimiento preventivo (texto: Mensual, Trimestral, etc.). */
  @Prop({ trim: true, maxlength: 50 })
  frequency?: string;

  /** Próxima fecha programada derivada de la frecuencia (opcional en V1). */
  @Prop({ type: Date })
  nextMaintenanceDate?: Date;

  /** Observaciones de la ejecución (hallazgos, repuestos, pendientes). */
  @Prop({ trim: true, maxlength: 2000 })
  observations?: string;

  /** Referencia documental de evidencia (URL/soporte — patrón evidenceUrl del repo). */
  @Prop({ trim: true, maxlength: 500 })
  evidenceUrl?: string;

  /** Historial inmutable de cambios de estado (trazabilidad documental). */
  @Prop({ type: [MaintenanceStatusHistoryEntry], default: [] })
  statusHistory!: Array<{
    from: MaintenanceStatus;
    to: MaintenanceStatus;
    changedAt: Date;
    changedBy: string;
    comment?: string;
    evidenceUrl?: string;
  }>;

  /** Borrado lógico (el proyecto no usa borrado físico). */
  @Prop({ required: true, default: true })
  active!: boolean;

  /** UID del usuario que creó el registro (server-side, nunca del body). */
  @Prop({ trim: true, maxlength: 128 })
  createdBy?: string;

  /** UID del último usuario que modificó el registro (server-side). */
  @Prop({ trim: true, maxlength: 128 })
  updatedBy?: string;

  createdAt!: Date;
  updatedAt!: Date;
}

export const MaintenanceSchema = SchemaFactory.createForClass(Maintenance);

// Índices tenant-scoped (patrón del proyecto: companyId primero).
MaintenanceSchema.index({ companyId: 1, plannedDate: 1 });
MaintenanceSchema.index({ companyId: 1, status: 1 });
MaintenanceSchema.index({ companyId: 1, maintenanceType: 1 });
MaintenanceSchema.index({ companyId: 1, itemType: 1 });
MaintenanceSchema.index({ companyId: 1, active: 1 });
