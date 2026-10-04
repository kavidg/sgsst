import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SstEmergenciesDocument = HydratedDocument<SstEmergencies>;

/**
 * Identidad canónica del módulo de Emergencias.
 *
 * CORRECCIÓN DE IDENTIDAD (Etapa 5.1.1): este módulo se autoidentificaba con
 * itemCode '1.1.10', pero en el catálogo normativo (catalog-60.ts) 1.1.10 es
 * un DUPLICATE de 1.1.3 ("Asignación de recursos técnicos") y el estándar real
 * al que corresponde el dominio de plan de emergencias es:
 *
 *   5.1.1 — Plan de prevención, preparación y respuesta ante emergencias (HACER)
 *
 * COMPATIBILIDAD DE LECTURA: los documentos históricos creados con itemCode
 * '1.1.10' siguen siendo legibles (ver EMERGENCY_LEGACY_ITEM_CODES); NINGÚN
 * registro nuevo se genera con el identificador legacy y NO se reescriben
 * documentos existentes (sin migración física destructiva; la migración
 * 1.1.10 → 5.1.1 se hará en una etapa dedicada).
 */
export const CANONICAL_EMERGENCY_ITEM_CODE = '5.1.1';

/** Valores legacy reconocidos SOLO para lectura de documentos históricos. */
export const EMERGENCY_LEGACY_ITEM_CODES = ['1.1.10'] as const;

/** true si `itemCode` es una identidad válida del módulo (canónica o legacy). */
export function isSstEmergenciesItemCode(itemCode: string): boolean {
  return (
    itemCode === CANONICAL_EMERGENCY_ITEM_CODE ||
    (EMERGENCY_LEGACY_ITEM_CODES as readonly string[]).includes(itemCode)
  );
}

/**
 * FRONTERA DE SCORING (documentada; el provider oficial se construye después):
 *
 *   5.1.1 = Plan de prevención, preparación y respuesta ante emergencias.
 *     Evidencia futura: amenazas/vulnerabilidades (threats[]), recursos
 *     operativos (equipment[]), rutas y puntos de encuentro (evacuación),
 *     contactos (contacts[]), procedimientos (plan.generalResponseProcedure),
 *     socialización (plan.socialization) y simulacros (drills[]) como
 *     preparación general.
 *
 *   5.1.2 = Brigada de emergencia.
 *     Evidencia futura: conformación (brigades[]), integrantes
 *     (brigades[].typedMembers[]), funciones, suplentes (isAlternate),
 *     capacitación de brigadistas (trainingDate/trainingEvidence) y
 *     disponibilidad.
 *
 * La MISMA brigada puede ser leída por ambos estándares (no se duplica como
 * dos entidades), pero cada provider deberá scorear dimensiones INDEPENDIENTES
 * para no contar la misma evidencia dos veces (riesgo de doble scoring
 * detectado en la auditoría 5.1.1). Esa decisión pertenece a la etapa de
 * scoring: aquí solo queda documentada la frontera.
 */

export enum SstEmergenciesComplianceStatus {
  COMPLIES = 'COMPLIES',
  PENDING = 'PENDING',
  NON_COMPLIANT = 'NON_COMPLIANT',
}

/**
 * Valoración de amenazas de emergencia (matriz 5.1.1).
 * Dominio PROPIO, independiente del módulo general de riesgos laborales
 * (Risk): la matriz de emergencias evalúa escenarios de emergencia
 * (incendio, sismo, fuga, etc.), no peligros ocupacionales.
 */
export enum EmergencyProbability {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export enum EmergencyImpact {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export enum EmergencyRiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

/**
 * Tipos de contacto de emergencia (cadena de llamadas 5.1.1).
 * No existe una convención previa de contactos en el repositorio; valores en
 * mayúsculas sin tildes, consistentes con el resto de enums del proyecto.
 */
export enum EmergencyContactType {
  ARL = 'ARL',
  BOMBEROS = 'BOMBEROS',
  AMBULANCIA = 'AMBULANCIA',
  POLICIA = 'POLICIA',
  HOSPITAL = 'HOSPITAL',
  IPS = 'IPS',
  DEFENSA_CIVIL = 'DEFENSA_CIVIL',
  CRUZ_ROJA = 'CRUZ_ROJA',
  INTERNO = 'INTERNO',
  OTRO = 'OTRO',
}

/**
 * Tipología de recursos de emergencia (5.1.1).
 * Inventario/evidencia de PREPARACIÓN para emergencias: NO es mantenimiento
 * (4.2.5/Maintenance) y no genera registros de mantenimiento automáticos.
 * Cualquier relación futura con mantenimiento será explícita y sin doble
 * scoring.
 */
export enum EmergencyResourceType {
  EXTINTOR = 'EXTINTOR',
  BOTIQUIN = 'BOTIQUIN',
  CAMILLA = 'CAMILLA',
  ALARMA = 'ALARMA',
  SENALIZACION = 'SENALIZACION',
  KIT_EMERGENCIA = 'KIT_EMERGENCIA',
  EQUIPO_COMUNICACION = 'EQUIPO_COMUNICACION',
  LINTERNA = 'LINTERNA',
  RADIO = 'RADIO',
  OTRO = 'OTRO',
}

/**
 * Estado operativo de un recurso de emergencia. Determina (en el scoring
 * futuro) si el recurso es operativo. El campo legacy `status` ('OPERATIVO'…)
 * se conserva por compatibilidad; los registros nuevos usan
 * `operationalStatus`.
 */
export enum EmergencyResourceStatus {
  OPERATIVE = 'OPERATIVE',
  PARTIAL = 'PARTIAL',
  INOPERATIVE = 'INOPERATIVE',
}

/** Función de un brigadista dentro de la brigada (5.1.2). */
export enum EmergencyBrigadeFunction {
  LEADER = 'LEADER',
  EVACUATION = 'EVACUATION',
  FIRST_AID = 'FIRST_AID',
  FIREFIGHTING = 'FIREFIGHTING',
  COMMUNICATION = 'COMMUNICATION',
  LOGISTICS = 'LOGISTICS',
  OTHER = 'OTHER',
}

/** Registro de socialización del plan (fecha, cobertura, participantes, evidencias). */
@Schema({ _id: false })
export class EmergencyPlanSocialization {
  /** Fecha de la socialización. */
  @Prop() date?: Date;
  /** Porcentaje de cobertura/participación (0-100). */
  @Prop({ min: 0, max: 100 }) coveragePercentage?: number;
  /** Participantes/cobertura (texto libre: sedes, cargos, etc.). */
  @Prop({ default: '' }) participants!: string;
  /** Observaciones de la socialización. */
  @Prop({ default: '' }) observations!: string;
  /** Evidencias (URLs de soporte). */
  @Prop({ type: [String], default: [] }) evidence!: string[];
}

@Schema({ _id: false })
export class EmergencyPlan {
  @Prop({ default: '' }) planName!: string;
  @Prop({ default: '' }) version!: string;
  @Prop() effectiveDate?: Date;
  @Prop() expirationDate?: Date;
  @Prop({ default: '' }) approvedBy!: string;
  @Prop() approvedAt?: Date;
  @Prop({ default: '' }) documentUrl!: string;

  // ── Etapa 5.1.1: contenido estructurado (campos adicionales opcionales) ──
  /** Objetivos del plan. */
  @Prop({ type: [String], default: [] }) objectives!: string[];
  /** Alcance del plan (sedes, áreas, personal cubierto). */
  @Prop({ default: '' }) scope!: string;
  /** Acciones preventivas definidas por el plan. */
  @Prop({ type: [String], default: [] }) preventiveActions!: string[];
  /** Procedimiento general de respuesta ante emergencias. */
  @Prop({ default: '' }) generalResponseProcedure!: string;
  /** Mecanismo de actualización periódica del plan. */
  @Prop({ default: '' }) updateMechanism!: string;
  /** Usuario responsable del plan (ref User). */
  @Prop({ type: Types.ObjectId }) responsibleUserId?: Types.ObjectId;
  /** Usuario aprobador del plan (ref User). */
  @Prop({ type: Types.ObjectId }) approverUserId?: Types.ObjectId;
  /** Registro de socialización del plan. */
  @Prop({ type: EmergencyPlanSocialization }) socialization?: EmergencyPlanSocialization;
  /** Documento oficial asociado en DocumentMaster (documentType EMERGENCY_PLAN). Solo vínculo referencial: la aprobación documental sigue siendo la de DocumentManagement/Approval Workflow. */
  @Prop({ type: Types.ObjectId, ref: 'DocumentMaster' }) documentId?: Types.ObjectId;
}

@Schema({ _id: false })
export class EmergencyThreat {
  /** Identificador único de la amenaza dentro de la empresa. */
  @Prop({ required: true }) threatId!: string;
  /** Escenario de emergencia (ej: "Incendio en planta", "Sismo"). */
  @Prop({ required: true }) scenario!: string;
  /** Amenaza identificada (ej: "Sobrecarga eléctrica"). */
  @Prop({ required: true }) threat!: string;
  /** Descripción del escenario de emergencia. */
  @Prop({ default: '' }) description!: string;
  /** Vulnerabilidad frente a la amenaza. */
  @Prop({ default: '' }) vulnerability!: string;
  /** Personas expuestas (descripción textual). */
  @Prop({ default: '' }) exposedPeople!: string;
  /** Recursos/activos expuestos. */
  @Prop({ default: '' }) exposedAssets!: string;
  /** Procesos expuestos. */
  @Prop({ default: '' }) exposedProcesses!: string;
  /** Probabilidad de ocurrencia. */
  @Prop({ enum: Object.values(EmergencyProbability), default: EmergencyProbability.LOW })
  probability!: EmergencyProbability;
  /** Impacto potencial. */
  @Prop({ enum: Object.values(EmergencyImpact), default: EmergencyImpact.LOW })
  impact!: EmergencyImpact;
  /** Nivel de riesgo resultante (calculado por el servicio a partir de probability × impact, o asignado explícitamente). */
  @Prop({
    enum: Object.values(EmergencyRiskLevel),
    default: EmergencyRiskLevel.LOW,
  })
  riskLevel!: EmergencyRiskLevel;
  /** Medidas preventivas. */
  @Prop({ type: [String], default: [] }) preventiveMeasures!: string[];
  /** Medidas de respuesta. */
  @Prop({ type: [String], default: [] }) responseMeasures!: string[];
  /** Procedimiento de respuesta asociado a este escenario (texto; permite vincular con generalResponseProcedure del plan o documentos posteriores). */
  @Prop({ default: '' }) responseProcedure!: string;
  /** Borrado lógico: las amenazas desactivadas se conservan para historial. */
  @Prop({ default: true }) active!: boolean;
}

/**
 * Contacto de emergencia (cadena de llamadas 5.1.1).
 * `callOrder` representa el orden de llamada: 1 = contacto principal,
 * 2 = secundario, etc. No implementa un motor automático de llamadas.
 */
@Schema({ _id: false })
export class EmergencyContact {
  /** Identificador único del contacto dentro de la empresa. */
  @Prop({ required: true }) contactId!: string;
  /** Tipo de contacto. */
  @Prop({ enum: Object.values(EmergencyContactType), required: true })
  type!: EmergencyContactType;
  /** Nombre del contacto/entidad. */
  @Prop({ required: true }) name!: string;
  /** Teléfono principal (string: admite extensión, prefijo, etc.). */
  @Prop({ required: true }) phone!: string;
  /** Teléfono secundario opcional. */
  @Prop({ default: '' }) secondaryPhone!: string;
  /** Dirección opcional (ej: sede del hospital). */
  @Prop({ default: '' }) address!: string;
  /** Notas opcionales (horarios, contexto). */
  @Prop({ default: '' }) notes!: string;
  /** Orden en la cadena de llamadas (1 = principal). */
  @Prop({ default: 1, min: 1 }) callOrder!: number;
  /** Borrado lógico: contactos desactivados se conservan para historial. */
  @Prop({ default: true }) active!: boolean;
}

/** Miembro tipado de brigada (5.1.2) — referencia real a Employee. */
@Schema({ _id: false })
export class BrigadeMember {
  /** Identificador único del miembro dentro de la empresa. */
  @Prop({ required: true }) memberId!: string;
  /** Empleado vinculado (ref Employee, validado contra la empresa autenticada). */
  @Prop({ required: true, type: Types.ObjectId, ref: 'Employee' })
  employeeId!: Types.ObjectId;
  /**
   * Snapshot del nombre del empleado generado en SERVIDOR al momento del
   * registro: preserva evidencia histórica aunque el Employee cambie o se
   * elimine después. Nunca se acepta del frontend como fuente de verdad.
   */
  @Prop({ required: true }) employeeNameSnapshot!: string;
  /** Función del brigadista. */
  @Prop({ enum: Object.values(EmergencyBrigadeFunction), default: EmergencyBrigadeFunction.OTHER })
  function!: EmergencyBrigadeFunction;
  /** true = suplente; false = titular. */
  @Prop({ default: false }) isAlternate!: boolean;
  /** Borrado lógico. */
  @Prop({ default: true }) active!: boolean;
  /** Fecha de la última capacitación de brigadista (evidencia específica, no el módulo general de Training). */
  @Prop() trainingDate?: Date;
  /** Tipo de capacitación (texto: brigs, primeros auxilios, contra incendio…). */
  @Prop({ default: '' }) trainingType!: string;
  /** Evidencia de la capacitación (URL). */
  @Prop({ default: '' }) trainingEvidence!: string;
  /** Observaciones. */
  @Prop({ default: '' }) observations!: string;
}

@Schema({ _id: false })
export class Brigade {
  @Prop({ required: true }) brigadeId!: string;
  @Prop({ required: true }) name!: string;
  @Prop({ default: 'Evacuación' }) type!: string;
  @Prop({ default: '' }) leader!: string;
  /**
   * LEGACY: miembros como texto libre (datos históricos). Se conserva SOLO por
   * compatibilidad de lectura; los registros nuevos usan `typedMembers`
   * (referencia a Employee con snapshot). No se migra automáticamente.
   */
  @Prop({ type: [String], default: [] }) members!: string[];
  /** Miembros tipados con referencia a Employee (estructura nueva). */
  @Prop({ type: [BrigadeMember], default: [] }) typedMembers!: BrigadeMember[];
  @Prop({ default: 'Mensual' }) meetingFrequency!: string;
  @Prop() lastMeetingDate?: Date;
  /** Borrado lógico: brigadas desactivadas se conservan con sus miembros e historial. */
  @Prop({ default: true }) active!: boolean;
}

/** Registro puntual de conteo de evacuación en un punto de encuentro. */
@Schema({ _id: false })
export class EmergencyEvacuationCount {
  /** Fecha del conteo. */
  @Prop() date?: Date;
  /** Conteo esperado. */
  @Prop({ default: 0, min: 0 }) expectedCount!: number;
  /** Conteo realizado. */
  @Prop({ default: 0, min: 0 }) actualCount!: number;
  /** Personas faltantes (derivado o registrado). */
  @Prop({ default: 0, min: 0 }) missingCount!: number;
  /** Responsable del conteo. */
  @Prop({ default: '' }) responsible!: string;
  /** Observaciones. */
  @Prop({ default: '' }) observations!: string;
}

@Schema({ _id: false })
export class MeetingPoint {
  @Prop({ required: true }) pointId!: string;
  @Prop({ required: true }) name!: string;
  @Prop({ default: '' }) location!: string;
  @Prop({ default: 0 }) capacity!: number;
  @Prop({ type: [Number], default: [] }) coordinates!: number[];
  @Prop({ default: true }) active!: boolean;

  // ── Etapa 2 (5.1.1): responsable y conteo de evacuación ──
  /** Responsable del punto de encuentro (texto). */
  @Prop({ default: '' }) responsible!: string;
  /** Procedimiento de conteo del punto. */
  @Prop({ default: '' }) countProcedure!: string;
  /** Conteo esperado (personas asignadas al punto). */
  @Prop({ default: 0, min: 0 }) expectedCount!: number;
  /**
   * Preparación del conteo de evacuación (estructura lista, sin sistema en
   * tiempo real): registros de conteo realizados por simulacro/fecha.
   */
  @Prop({ type: [EmergencyEvacuationCount], default: [] }) counts!: EmergencyEvacuationCount[];
}

@Schema({ _id: false })
export class EvacuationRoute {
  @Prop({ required: true }) routeId!: string;
  @Prop({ required: true }) name!: string;
  @Prop({ default: '' }) description!: string;
  @Prop({ default: '' }) floor!: string;
  @Prop({ default: '' }) diagramUrl!: string;
  @Prop({ default: 5 }) estimatedTimeMinutes!: number;
  @Prop({ default: true }) active!: boolean;

  // ── Etapa 2 (5.1.1): responsable, capacidad, salida y señalización ──
  /** Responsable de la ruta (texto). */
  @Prop({ default: '' }) responsible!: string;
  /** Capacidad estimada de la ruta (personas). */
  @Prop({ default: 0, min: 0 }) estimatedCapacity!: number;
  /** Salida asociada a la ruta. */
  @Prop({ default: '' }) associatedExit!: string;
  /** Señalización verificada de la ruta. */
  @Prop({ default: false }) signageVerified!: boolean;
}

@Schema({ _id: false })
export class EmergencyEquipment {
  @Prop({ required: true }) equipmentId!: string;
  @Prop({ required: true }) name!: string;
  /**
   * LEGACY: tipo libre de los datos históricos (default 'General'). Se
   * conserva por compatibilidad (los providers lo leen); los registros nuevos
   * usan `resourceType` tipado.
   */
  @Prop({ default: 'General' }) type!: string;
  /** Tipo de recurso de emergencia (estructura nueva, Etapa 2). */
  @Prop({ enum: Object.values(EmergencyResourceType) }) resourceType?: EmergencyResourceType;
  @Prop({ default: '' }) location!: string;
  @Prop({ default: 1 }) quantity!: number;
  @Prop() lastInspectionDate?: Date;
  @Prop() nextInspectionDate?: Date;
  /**
   * LEGACY: estado libre histórico ('OPERATIVO'…); los providers lo leen.
   * Los registros nuevos usan `operationalStatus`.
   */
  @Prop({ default: 'OPERATIVO' }) status!: string;
  /** Estado operativo tipado (OPERATIVE/PARTIAL/INOPERATIVE). */
  @Prop({ enum: Object.values(EmergencyResourceStatus) }) operationalStatus?: EmergencyResourceStatus;
  @Prop({ default: '' }) certificateUrl!: string;
  /** Evidencia opcional del recurso (URL: foto, acta, certificado). */
  @Prop({ default: '' }) evidenceUrl!: string;
  /** Borrado lógico. */
  @Prop({ default: true }) active!: boolean;
}

@Schema({ _id: false })
export class Drill {
  @Prop({ required: true }) drillId!: string;
  @Prop({ required: true }) name!: string;
  @Prop({ default: 'Evacuación' }) type!: string;
  @Prop({ required: true }) date!: Date;
  @Prop({ default: 0 }) participants!: number;
  @Prop({ default: 0 }) expectedParticipants!: number;
  @Prop({ default: 0 }) durationMinutes!: number;
  @Prop({ default: '' }) results!: string;
  @Prop({ default: '' }) findings!: string;
  @Prop({ default: '' }) improvements!: string;
  @Prop({ type: [String], default: [] }) evidence!: string[];
  @Prop({ default: 'Programado' }) status!: string;
  /**
   * Vínculo OPCIONAL con la programación del Plan Anual de Trabajo
   * (PlanActivity). SstEmergencies es dueño del evento ejecutado y
   * AnnualWorkPlan de la programación: el vínculo vive del lado del drill
   * (sin backfill automático y sin crear drillId en PlanActivity).
   */
  @Prop({ type: Types.ObjectId }) planActivityId?: Types.ObjectId;
  /** Borrado lógico: simulacros desactivados se conservan para historial. */
  @Prop({ default: true }) active!: boolean;
}

@Schema({ _id: false })
export class SstEmergenciesHistoryEntry {
  @Prop({ required: true }) action!: string;
  @Prop({ required: true }) timestamp!: Date;
  @Prop({ required: true }) userId!: string;
  @Prop({ default: '' }) userName!: string;
  @Prop({ default: '' }) details!: string;
}

/**
 * Entidad principal Emergencias (5.1.1 — Plan de prevención, preparación y
 * respuesta ante emergencias; legacy '1.1.10') — UNA por empresa.
 *
 * Contiene:
 * - plan de emergencias (identificación, contenido estructurado, socialización, documento oficial)
 * - matriz de amenazas y vulnerabilidades (threats[])
 * - contactos de emergencia / cadena de llamadas (contacts[])
 * - brigadas (dominio compartido con 5.1.2 — ver frontera de scoring)
 * - puntos de encuentro (con conteo de evacuación)
 * - rutas de evacuación
 * - recursos/equipos (equipment[])
 * - simulacros
 * - historial
 * - estado de cumplimiento
 */
@Schema({ timestamps: false, collection: 'phva_advanced_emergencies' })
export class SstEmergencies {
  @Prop({ required: true, type: Types.ObjectId, index: true }) companyId!: Types.ObjectId;
  @Prop({ default: CANONICAL_EMERGENCY_ITEM_CODE }) itemCode!: string;
  @Prop({ default: new Date().getFullYear() }) year!: number;
  @Prop({ default: SstEmergenciesComplianceStatus.PENDING }) complianceStatus!: string;
  @Prop({ default: '' }) complianceReason!: string;

  @Prop({ type: EmergencyPlan, default: () => ({}) }) plan!: EmergencyPlan;
  @Prop({ type: [EmergencyThreat], default: [] }) threats!: EmergencyThreat[];
  @Prop({ type: [EmergencyContact], default: [] }) contacts!: EmergencyContact[];
  @Prop({ type: [Brigade], default: [] }) brigades!: Brigade[];
  @Prop({ type: [MeetingPoint], default: [] }) meetingPoints!: MeetingPoint[];
  @Prop({ type: [EvacuationRoute], default: [] }) evacuationRoutes!: EvacuationRoute[];
  @Prop({ type: [EmergencyEquipment], default: [] }) equipment!: EmergencyEquipment[];
  @Prop({ type: [Drill], default: [] }) drills!: Drill[];
  @Prop({ type: [SstEmergenciesHistoryEntry], default: [] }) history!: SstEmergenciesHistoryEntry[];
}

export const SstEmergenciesSchema = SchemaFactory.createForClass(SstEmergencies);
SstEmergenciesSchema.index({ companyId: 1, itemCode: 1 }, { unique: true });
