import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import {
  IncidentLifecycleStage,
  InvestigationActionImplementationStatus,
  InvestigationPerceivedEffectiveness,
  InvestigationProgressStatus,
} from './incident-lifecycle.schema';

export type IncidentDocument = HydratedDocument<Incident>;

/**
 * Tipo de investigación asociada al incidente.
 *
 * ACCIDENT — Registro de accidentalidad laboral (estándar 3.2.1 / accidentalidad).
 * DISEASE  — Investigación de enfermedad laboral (estándar 3.2.2).
 *
 * Campo opcional con default ACCIDENT para mantener compatibilidad con
 * documentos existentes de accidentalidad que no tienen este campo.
 */
export enum InvestigationType {
  ACCIDENT = 'ACCIDENT',
  DISEASE = 'DISEASE',
}

/**
 * Estado administrativo de una acción de investigación (correctiva o preventiva).
 *
 * PENDING    — Acción creada, sin avance registrado.
 * IN_PROGRESS — Acción en ejecución.
 * COMPLETED  — Acción finalizada.
 * CANCELLED  — Acción cancelada.
 */
export enum InvestigationActionStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/**
 * E1 (7.1.3) — Tipo/origen de la acción derivada de la investigación.
 * Permite distinguir preventiva / correctiva / otra sin reutilizar el dominio
 * corrective-preventive-actions (7.1.1): la acción sigue perteneciendo al
 * caso accidental (frontera normativa).
 */
export enum InvestigationActionType {
  PREVENTIVE = 'PREVENTIVE',
  CORRECTIVE = 'CORRECTIVE',
  OTHER = 'OTHER',
}

/**
 * Evidencia de la acción/investigación (referencia declarativa tenant-safe a
 * DocumentMaster y/o URL + comentario). NO crea sistema de archivos propio.
 * Patrón: ImprovementActionEvidence (7.1.2).
 */
@Schema({ _id: false })
export class InvestigationActionEvidenceRef {
  /** Referencia declarativa a DocumentMaster (validada tenant-safe en service). */
  @Prop({ type: Types.ObjectId, ref: 'DocumentMaster' })
  documentId?: Types.ObjectId;

  /** Snapshot del código/nombre del documento (server-side; sobrevive cambios). */
  @Prop({ trim: true, maxlength: 300 })
  documentSnapshot?: string;

  @Prop({ trim: true, maxlength: 1000 })
  evidenceUrl?: string;

  @Prop({ trim: true, maxlength: 1000 })
  comment?: string;
}

export const InvestigationActionEvidenceRefSchema = SchemaFactory.createForClass(
  InvestigationActionEvidenceRef,
);

/**
 * E1 (7.1.3) — Seguimiento de la acción de investigación.
 *
 * `perceivedEffectiveness` es PERCEPCIÓN declarada del seguimiento — NO es
 * verificación formal de eficacia (frontera con 7.1.1, corrective-preventive-
 * actions). La formalización del scoring de esta información pertenece a E2.
 */
@Schema({ _id: false })
export class InvestigationActionFollowUp {
  /** Fecha del seguimiento (no futura; validada en service). */
  @Prop({ type: Date })
  followUpDate?: Date;

  @Prop({ trim: true, maxlength: 2000 })
  observations?: string;

  /** Estado de implementación declarado. */
  @Prop({ type: String, enum: Object.values(InvestigationActionImplementationStatus) })
  implementationStatus?: InvestigationActionImplementationStatus;

  /** PERCEPCIÓN de efectividad (no eficacia formal — frontera 7.1.1). */
  @Prop({ type: String, enum: Object.values(InvestigationPerceivedEffectiveness) })
  perceivedEffectiveness?: InvestigationPerceivedEffectiveness;
}

export const InvestigationActionFollowUpSchema = SchemaFactory.createForClass(
  InvestigationActionFollowUp,
);

/**
 * Acción correctiva o preventiva derivada de la investigación.
 *
 * Representa una actividad administrativa de seguimiento.
 * NO almacena información clínica.
 *
 * E1 (7.1.3): campos legacy (action/responsible/status/dueDate/completedDate)
 * se PRESERVAN para compatibilidad; se agregan los campos tipados tenant-safe
 * de la gestión avanzada 7.1.3 (actionId, actionType, responsable con userId,
 * plannedDate, evidencia y seguimiento). Los responsables `responsibleUserId`
 * se validan tenant-safe ({_id: $in, companyId}) en el service — un query $in
 * agrupado por operación (sin N+1). El string legacy `responsible` puede
 * coexistir mientras se normalizan los datos (no se inventa userId).
 */
@Schema({ _id: false })
export class InvestigationAction {
  /** Identificador estable de la acción (generado server-side en E1). */
  @Prop({ type: String })
  actionId?: string;

  /** Descripción de la acción. */
  @Prop({ required: true, type: String })
  action!: string;

  /** Tipo de acción (correctiva/preventiva/otra; derivable del arreglo padre). */
  @Prop({ type: String, enum: Object.values(InvestigationActionType) })
  actionType?: InvestigationActionType;

  /** Responsable de ejecutar la acción (LEGACY string; se preserva). */
  @Prop({ required: true, type: String })
  responsible!: string;

  /** Responsable tipado tenant-safe (E1; validado en service). */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  responsibleUserId?: Types.ObjectId;

  /** Snapshot del nombre del responsable tipado (server-side). */
  @Prop({ trim: true, maxlength: 300 })
  responsibleSnapshot?: string;

  /** Estado administrativo de la acción. */
  @Prop({ required: true, enum: Object.values(InvestigationActionStatus), default: InvestigationActionStatus.PENDING, type: String })
  status!: InvestigationActionStatus;

  /** Fecha programada (si existe, no posterior a dueDate; validado en service). */
  @Prop({ type: Date })
  plannedDate?: Date;

  /** Fecha límite para completar la acción (opcional). */
  @Prop({ type: Date })
  dueDate?: Date;

  /** Fecha en que se completó la acción (opcional). */
  @Prop({ type: Date })
  completedDate?: Date;

  /** Evidencia declarativa de la acción (documentId tenant-safe / URL). */
  @Prop({ type: InvestigationActionEvidenceRefSchema })
  evidence?: InvestigationActionEvidenceRef;

  /** Seguimiento de la acción (percepción de efectividad — no eficacia formal). */
  @Prop({ type: InvestigationActionFollowUpSchema })
  followUp?: InvestigationActionFollowUp;
}

export const InvestigationActionSchema = SchemaFactory.createForClass(InvestigationAction);

/**
 * E1 (7.1.3) — Participante del equipo investigador.
 * userId validado tenant-safe en service (query $in agrupado, sin N+1).
 */
@Schema({ _id: false })
export class InvestigationTeamMember {
  @Prop({ required: true, type: Types.ObjectId, ref: 'User' })
  userId!: Types.ObjectId;

  /** Snapshot mínimo de identidad (server-side; sobrevive cambios). */
  @Prop({ trim: true, maxlength: 300 })
  participantSnapshot?: string;

  /** Rol de participación (texto libre: 'Líder', 'COPASST', 'Higiene', etc.). */
  @Prop({ trim: true, maxlength: 120 })
  participationRole?: string;
}

export const InvestigationTeamMemberSchema = SchemaFactory.createForClass(
  InvestigationTeamMember,
);

@Schema({ timestamps: true })
export class Incident {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Employee' })
  employeeId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  @Prop({ required: true })
  type!: string;

  @Prop({ required: true })
  date!: Date;

  @Prop({ required: true })
  description!: string;

  @Prop({ required: true })
  severity!: string;

  @Prop({ required: true })
  status!: string;

  /**
   * Días perdidos por el accidente/incidente.
   * Opcional: registros históricos pueden no tener este campo.
   * 0 significa "sin días perdidos", NO "dato no informado".
   */
  @Prop({ type: Number, default: 0, min: 0 })
  daysLost?: number;

  /**
   * Clasificación del tipo de accidente.
   * Opcional: registros históricos pueden no tener clasificación.
   * Valores válidos: 'AT' (Accidente de Trabajo), 'ATEL' (Accidente de Trabajo con Lesión),
   * 'INCIDENTE' (casi-accidente sin lesión), o cualquier string libre.
   */
  @Prop({ default: '' })
  accidentType?: string;

  // ── Campos de investigación (estándar 3.2.2 — Enfermedades Laborales) ──

  /**
   * Tipo de investigación asociada al incidente.
   * ACCIDENT para accidentalidad laboral, DISEASE para investigación de enfermedad laboral.
   * Default: ACCIDENT — mantiene compatibilidad con documentos existentes.
   */
  @Prop({ enum: Object.values(InvestigationType), default: InvestigationType.ACCIDENT, type: String })
  investigationType?: InvestigationType;

  /**
   * Causas básicas identificadas en la investigación.
   * Arreglo de strings descriptivos (ej: 'Falta de capacitación', 'Procedimiento inadecuado').
   * NO almacena información clínica.
   *
   * NOTA E1 (7.1.3): en la metodología Ivanov/IBC el campo histórico
   * `rootCauses` cumple el rol de CAUSAS BÁSICAS; `basicCauses` (abajo) es el
   * alias canónico nuevo para la gestión avanzada. Ambos se conservan; el
   * scorer de E2 decidirá la lectura canónica. NUNCA introducir el campo
   * fantasma singular `rootCause`.
   */
  @Prop({ type: [String], default: [] })
  rootCauses?: string[];

  /**
   * E1 (7.1.3) — Causas básicas (alias canónico nuevo de la gestión avanzada;
   * coexiste con `rootCauses` legacy — ver nota de arriba).
   */
  @Prop({ type: [String], default: [] })
  basicCauses?: string[];

  /**
   * Causas inmediatas identificadas en la investigación.
   * Arreglo de strings descriptivos (ej: 'Contacto con sustancia química', 'Postura inadecuada').
   * NO almacena información clínica ni diagnósticos.
   */
  @Prop({ type: [String], default: [] })
  immediateCauses?: string[];

  /**
   * Factores relacionados con el evento.
   * Arreglo de strings (ej: 'Ergonomía', 'Psicosocial', 'Químico', 'Biológico').
   * Representa factores ocupacionales/administrativos, NO diagnósticos.
   */
  @Prop({ type: [String], default: [] })
  relatedFactors?: string[];

  /**
   * Acciones correctivas derivadas de la investigación.
   * Cada acción incluye descripción, responsable y estado administrativo.
   */
  @Prop({ type: [InvestigationActionSchema], default: [] })
  correctiveActions?: InvestigationAction[];

  /**
   * Acciones preventivas derivadas de la investigación.
   * Cada acción incluye descripción, responsable y estado administrativo.
   */
  @Prop({ type: [InvestigationActionSchema], default: [] })
  preventiveActions?: InvestigationAction[];

  /**
   * Responsable de la investigación.
   * Identificador o referencia administrativa del responsable.
   * NO almacena nombre completo innecesariamente.
   *
   * COMPATIBILIDAD E1: string legacy preservado; el campo tipado tenant-safe
   * `investigationResponsibleUserId` (abajo) es el canónico nuevo. No se
   * convierten automáticamente datos históricos a usuarios.
   */
  @Prop({ type: String })
  responsible?: string;

  // ── E1 (7.1.3): investigación formal — campos canónicos nuevos ──

  /** Responsable de la investigación (tenant-safe; validado en service). */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  investigationResponsibleUserId?: Types.ObjectId;

  /** Snapshot del nombre del responsable de investigación (server-side). */
  @Prop({ trim: true, maxlength: 300 })
  investigationResponsibleSnapshot?: string;

  /** Metodología de investigación (texto: 'Ivanov', 'IBC', '5 por qué', etc.). */
  @Prop({ trim: true, maxlength: 500 })
  methodology?: string;

  /** Equipo investigador (usuarios del tenant; validación $in en service). */
  @Prop({ type: [InvestigationTeamMemberSchema], default: [] })
  investigationTeam?: InvestigationTeamMember[];

  /** Conclusiones de la investigación. */
  @Prop({ trim: true, maxlength: 3000 })
  conclusions?: string;

  /** Recomendaciones de la investigación (base de las acciones derivadas). */
  @Prop({ trim: true, maxlength: 3000 })
  recommendations?: string;

  /** Estado de progresión de la investigación (complementa al lifecycle). */
  @Prop({ type: String, enum: Object.values(InvestigationProgressStatus) })
  investigationStatus?: InvestigationProgressStatus;

  /**
   * E1 (7.1.3) — Estado canónico del caso (máquina de estados tipada).
   * El string legacy `status` NO se migra destructivamente; ver
   * resolveLifecycleStage() en incident-lifecycle.schema.ts.
   */
  @Prop({ type: String, enum: Object.values(IncidentLifecycleStage) })
  lifecycleStage?: IncidentLifecycleStage;

  /** Usuario que ejecutó el cierre documentado (server-side). */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  closedByUserId?: Types.ObjectId;

  /** Snapshot del actor de cierre (server-side). */
  @Prop({ trim: true, maxlength: 300 })
  closedBySnapshot?: string;

  /**
   * Fecha en que se inició formalmente la investigación.
   */
  @Prop({ type: Date })
  investigationDate?: Date;

  /**
   * Fecha de cierre de la investigación.
   */
  @Prop({ type: Date })
  closureDate?: Date;

  /**
   * Referencias a evidencias documentales (nombres de archivos o IDs).
   * NO almacena contenido clínico.
   *
   * COMPATIBILIDAD E1: formato legacy (string[]) preservado. La evidencia
   * estructurada de la investigación 7.1.3 vive en `investigationEvidence`.
   */
  @Prop({ type: [String], default: [] })
  evidence?: string[];

  /**
   * E1 (7.1.3) — Evidencia estructurada de la investigación: referencia
   * declarativa tenant-safe a DocumentMaster ({_id, companyId}, validada en
   * service) y/o URL + comentario. NO borra ni reemplaza `evidence` legacy.
   */
  @Prop({ type: [InvestigationActionEvidenceRefSchema], default: [] })
  investigationEvidence?: InvestigationActionEvidenceRef[];
}

export const IncidentSchema = SchemaFactory.createForClass(Incident);
IncidentSchema.index({ companyId: 1, date: -1 });
IncidentSchema.index({ companyId: 1, investigationType: 1 });
// E1 (7.1.3): índices de la gestión avanzada (todos tenant-scoped).
IncidentSchema.index({ companyId: 1, lifecycleStage: 1 });
IncidentSchema.index({ companyId: 1, investigationStatus: 1 });
// Índice parcial para unicidad de actionId DENTRO de cada caso (append-safe).
IncidentSchema.index({ 'correctiveActions.actionId': 1 }, { sparse: true });
IncidentSchema.index({ 'preventiveActions.actionId': 1 }, { sparse: true });
