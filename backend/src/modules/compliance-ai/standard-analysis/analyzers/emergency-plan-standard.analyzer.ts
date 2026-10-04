import {
  StandardAnalyzer,
  StandardAnalysisContext,
  StandardAnalysisInterpretation,
  StandardAnalysisMetrics,
  StandardAnalysisKeyIssue,
  IssuePriority,
} from '../../dto/standard-analysis.dto';

/**
 * Analyzer narrativo del estándar 5.1.1 — Plan de prevención, preparación y
 * respuesta ante emergencias (HACER).
 *
 * REEMPLAZA como capa de IA al ProceduresDocStandardAnalyzer (wrong-mapping:
 * narraba procedimientos genéricos de DocumentMaster, no emergencias). El
 * analyzer procedures-doc se conserva en analyzers/ SIN registro para una
 * futura reasignación o eliminación; NO se reasigna automáticamente.
 *
 * FUENTE DE DATOS: metadata oficial que el EmergencyPlanProvider (módulo
 * `emergency-plan`, fórmula `dimensions:v1`) transporta en el ModuleCompliance
 * del ComplianceEngine (dimensiones/counters/details + findings oficiales).
 * El analyzer NO recalcula cumplimiento y NO consulta Mongo: es la capa de
 * INTERPRETACIÓN. El porcentaje oficial proviene exclusivamente del engine
 * (emergency-plan-scoring.ts).
 *
 * FRONTERA 5.1.2: la brigada se menciona SOLO como contexto complementario
 * (counters.brigadesPresent); nunca es un indicador puntuable de 5.1.1 ni
 * genera key issues aquí. La puntuación de brigadas pertenece a 5.1.2.
 *
 * Diseño tolerante: si la metadata no está presente (p. ej. providers legacy
 * o respuesta parcial), degrada a un análisis genérico por findings sin
 * inventar datos.
 */

/** Dimensión de la metadata del provider (formula dimensions:v1). */
interface EmergencyPlanDimensionMeta {
  ratio?: number | null;
  numerator?: number | null;
  denominator?: number | null;
  [key: string]: unknown;
}

/** Forma de la metadata del EmergencyPlanProvider (lectura tolerante). */
interface EmergencyPlanProviderMetadata {
  formula?: string;
  dimensions?: {
    plan?: EmergencyPlanDimensionMeta;
    threats?: EmergencyPlanDimensionMeta;
    resources?: EmergencyPlanDimensionMeta;
    evacuation?: EmergencyPlanDimensionMeta;
    contacts?: EmergencyPlanDimensionMeta;
    drills?: EmergencyPlanDimensionMeta;
    socialization?: EmergencyPlanDimensionMeta;
  };
  counters?: {
    activeThreats?: number;
    completeThreats?: number;
    activeResources?: number;
    operativeResources?: number;
    partialResources?: number;
    inoperativeResources?: number;
    operativeRoutes?: number;
    operativeMeetingPoints?: number;
    requiredContacts?: number;
    validRequiredContacts?: number;
    complementaryContacts?: number;
    executedDrills12m?: number;
    expectedParticipants?: number;
    participants?: number;
    drillsLinkedToAnnualPlan?: number;
    socializationCoverage?: number;
    socializationEvidence?: number;
    documentPresent?: boolean;
    planApproved?: boolean;
    planCurrent?: boolean;
    brigadesPresent?: boolean;
  };
  details?: {
    threats?: { missingFields?: string[] };
    drills?: { evaluable?: number; avgCoverage?: number | null };
    socialization?: { dateValid?: boolean; coverageOk?: boolean; evidenceOk?: boolean };
  };
  noData?: boolean;
  emptyRecord?: boolean;
}

/** Etiquetas legibles de los grupos de contacto requeridos. */
const CONTACT_GROUP_LABELS: Record<string, string> = {
  ARL: 'ARL',
  BOMBEROS: 'Bomberos',
  AMBULANCIA: 'Ambulancia',
  POLICIA: 'Policía',
  HOSPITAL: 'Hospital o IPS',
  INTERNO: 'Contacto interno',
};

export class EmergencyPlanStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '5.1.1';
  private static readonly MODULE = 'emergency-plan';

  supports(code: string): boolean {
    return code === EmergencyPlanStandardAnalyzer.STANDARD_CODE;
  }

  getModule(): string {
    return EmergencyPlanStandardAnalyzer.MODULE;
  }

  analyze(ctx: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = ctx;
    const pct = moduleCompliance.compliance;
    const meta = (moduleCompliance.metadata ?? {}) as EmergencyPlanProviderMetadata;

    // NO_DATA del engine (fuente única del estado sin datos): el finding
    // oficial `emergency-plan-no-data` cubre registro inexistente Y vacío.
    if (findings.some((f) => f.id === 'emergency-plan-no-data')) {
      const empty = meta.emptyRecord === true;
      return {
        summary: empty
          ? 'El registro de emergencias existe pero está vacío: no hay plan, amenazas, recursos, rutas, puntos de encuentro, contactos ni simulacros registrados.'
          : 'No existe registro del plan de prevención, preparación y respuesta ante emergencias.',
        keyIssues: [],
        quickWins: ['Diligencie el plan de emergencias en /emergencies → Plan.'],
        nextSteps: [
          'Diligencie el plan de emergencias (identificación, objetivos, alcance y vigencia).',
          'Registre la matriz de amenazas y vulnerabilidades con su valoración de riesgo.',
          'Cargue recursos operativos, rutas, puntos de encuentro, contactos y socialización.',
        ],
      };
    }

    const keyIssues: StandardAnalysisKeyIssue[] = [];
    const dims = meta.dimensions ?? {};
    const counters = meta.counters ?? {};
    const details = meta.details ?? {};

    // ── PLAN ──
    const plan = dims.plan ?? {};
    if (plan.approved === false) {
      keyIssues.push({
        id: 'emergency-plan-not-approved',
        title: 'Plan de emergencias sin aprobación vigente',
        priority: 'HIGH',
        impact: 'Sin aprobación formal (SstEmergencies.complianceStatus ≠ COMPLIES) el plan no acredita respaldo directivo.',
        recommendation: 'Envíe el plan a aprobación desde /emergencies y complete el flujo de aprobación.',
      });
    }
    if (plan.validityValid === false) {
      keyIssues.push({
        id: 'emergency-plan-expired',
        title: 'Plan fuera de vigencia',
        priority: 'HIGH',
        impact: 'Las fechas de vigencia no cubren la fecha de evaluación; la versión del plan no está actualizada.',
        recommendation: 'Actualice la vigencia del plan (fechas de efectividad y expiración) en /emergencies → Plan.',
      });
    }
    if (plan.documentOk === false) {
      keyIssues.push({
        id: 'emergency-plan-document-missing',
        title: 'Sin documento oficial del plan',
        priority: 'MEDIUM',
        impact: 'No hay documento oficial asociado (DocumentMaster EMERGENCY_PLAN ni URL documental).',
        recommendation: 'Vincule el documento oficial EMERGENCY_PLAN desde /emergencies → Plan (selector de documentos).',
      });
    }

    // ── AMENAZAS Y VULNERABILIDADES ──
    const threats = dims.threats ?? {};
    if (threats.ratio == null) {
      keyIssues.push({
        id: 'emergency-threat-matrix-incomplete',
        title: 'Matriz de amenazas y vulnerabilidades vacía',
        priority: 'HIGH',
        impact: 'No hay amenazas activas evaluadas; no es posible acreditar la identificación de escenarios de emergencia.',
        recommendation: 'Registre y valore amenazas activas (escenario, amenaza, vulnerabilidad, probabilidad, impacto, riesgo y medidas) en /emergencies → Amenazas.',
      });
    } else if (threats.ratio < 1) {
      const missing = details.threats?.missingFields ?? [];
      keyIssues.push({
        id: 'emergency-threat-matrix-incomplete',
        title: 'Amenazas con valoración incompleta',
        priority: threats.ratio < 0.5 ? 'HIGH' : 'MEDIUM',
        impact: `Existen amenazas activas incompletas${missing.length > 0 ? ` (campos pendientes: ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? '…' : ''})` : ''}.`,
        recommendation: 'Complete scenario/threat/vulnerability, la valoración probabilidad-impacto-riesgo y al menos una medida (preventiva o de respuesta) por amenaza.',
      });
    }

    // ── RECURSOS OPERATIVOS ──
    const resources = dims.resources ?? {};
    if (resources.ratio == null) {
      keyIssues.push({
        id: 'emergency-resources-incomplete',
        title: 'Sin recursos de emergencia registrados',
        priority: 'MEDIUM',
        impact: 'No hay extintores, botiquines, camillas, alarmas ni kits registrados como preparación ante emergencias.',
        recommendation: 'Registre el inventario de recursos de emergencia en /emergencies → Recursos.',
      });
    } else if (resources.ratio < 1) {
      const inoperative = counters.inoperativeResources ?? 0;
      const partial = counters.partialResources ?? 0;
      keyIssues.push({
        id: 'emergency-resources-incomplete',
        title: 'Recursos de emergencia no completamente operativos',
        priority: resources.ratio < 0.5 ? 'HIGH' : 'MEDIUM',
        impact: `${inoperative} recurso(s) inoperativo(s) y ${partial} parcial(es) reducen la capacidad de respuesta.`,
        recommendation: 'Reponga o restablezca los recursos inoperativos/parciales registrados en /emergencies → Recursos (no sustituye el mantenimiento del estándar 4.2.5).',
      });
    }

    // ── EVACUACIÓN ──
    const evacuation = dims.evacuation ?? {};
    if (evacuation.ratio != null && evacuation.ratio < 1) {
      const routeOk = Number(evacuation.operativeRoutes ?? 0) > 0;
      const pointOk = Number(evacuation.operativeMeetingPoints ?? 0) > 0;
      keyIssues.push({
        id: 'emergency-evacuation-incomplete',
        title: evacuation.ratio === 0 ? 'Evacuación sin ruta ni punto de encuentro operativos' : 'Evacuación parcialmente operativa',
        priority: evacuation.ratio === 0 ? 'HIGH' : 'MEDIUM',
        impact: evacuation.ratio === 0
          ? 'No existe ruta de evacuación operativa ni punto de encuentro operativo.'
          : `Existe ${routeOk ? 'ruta operativa' : 'punto de encuentro operativo'} pero falta ${routeOk ? 'el punto de encuentro operativo' : 'la ruta de evacuación operativa'}.`,
        recommendation: routeOk
          ? 'Complete el punto de encuentro: responsable y procedimiento de conteo en /emergencies → Evacuación.'
          : 'Complete la ruta de evacuación: activa, tiempo estimado > 0 y responsable en /emergencies → Evacuación.',
      });
    }

    // ── CONTACTOS (cadena de llamadas) ──
    const contacts = dims.contacts ?? {};
    if (contacts.ratio != null && contacts.ratio < 1) {
      const missingGroups = (contacts.missingRequiredGroups as string[] | undefined) ?? [];
      const missingLabels = missingGroups.map((g) => CONTACT_GROUP_LABELS[g] ?? g).join(', ');
      keyIssues.push({
        id: 'emergency-contacts-incomplete',
        title: `Cadena de llamadas incompleta (${counters.validRequiredContacts ?? 0}/${counters.requiredContacts ?? 6})`,
        priority: contacts.ratio === 0 ? 'HIGH' : 'MEDIUM',
        impact: missingLabels.length > 0
          ? `Faltan contactos válidos (activos, con teléfono y orden ≥ 1) de: ${missingLabels}.`
          : 'Faltan contactos válidos de la cadena de llamadas de emergencia.',
        recommendation: `Registre los contactos faltantes (${missingLabels || 'cadena completa'}) con teléfono y orden de llamada en /emergencies → Contactos.`,
      });
    }

    // ── SIMULACROS ──
    const drills = dims.drills ?? {};
    const executedDrills12m = typeof counters.executedDrills12m === 'number' ? counters.executedDrills12m : 0;
    if (drills.ratio == null || (drills.ratio < 1 && executedDrills12m === 0)) {
      keyIssues.push({
        id: 'emergency-drill-missing',
        title: 'Sin simulacros ejecutados en los últimos 12 meses',
        priority: 'HIGH',
        impact: 'No hay simulacros en estado Ejecutado/Completado dentro de la ventana de 12 meses.',
        recommendation: 'Programe y ejecute un simulacro de emergencia; regístrelo en /emergencies → Simulacros (puede vincularlo a una actividad del Plan Anual).',
      });
    } else if (drills.ratio < 1) {
      const avg = details.drills?.avgCoverage;
      const participantsPart = typeof counters.expectedParticipants === 'number' && counters.expectedParticipants > 0
        ? ` (${counters.participants ?? 0}/${counters.expectedParticipants} participantes)`
        : '';
      keyIssues.push({
        id: 'emergency-drill-missing',
        title: 'Cobertura de participación en simulacros mejorable',
        priority: 'MEDIUM',
        impact: `Hay ${counters.executedDrills12m ?? 0} simulacro(s) ejecutado(s) en 12 meses${typeof avg === 'number' ? ` con cobertura promedio de ${Math.round(avg * 100)}%` : ''}${participantsPart}.`,
        recommendation: 'Aumente la cobertura de participación (participants/expectedParticipants) en el próximo simulacro y registre la evidencia.',
      });
    }

    // ── SOCIALIZACIÓN ──
    const socialization = dims.socialization ?? {};
    if (socialization.ratio == null) {
      keyIssues.push({
        id: 'emergency-socialization-missing',
        title: 'Socialización del plan no registrada',
        priority: 'MEDIUM',
        impact: 'No hay registro de socialización del plan (fecha, cobertura ni evidencia).',
        recommendation: 'Registre la socialización con fecha, cobertura ≥ 80% y al menos una evidencia en /emergencies → Plan (sección Socialización).',
      });
    } else if (socialization.ratio < 1) {
      const d = details.socialization ?? {};
      const pendiente = !d.dateValid
        ? 'fecha'
        : !d.coverageOk
          ? `cobertura ≥ 80% (actual: ${counters.socializationCoverage ?? 0}%)`
          : 'evidencia';
      keyIssues.push({
        id: 'emergency-socialization-missing',
        title: 'Socialización del plan incompleta',
        priority: 'MEDIUM',
        impact: `La socialización registrada no acredita ${pendiente}.`,
        recommendation: `Registre una socialización con fecha, cobertura ≥ 80% y al menos una evidencia en /emergencies → Plan (sección Socialización).`,
      });
    }

    // Prioridad: HIGH primero; máximo 5 issues (contrato de la respuesta).
    const priorityWeight: Record<IssuePriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    keyIssues.sort((a, b) => priorityWeight[a.priority] - priorityWeight[b.priority]);
    const topIssues = keyIssues.slice(0, 5);

    const highCount = keyIssues.filter((i) => i.priority === 'HIGH').length;
    const brigadeContext = counters.brigadesPresent === true
      ? ' La brigada de emergencia conformada se menciona solo como contexto: su puntuación corresponde al estándar 5.1.2.'
      : '';

    const summary = pct >= 90
      ? `El plan de prevención, preparación y respuesta ante emergencias registra ${pct}% de cumplimiento.${highCount > 0 ? ` Persisten ${highCount} brecha(s) de alta prioridad.` : ''}${brigadeContext}`
      : pct >= 50
        ? `El plan de emergencias avanza al ${pct}% pero mantiene brechas de preparación (${highCount} de alta prioridad).${brigadeContext}`
        : `La preparación ante emergencias requiere atención prioritaria (${pct}% de cumplimiento, ${highCount} brecha(s) de alta prioridad).${brigadeContext}`;

    return {
      summary,
      keyIssues: topIssues,
      quickWins: topIssues.slice(0, 3).map((i) => i.recommendation),
      nextSteps: topIssues.slice(0, 3).map((i) => i.recommendation),
    };
  }

  getMetrics(ctx: StandardAnalysisContext): StandardAnalysisMetrics {
    const meta = (ctx.moduleCompliance.metadata ?? {}) as EmergencyPlanProviderMetadata;
    const counters = meta.counters ?? {};
    const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    const bool = (v: unknown): number => (v === true ? 1 : 0);
    return {
      compliancePercentage: ctx.moduleCompliance.compliance,
      // Explicación de los counters oficiales del provider (sin re-cálculo):
      activeThreats: num(counters.activeThreats),
      completeThreats: num(counters.completeThreats),
      activeResources: num(counters.activeResources),
      operativeResources: num(counters.operativeResources),
      partialResources: num(counters.partialResources),
      inoperativeResources: num(counters.inoperativeResources),
      operativeRoutes: num(counters.operativeRoutes),
      operativeMeetingPoints: num(counters.operativeMeetingPoints),
      requiredContacts: num(counters.requiredContacts),
      validRequiredContacts: num(counters.validRequiredContacts),
      executedDrills12m: num(counters.executedDrills12m),
      expectedParticipants: num(counters.expectedParticipants),
      participants: num(counters.participants),
      drillsLinkedToAnnualPlan: num(counters.drillsLinkedToAnnualPlan),
      socializationCoverage: num(counters.socializationCoverage),
      socializationEvidence: num(counters.socializationEvidence),
      documentPresent: bool(counters.documentPresent),
      planApproved: bool(counters.planApproved),
      planCurrent: bool(counters.planCurrent),
    };
  }
}
