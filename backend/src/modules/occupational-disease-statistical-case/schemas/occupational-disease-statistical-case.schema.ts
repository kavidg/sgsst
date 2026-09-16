import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OccupationalDiseaseStatisticalCaseDocument =
  HydratedDocument<OccupationalDiseaseStatisticalCase>;

/**
 * Calificación ocupacional de un caso estadístico de enfermedad laboral
 * (FASE 35B — infraestructura estadística común para 3.3.4/3.3.5).
 *
 * Enum cerrado (§CAMPOS.4): no se aceptan strings libres.
 *
 * - QUALIFIED      → caso reconocido/calificado como enfermedad laboral;
 *                    será el único elegible para métricas futuras (35C/35D).
 * - UNDER_REVIEW   → en revisión; NO es caso confirmado (Regla C).
 * - NOT_QUALIFIED  → la administración determinó que NO es enfermedad laboral;
 *                    nunca entra en métricas (Regla D).
 * - DISCARDED      → caso descartado; nunca entra en métricas (Regla D).
 */
export enum OccupationalDiseaseQualification {
  QUALIFIED = 'QUALIFIED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  NOT_QUALIFIED = 'NOT_QUALIFIED',
  DISCARDED = 'DISCARDED',
}

/**
 * Estado administrativo del caso (enum cerrado; sin estados clínicos).
 *
 * - OPEN   → caso activo administrativamente.
 * - CLOSED → caso cerrado. Un caso CLOSED NUNCA puede volver a contar como
 *            nuevo caso de incidencia (§CICLO DE VIDA); si el mismo evento
 *            requiere nuevo análisis, se crea un NUEVO statisticalCaseId.
 */
export enum OccupationalDiseaseCaseStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

/**
 * Caso estadístico de enfermedad laboral (FASE 35B).
 *
 * Representa ÚNICAMENTE la existencia administrativa/estadística de un caso
 * de enfermedad laboral reconocido/gestionado, para efectos de medición
 * epidemiológica del SG-SST (futuros estándares 3.3.4 prevalencia y 3.3.5
 * incidencia). NO representa la historia clínica del trabajador.
 *
 * DATOS CLÍNICOS PROHIBIDOS (§3 de la fase) — este schema NO almacena:
 * diagnóstico médico, código CIE, historia clínica, síntomas, tratamientos,
 * medicamentos, resultados clínicos, exámenes médicos, incapacidades
 * detalladas ni observaciones clínicas. Solo metadatos estadísticos/
 * administrativos mínimos.
 *
 * REGLA ANTI-DOBLE-SCORING / NO-CONVERSIÓN AUTOMÁTICA (FASE 35A):
 * este caso NUNCA se genera automáticamente desde Incident,
 * DiseaseInvestigation, Absenteeism ni ningún otro módulo operativo. Su
 * creación es explícita y administrativa (service, controlada por RBAC).
 * Incident/Absenteeism NO se convierten en evidencia de este modelo.
 *
 * DEDUPLICACIÓN / NO-RECUENTO (Gate 9):
 * - statisticalCaseId es el identificador estadístico estable del caso,
 *   único dentro del tenant (índice único { companyId, statisticalCaseId }).
 * - firstOccurrence NO es un checkbox libre: se administra por el service
 *   con validación de historial — un caso cuyo statisticalCaseId ya existió
 *   nunca puede (re)crearse como firstOccurrence = true.
 */
@Schema({
  timestamps: true,
  collection: 'occupational_disease_statistical_cases',
})
export class OccupationalDiseaseStatisticalCase {
  /** Empresa propietaria del caso (tenant isolation obligatorio). */
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true })
  companyId!: Types.ObjectId;

  /**
   * Identificador estadístico estable del caso, único dentro del tenant.
   * Permite trazabilidad, deduplicación y evita contar dos veces el mismo
   * caso (criterios de prevalencia/incidencia de 35C/35D).
   */
  @Prop({ required: true, trim: true, maxlength: 64 })
  statisticalCaseId!: string;

  /**
   * Referencia administrativa interna al trabajador (OPCIONAL — §CAMPOS.3).
   *
   * Es opcional para no impedir el registro estadístico cuando la empresa
   * gestiona el caso sin vincularlo a un empleado del sistema, y para no
   * almacenar información médica identificable innecesaria. Cuando existe:
   * - valida tenant (EmployeesService/Employee del MISMO companyId);
   * - nunca se expone más allá de lo administrativo;
   * - nunca permite acceso cross-tenant (todas las consultas son scoped).
   * La deduplicación NO depende de employeeId: depende del par
   * { companyId, statisticalCaseId }.
   */
  @Prop({ type: Types.ObjectId, ref: 'Employee' })
  employeeId?: Types.ObjectId;

  /** Calificación ocupacional del caso (enum cerrado; ver reglas A–D). */
  @Prop({
    required: true,
    enum: Object.values(OccupationalDiseaseQualification),
    type: String,
  })
  occupationalQualification!: OccupationalDiseaseQualification;

  /**
   * Fecha de reconocimiento/registro administrativo del caso.
   * Obligatoria cuando occupationalQualification = QUALIFIED (Regla B);
   * no puede ser futura para un caso reconocido (Regla E).
   */
  @Prop({ type: Date })
  recognitionDate?: Date;

  /**
   * Estado administrativo del caso (enum cerrado OPEN/CLOSED).
   * Un caso CLOSED nunca vuelve a contar como nuevo caso de incidencia
   * (§CICLO DE VIDA); la reapertura de un caso CLOSED conserva su
   * statisticalCaseId y NO crea un caso nuevo.
   */
  @Prop({
    required: true,
    enum: Object.values(OccupationalDiseaseCaseStatus),
    default: OccupationalDiseaseCaseStatus.OPEN,
    type: String,
  })
  caseStatus!: OccupationalDiseaseCaseStatus;

  /**
   * Período estadístico del caso en formato 'YYYY-MM' (§CAMPOS.7):
   * consultable, validable y coherente con recognitionDate (Regla F).
   * Se DERIVA del recognitionDate cuando este existe (evita incoherencias
   * entre fecha y período). Para casos sin recognitionDate se usa la fecha
   * de registro (hoy).
   */
  @Prop({ required: true, trim: true })
  period!: string;

  /** Año estadístico (consultable: índice { companyId, periodYear }). */
  @Prop({ required: true, type: Number })
  periodYear!: number;

  /** Mes estadístico 1–12 (consultable: índice { companyId, periodYear, periodMonth }). */
  @Prop({ required: true, type: Number, min: 1, max: 12 })
  periodMonth!: number;

  /**
   * Indica si el caso corresponde a una PRIMERA ocurrencia estadística.
   *
   * NO es un checkbox libre: el service impide registrar como
   * firstOccurrence = true un statisticalCaseId que ya existió
   * (incluidos registros desactivados) dentro del tenant. Un caso
   * CLOSED/reabierto NUNCA se convierte en nuevo caso: conserva su
   * statisticalCaseId y su primera ocurrencia original (Gate 9).
   */
  @Prop({ required: true, type: Boolean, default: true })
  firstOccurrence!: boolean;

  /**
   * Referencia administrativa opcional y EXPLÍCITA a una investigación
   * (Incident con investigationType = DISEASE, 3.2.2). NUNCA se genera
   * automáticamente (§INCIDENT/DISEASE INVESTIGATION): es un vínculo
   * manual de trazabilidad; no convierte la investigación en caso.
   */
  @Prop({ type: Types.ObjectId, ref: 'Incident' })
  investigationRef?: Types.ObjectId;

  /** Baja lógica: no existe delete físico (§CAMPOS.9). */
  @Prop({ default: true, type: Boolean })
  active!: boolean;

  /** UID del usuario que creó el caso (server-side, nunca del body). */
  @Prop({ trim: true, maxlength: 128, default: '' })
  createdBy!: string;

  /** UID del último usuario que actualizó (server-side). */
  @Prop({ trim: true, maxlength: 128, default: '' })
  updatedBy!: string;
}

export const OccupationalDiseaseStatisticalCaseSchema =
  SchemaFactory.createForClass(OccupationalDiseaseStatisticalCase);

// ── Índices tenant-scoped (§ÍNDICES; sin redundantes) ────────────────────────

// Deduplicación: el caso es único dentro del tenant.
OccupationalDiseaseStatisticalCaseSchema.index(
  { companyId: 1, statisticalCaseId: 1 },
  { unique: true },
);

// Consultas por período estadístico.
OccupationalDiseaseStatisticalCaseSchema.index({ companyId: 1, period: 1 });

// Métricas futuras: calificación (QUALIFIED) y estado.
OccupationalDiseaseStatisticalCaseSchema.index({
  companyId: 1,
  occupationalQualification: 1,
});
OccupationalDiseaseStatisticalCaseSchema.index({ companyId: 1, caseStatus: 1 });

// Trazabilidad por reconocimiento.
OccupationalDiseaseStatisticalCaseSchema.index({ companyId: 1, recognitionDate: 1 });

// Trazabilidad administrativa por trabajador (cuando existe employeeId).
OccupationalDiseaseStatisticalCaseSchema.index({
  companyId: 1,
  employeeId: 1,
  recognitionDate: 1,
});
