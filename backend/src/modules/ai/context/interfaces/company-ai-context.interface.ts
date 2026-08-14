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
 * Contexto operativo central de una empresa para los Engines IA y el futuro Copiloto.
 *
 * Se construye con datos REALES del sistema (sin información ficticia) y queda
 * preparado para que cualquier engine o el Copiloto lo consuman sin volver a
 * consultar MongoDB.
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
}
