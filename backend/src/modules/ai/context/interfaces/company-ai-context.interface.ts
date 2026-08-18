import { PhvaAnalysisResult } from '../../../phva/interfaces/phva-analysis.interface';

/**
 * Información operativa de la empresa dentro del contexto IA.
 */
export interface CompanyAIContextCompany {
  /** Identificador de la empresa. */
  id: string;
  /** Nombre de la empresa. */
  name: string;
  /** Tipo de estándares aplicables (7, 21 o 60). Null si no está configurado. */
  standardsType: string | null;
}

/**
 * Estado de cumplimiento agregado del SG-SST dentro del contexto IA.
 */
export interface CompanyAIContextCompliance {
  /** Porcentaje global ponderado (0-100). Reutiliza overallCompliance del Compliance Engine. */
  overallCompliance: number;
  /** Brechas detectadas (títulos de hallazgos reales). */
  gaps: string[];
  /** Recomendaciones de mejora (títulos reales). */
  recommendations: string[];
}

/**
 * Estado documental dentro del contexto IA.
 */
export interface CompanyAIContextDocuments {
  /** Total de documentos registrados. */
  total: number;
  /** Nombres de documentos en estados pendientes (borrador, revisión, aprobación). */
  pending: string[];
  /** Nombres de documentos vencidos (fecha de vencimiento en el pasado y no obsoletos/archivados). */
  expired: string[];
  /** Estado general derivado del conjunto documental. */
  generalStatus: 'SIN_DOCUMENTOS' | 'AL_DIA' | 'CON_PENDIENTES' | 'CON_VENCIDOS';
}

/**
 * Estado de actividades del plan anual dentro del contexto IA.
 */
export interface CompanyAIContextActivities {
  /** Total de actividades del plan anual vigente. */
  total: number;
  /** Títulos de actividades pendientes (Pending). */
  pending: string[];
  /** Títulos de actividades atrasadas (Delayed). */
  delayed: string[];
  /** Títulos de actividades completadas (Completed). */
  completed: string[];
}

/**
 * Miembro COPASST dentro del contexto IA (1.1.7).
 *
 * Fuente: snapshot real `memberCoverage` del dominio 1.1.7 (recalculado por
 * PhvaAdvancedCopasstTrainingService con las reglas de cobertura del estándar).
 * La IA NO recalcula ni re-resuelve miembros: solo consume el snapshot.
 */
export interface CompanyAIContextCopasstMember {
  /** Identificador de usuario del miembro (solo si el contexto lo permite). */
  userId: string;
  name: string;
  /** Rol dentro del comité (p. ej. Presidente, Secretario). Null si no existe. */
  committeeRole?: string;
  /** Tipo de representación (empleador/trabajadores). Null si no existe. */
  representationType?: string;
  /** Estado del miembro en el periodo vigente (p. ej. ACTIVO). */
  status: string;
  /** Capacitado: participó en al menos una sesión EJECUTADA. */
  trained: boolean;
  /** Fecha ISO de primera capacitación ejecutada. Null si no existe (no se inventa). */
  trainedAt: string | null;
  /** Cantidad de sesiones ejecutadas donde participó. */
  executedSessions: number;
}

/**
 * Estado real de la Capacitación de los integrantes del COPASST (1.1.7)
 * dentro del contexto IA.
 *
 * Se construye reutilizando el dominio (PhvaAdvancedCopasstTrainingService):
 * NO duplica la definición de cobertura, la clasificación de compliance ni el
 * snapshot de miembros. Listas limitadas (resumen, excepciones y pendientes
 * primero); sin datos se usan 0 / [] / null según la convención del contexto.
 */
export interface CompanyAIContextCopasstTraining {
  /** Discriminador del estándar. Null si la empresa no tiene entidad 1.1.7. */
  itemCode: string | null;
  /** Año del programa de capacitación. Null si no existe entidad. */
  year: number | null;
  /** Estado de compliance del dominio. Null si no existe entidad. */
  complianceStatus: 'COMPLIES' | 'PENDING' | 'NON_COMPLIANT' | null;
  /** Razón/observación de compliance del dominio. Null si no existe entidad. */
  complianceReason: string | null;
  /** Cobertura real calculada por el dominio (fuente única de verdad). */
  coverage: {
    /** Porcentaje: miembros ACTIVOS con ≥1 sesión ejecutada / miembros activos. */
    percentage: number;
    /** Miembros ACTIVOS del periodo COPASST vigente (denominador). */
    totalMembers: number;
    /** Miembros activos con al menos una sesión ejecutada (numerador). */
    trainedMembers: number;
    /** Miembros activos pendientes de capacitación (numerador restante). */
    pendingMembers: number;
    /** Nombres de miembros pendientes (limitados al máximo del contexto). */
    pendingMemberNames: string[];
  };
  /** Resumen de sesiones reales de la entidad 1.1.7. */
  sessions: {
    total: number;
    /** Sesiones con status 'Ejecutada' o completionDate (regla de dominio). */
    executed: number;
    /** Sesiones no ejecutadas y no canceladas (programadas/en curso). */
    scheduled: number;
    /** Sesiones con status 'Cancelada'. */
    canceled: number;
    /** Sesiones no ejecutadas con expirationDate vencida. */
    expired: number;
    /** Sesiones no ejecutadas con scheduledDate futura. */
    upcoming: number;
  };
  /** Snapshot por miembro (limitado al máximo del contexto). */
  members: CompanyAIContextCopasstMember[];
  /** Evaluaciones del programa (globales a la entidad: no hay relación participante). */
  evaluations: {
    attempts: number;
    passed: number;
    failed: number;
  };
  /** Conteos de evidencias reales (sin URLs ni documentos ficticios). */
  evidences: {
    /** Evidencias legacy de strings (asistencia + firmas + archivos + certificados). */
    legacyCount: number;
    /** Evidencias estructuradas persistentes de Fase 4. */
    structuredCount: number;
  };
  /**
   * Tendencias: null. El modelo 1.1.7 no conserva suficiente información
   * histórica como para construir una tendencia sin inventar datos.
   */
  trend: null;
}

/**
 * Miembro del Comité de Convivencia Laboral dentro del contexto IA (1.1.8).
 *
 * Fuente: datos reales del ConvivenciaPeriod vigente (leído por
 * ConvivenciaService.findCurrent, scoped por companyId). La IA NO recalcula
 * conformación ni estados: consume el snapshot real del dominio. Lista
 * limitada al máximo del contexto y sin PII innecesaria (sin documentos,
 * teléfonos ni datos de contacto).
 */
export interface CompanyAIContextConvivenciaMember {
  /** Identificador de usuario del miembro (solo si el contexto lo permite). */
  userId: string;
  name: string;
  /** Rol dentro del comité (PRESIDENTE / SECRETARIO / PRINCIPAL / SUPLENTE). */
  committeeRole: string;
  /** Tipo de representación (EMPLEADOR / TRABAJADOR). */
  representationType: string;
  /** Estado del miembro en el periodo (ACTIVO / INACTIVO). */
  status: string;
}

/**
 * Estado real del Comité de Convivencia Laboral (1.1.8) dentro del contexto IA.
 *
 * `complianceStatus`, `complianceReason`, `percentage`, `metCriteria` y
 * `missingCriteria` provienen EXCLUSIVAMENTE de
 * ConvivenciaService.getComplianceSnapshot() (fuente única de verdad del
 * dominio — Fase 2). La IA NO reimplementa resolveCompliance() ni recalcula
 * el porcentaje: PENDING nunca se presenta como 100%.
 *
 * Los casos confidenciales se representan SOLO con conteos agregados
 * (caseCount/openCaseCount/closedCaseCount): NUNCA se envían nombres,
 * descripciones, evidencias ni contenido sensible a la IA.
 *
 * Listas limitadas (miembros y reuniones hasta el máximo del contexto) sin
 * URLs de storage, sin secureToken/OTP, sin documentos privados y sin PII
 * innecesaria.
 */
export interface CompanyAIContextConvivencia {
  /** true si la empresa tiene un periodo de convivencia vigente (1.1.8). */
  available: boolean;
  /** Discriminador del estándar: '1.1.8'. Null si la empresa no tiene periodo. */
  itemCode: string | null;
  /** Estado de compliance del dominio (getComplianceSnapshot). Null si no hay periodo. */
  complianceStatus: 'COMPLIES' | 'PENDING' | 'NON_COMPLIANT' | null;
  /** Razón/observación de compliance del dominio. Null si no hay periodo. */
  complianceReason: string | null;
  /** Progreso 0-100 coherente con complianceStatus (COMPLIES→100, PENDING→25/50/75, NON_COMPLIANT→0). */
  percentage: number;
  /** true si la empresa está exenta (requiresConvivencia === false). */
  exempt: boolean;
  /** Condiciones de dominio presentes (etiquetas legibles del snapshot). */
  metCriteria: string[];
  /** Condiciones de dominio ausentes (etiquetas legibles del snapshot). */
  missingCriteria: string[];
  /** Estado real del periodo (ACTIVO / PROXIMO_A_VENCER / VENCIDO / ARCHIVADO). */
  periodStatus: string;
  /** Estado real de aprobación del periodo. */
  approvalStatus: string;
  /** Miembros registrados en el periodo (conteo real). */
  memberCount: number;
  /** Reuniones registradas (conteo real). */
  meetingCount: number;
  /** Reuniones con status 'CERRADA' (mismo concepto de "reunión realizada" del dominio). */
  completedMeetingCount: number;
  /** Evidencias registradas en evidence[] (conteo real del snapshot). */
  evidenceCount: number;
  /** Compromisos/planes de acción registrados (conteo real). */
  commitmentCount: number;
  /** Compromisos por estado (conteos agregados, sin responsables ni contenido). */
  commitmentStatusCounts: {
    open: number;
    inProgress: number;
    completed: number;
    overdue: number;
    cancelled: number;
  };
  /** Casos confidenciales — SOLO conteos agregados (nunca contenido sensible). */
  cases: {
    total: number;
    open: number;
    closed: number;
  };
  /** Miembros (limitados al máximo del contexto) — sin PII innecesaria. */
  members: CompanyAIContextConvivenciaMember[];
  /** Reuniones (limitadas) — solo fecha y estado, sin actas ni URLs. */
  meetings: { meetingDate: string | null; status: string }[];
}

/**
 * Resumen real de la evaluación inicial / autoevaluación (AUDIT-5).
 *
 * Fuente: InitialEvaluationService.findCurrent (lectura pura, sin findOrCreate:
 * el contexto IA nunca crea datos). Agregados sin PII: solo conteos por estado.
 */
export interface CompanyAIContextInitialEvaluation {
  /** true si la empresa tiene una evaluación inicial registrada. */
  available: boolean;
  /** Estado del dominio (Borrador / En evaluación / Aprobada / …). Null sin evaluación. */
  status: string | null;
  /** Cumplimiento global ponderado 0-100. 0 sin evaluación. */
  overallCompliance: number;
  /** Total de estándares del catálogo evaluado. */
  totalStandards: number;
  /** Estándares con estado evaluado (Cumple + No Cumple + No Aplica). */
  evaluated: number;
  /** Estándares en estado Cumple. */
  compliant: number;
  /** Estándares en estado No Cumple. */
  nonCompliant: number;
  /** Conteo de hallazgos registrados (sin contenido). */
  findings: number;
  /** Conteo de acciones del plan de acción (sin contenido). */
  actionItems: number;
}

/**
 * Indicadores agregados del dashboard real (AUDIT-5).
 *
 * Fuente: DashboardService.getCompanyStats (conteos reales scoped por companyId).
 * Sin PII: solo agregados numéricos.
 */
export interface CompanyAIContextIndicators {
  employees: number;
  incidents: number;
  trainings: number;
  /** Cumplimiento 0-100 derivado de respuestas de evaluación (dashboard). */
  compliance: number;
  /** Riesgos con nivel ≥ 12 (críticos). */
  highRisks: number;
}

/**
 * Resumen de accidentalidad (AUDIT-5).
 *
 * Fuente: IncidentsService.findAll (scoped por companyId). SOLO agregados y
 * metadatos no sensibles: nunca employeeId, nombre de empleado ni descripción.
 */
export interface CompanyAIContextIncidents {
  total: number;
  /** Incidentes con estado distinto de 'Cerrado' (sin depender del casing). */
  open: number;
  /** Conteos agregados por severidad. */
  severitySummary: { severity: string; count: number }[];
  /** Incidentes recientes (limitados): tipo, severidad, fecha y estado. */
  recent: { type: string; severity: string; date: string | null; status: string }[];
}

/**
 * Resumen de ausentismo (AUDIT-5).
 *
 * Fuente: AbsenteeismService.getCompanyStats + findAllByCompany (scoped por
 * companyId). Sin PII: nunca userId, descripción ni soporte.
 */
export interface CompanyAIContextAbsenteeism {
  total: number;
  totalDaysLost: number;
  averageDays: number;
  /** Conteos por tipo (ENFERMEDAD / ACCIDENTE / PERMISO). */
  causes: { type: string; count: number }[];
  /** Registros recientes (limitados): tipo, fecha de inicio y días. */
  recent: { type: string; startDate: string | null; days: number }[];
}

/**
 * Resumen de programas / capacitaciones (AUDIT-5).
 *
 * Fuente: TrainingsService.findAll (scoped por companyId). Sin PII: no se
 * incluyen instructores ni listas de asistencia.
 */
export interface CompanyAIContextPrograms {
  total: number;
  /** Capacitaciones con algún control de asistencia registrado (URL). */
  withAttendanceControl: number;
  /** Capacitaciones recientes (limitadas): tema y fecha. */
  recent: { topic: string; date: string | null }[];
}

/**
 * Resumen de inspecciones / auditorías (AUDIT-5).
 *
 * Fuente: InspectionsService.findAll (scoped por companyId). Sin PII: títulos
 * y estados, sin responsables ni notas internas.
 */
export interface CompanyAIContextAudits {
  total: number;
  /** Actividades con status 'pendiente'. */
  pending: number;
  /** Actividades con status distinto de 'pendiente' o fecha de cierre. */
  completed: number;
  /** Actividades recientes (limitadas): título, estado y fecha planificada. */
  recent: { title: string; status: string; plannedDate: string | null }[];
}

/**
 * Contexto operativo central de una empresa para los Engines IA y el futuro Copiloto.
 *
 * Se construye con datos REALES del sistema (sin información ficticia) y queda
 * preparado para que cualquier engine o el Copiloto lo consuman sin volver a
 * consultar MongoDB.
 *
 * AUDIT-5: se agregaron las secciones de autoevaluación, indicadores,
 * accidentalidad, ausentismo, programas y auditorías/inspecciones reutilizando
 * los services reales (nunca duplicando su lógica). Los dominios EPP y
 * emergencias NO tienen módulo propio seguro en el backend: se documentan como
 * NO DISPONIBLES (ver informe AUDIT-5) y no se inventan agregados.
 */
export interface CompanyAIContext {
  company: CompanyAIContextCompany;
  compliance: CompanyAIContextCompliance;
  /** Análisis PHVA real (reutiliza PhvaAnalysisResult del módulo phva). */
  phva: PhvaAnalysisResult;
  documents: CompanyAIContextDocuments;
  activities: CompanyAIContextActivities;
  /** Estado real de la Capacitación COPASST (1.1.7), reutilizando el dominio. */
  copasstTraining: CompanyAIContextCopasstTraining;
  /** Estado real del Comité de Convivencia Laboral (1.1.8), reutilizando el dominio. */
  convivencia: CompanyAIContextConvivencia;
  /** Evaluación inicial / autoevaluación real (AUDIT-5). */
  initialEvaluation: CompanyAIContextInitialEvaluation;
  /** Indicadores agregados del dashboard real (AUDIT-5). */
  indicators: CompanyAIContextIndicators;
  /** Resumen de accidentalidad real (AUDIT-5). */
  incidents: CompanyAIContextIncidents;
  /** Resumen de ausentismo real (AUDIT-5). */
  absenteeism: CompanyAIContextAbsenteeism;
  /** Resumen de programas / capacitaciones real (AUDIT-5). */
  programs: CompanyAIContextPrograms;
  /** Resumen de inspecciones / auditorías real (AUDIT-5). */
  audits: CompanyAIContextAudits;
}
