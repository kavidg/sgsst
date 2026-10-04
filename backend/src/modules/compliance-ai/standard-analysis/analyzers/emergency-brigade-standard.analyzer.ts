import {
  StandardAnalyzer,
  StandardAnalysisContext,
  StandardAnalysisInterpretation,
  StandardAnalysisMetrics,
  StandardAnalysisKeyIssue,
  IssuePriority,
} from '../../dto/standard-analysis.dto';

/**
 * Analyzer narrativo del estándar 5.1.2 — Brigada de emergencia (HACER).
 *
 * REEMPLAZA como capa de IA al RecordsDocStandardAnalyzer (wrong-mapping:
 * narraba registros genéricos de DocumentMaster, no brigadas). El analyzer
 * records-doc se conserva en analyzers/ SIN registro, siguiendo el precedente
 * de procedures-doc (5.1.1); NO se reasigna automáticamente.
 *
 * FUENTE DE DATOS: metadata oficial que el EmergencyBrigadeProvider (módulo
 * `emergency-brigade`, fórmula `dimensions:v1`) transporta en el
 * ModuleCompliance del ComplianceEngine (dimensiones/counters/details +
 * findings oficiales). El analyzer NO recalcula cumplimiento y NO consulta
 * Mongo: es la capa de INTERPRETACIÓN. El porcentaje oficial proviene
 * exclusivamente del engine (emergency-brigade-scoring.ts).
 *
 * FRONTERA 5.1.1: simulacros, equipos, recursos, rutas, puntos de encuentro,
 * contactos y plan de emergencias NO se convierten en findings ni
 * recomendaciones de 5.1.2; pertenecen al análisis de 5.1.1.
 *
 * Employee.status: si aparece en metadata es SOLO contexto descriptivo
 * (employeeStatusContext); nunca altera cobertura, capacitación ni score.
 *
 * Diseño tolerante: si la metadata no está presente (respuesta parcial o
 * providers legacy), degrada a un análisis genérico por findings sin
 * inventar datos.
 */

/** Dimensión de la metadata del provider (formula dimensions:v1). */
interface BrigadeDimensionMeta {
  ratio?: number | null;
  numerator?: number | null;
  denominator?: number | null;
  [key: string]: unknown;
}

/** Forma de la metadata del EmergencyBrigadeProvider (lectura tolerante). */
interface EmergencyBrigadeProviderMetadata {
  formula?: string;
  standardCode?: string;
  noData?: boolean;
  allBrigadesInactive?: boolean;
  dimensions?: {
    existence?: BrigadeDimensionMeta;
    composition?: BrigadeDimensionMeta;
    functionalCoverage?: BrigadeDimensionMeta;
    training?: BrigadeDimensionMeta;
    alternates?: BrigadeDimensionMeta;
    traceability?: BrigadeDimensionMeta;
    operation?: BrigadeDimensionMeta;
  };
  counters?: {
    brigadesPresent?: number;
    activeBrigades?: number;
    brigadesNamed?: number;
    activeMembers?: number;
    validMembers?: number;
    duplicateEmployees?: number;
    leaders?: number;
    evacuationMembers?: number;
    firstAidMembers?: number;
    firefightingMembers?: number;
    communicationMembers?: number;
    logisticsMembers?: number;
    otherMembers?: number;
    alternates?: number;
    trainedMembers?: number;
    trainedWithEvidence?: number;
    membersWithoutTraining?: number;
    membersWithFutureTrainingDate?: number;
    membersWithoutEmployee?: number;
    membersWithInvalidFunction?: number;
    coreFunctionsWithAlternate?: number;
    evacuationAlternates?: number;
    firstAidAlternates?: number;
    firefightingAlternates?: number;
    traceableMembers?: number;
    lastMeetingDatePresent?: number;
    lastMeetingDateFuture?: number;
  };
  details?: {
    functionalCoverage?: { leaderPresent?: boolean; missingCoreFunctions?: string[] };
    training?: { activeTitularMembers?: number; futureTrainingDates?: number };
    operation?: { latestMeetingDate?: string | null; futureMeetingDates?: number };
  };
}

/** Etiquetas legibles de las funciones núcleo oficiales del estándar 5.1.2. */
const CORE_FUNCTION_LABELS: Record<string, string> = {
  EVACUATION: 'evacuación',
  FIRST_AID: 'primeros auxilios',
  FIREFIGHTING: 'contra incendios',
};

export class EmergencyBrigadeStandardAnalyzer implements StandardAnalyzer {
  private static readonly STANDARD_CODE = '5.1.2';
  private static readonly MODULE = 'emergency-brigade';

  supports(code: string): boolean {
    return code === EmergencyBrigadeStandardAnalyzer.STANDARD_CODE;
  }

  getModule(): string {
    return EmergencyBrigadeStandardAnalyzer.MODULE;
  }

  analyze(ctx: StandardAnalysisContext): StandardAnalysisInterpretation {
    const { moduleCompliance, findings } = ctx;
    const pct = moduleCompliance.compliance;
    const meta = (moduleCompliance.metadata ?? {}) as EmergencyBrigadeProviderMetadata;

    // NO_DATA del engine (fuente única del estado sin datos): el finding
    // oficial `emergency-brigade-no-data` cubre el registro inexistente y
    // `emergency-brigade-no-active-brigade` la variante "brigadas existentes
    // pero ninguna activa" (ambas con status NO_DATA del provider). Se narra
    // sin inventar incumplimientos adicionales y con recomendaciones de
    // creación/activación.
    const noDataFinding = findings.some(
      (f) => f.id === 'emergency-brigade-no-data' || f.id === 'emergency-brigade-no-active-brigade',
    );
    if (noDataFinding || meta.noData === true) {
      const allInactive = meta.allBrigadesInactive === true || findings.some((f) => f.id === 'emergency-brigade-no-active-brigade');
      return {
        summary: allInactive
          ? 'Existen brigadas de emergencia registradas pero ninguna está activa: no hay una brigada evaluable para el estándar 5.1.2.'
          : 'No existe una brigada de emergencia activa evaluable para el estándar 5.1.2.',
        keyIssues: [],
        quickWins: [allInactive
          ? 'Active la brigada de emergencia vigente (o cree una nueva) en /emergencies → Brigadas.'
          : 'Cree y active la brigada de emergencia en /emergencies → Brigadas.'],
        nextSteps: [
          allInactive
            ? 'Active la brigada registrada y asígnele un nombre identificable.'
            : 'Cree la brigada de emergencia y asígnele un nombre identificable.',
          'Inicie la conformación registrando integrantes tipados desde el módulo de empleados.',
          'Estructure las funciones requeridas: líder, evacuación, primeros auxilios y contra incendios.',
        ],
      };
    }

    const keyIssues: StandardAnalysisKeyIssue[] = [];
    const dims = meta.dimensions ?? {};
    const counters = meta.counters ?? {};
    const details = meta.details ?? {};

    // ── NO MEMBERS (brigada activa sin integrantes) ──
    const activeMembers = typeof counters.activeMembers === 'number' ? counters.activeMembers : null;
    if (activeMembers === 0) {
      keyIssues.push({
        id: 'emergency-brigade-no-members',
        title: 'Brigada activa sin brigadistas registrados',
        priority: 'HIGH',
        impact: 'La brigada activa no tiene integrantes tipados; no existe capacidad operativa de respuesta.',
        recommendation: 'Agregue brigadistas desde el módulo de empleados en /emergencies → Brigadas.',
      });
    }

    // ── COMPOSICIÓN E INTEGRIDAD ──
    const composition = dims.composition ?? {};
    if (activeMembers !== null && activeMembers > 0 && composition.ratio != null && composition.ratio < 1) {
      keyIssues.push({
        id: 'emergency-brigade-invalid-members',
        title: 'Brigadistas con integridad incompleta',
        priority: (counters.validMembers ?? 0) === 0 ? 'HIGH' : 'MEDIUM',
        impact: `De ${activeMembers} integrante(s) activo(s), solo ${counters.validMembers ?? 0} cumplen las condiciones estructurales (employeeId válido y función válida).`,
        recommendation: 'Complete los datos estructurales de los brigadistas: employeeId, función del enum y observaciones para OTHER.',
      });
    }
    if ((counters.duplicateEmployees ?? 0) > 0) {
      keyIssues.push({
        id: 'emergency-brigade-duplicates',
        title: 'Brigadistas duplicados en la brigada',
        priority: 'LOW',
        impact: `Se detectan ${counters.duplicateEmployees} empleado(s) registrado(s) más de una vez en la misma brigada; los duplicados no representan capacidad adicional.`,
        recommendation: 'Depure los registros duplicados para que la brigada refleje su composición real.',
      });
    }

    // ── COBERTURA FUNCIONAL (líder + funciones núcleo con titular) ──
    const functional = dims.functionalCoverage ?? {};
    const leaderPresent = details.functionalCoverage?.leaderPresent ?? (functional.leaderCoverage === 1);
    if (leaderPresent === false) {
      keyIssues.push({
        id: 'emergency-brigade-no-leader',
        title: 'Brigada sin líder identificado',
        priority: 'HIGH',
        impact: 'No se identifica una persona con función de liderazgo estructurada (LEADER) en la brigada evaluada; la autoridad de la brigada se define por la función tipada, no por campos de texto libres.',
        recommendation: 'Asigne a un brigadista titular activo la función LEADER en /emergencies → Brigadas.',
      });
    }
    const missingCore = details.functionalCoverage?.missingCoreFunctions
      ?? (Array.isArray(functional.missingCoreFunctions) ? functional.missingCoreFunctions : []);
    if (Array.isArray(missingCore) && missingCore.length > 0) {
      const labels = missingCore.map((fn) => CORE_FUNCTION_LABELS[fn] ?? fn).join(', ');
      keyIssues.push({
        id: 'emergency-brigade-core-functions-incomplete',
        title: 'Cobertura funcional núcleo incompleta',
        priority: missingCore.length >= 3 ? 'HIGH' : 'MEDIUM',
        impact: `Las funciones núcleo no están completamente cubiertas por titulares activos. Falta cobertura de: ${labels}. Un alterno no sustituye al titular.`,
        recommendation: 'Asigne titulares activos para las funciones núcleo pendientes (evacuación, primeros auxilios y contra incendios).',
      });
    }

    // ── CAPACITACIÓN ──
    const training = dims.training ?? {};
    if (training.ratio != null && training.ratio < 1) {
      const sinCapacitar = counters.membersWithoutTraining ?? 0;
      const futuras = counters.membersWithFutureTrainingDate ?? details.training?.futureTrainingDates ?? 0;
      keyIssues.push({
        id: 'emergency-brigade-training-incomplete',
        title: 'Capacitación de brigadistas incompleta',
        priority: training.ratio === 0 ? 'HIGH' : 'MEDIUM',
        impact: `Existen integrantes titulares sin capacitación registrada válida según la evidencia que utiliza el provider${sinCapacitar > 0 ? ` (${sinCapacitar} titular(es) sin fecha de capacitación)` : ''}${futuras > 0 ? `; ${futuras} fecha(s) de capacitación son futuras y no acreditan formación` : ''}.`,
        recommendation: 'Registre la capacitación de los brigadistas titulares con fecha válida (no futura) en /emergencies → Brigadas.',
      });
    }
    if (training.ratio != null && training.ratio < 1 && (counters.trainedWithEvidence ?? 0) < (counters.trainedMembers ?? 0)) {
      keyIssues.push({
        id: 'emergency-brigade-training-evidence-missing',
        title: 'Capacitaciones sin evidencia asociada',
        priority: 'MEDIUM',
        impact: `Hay ${counters.trainedMembers ?? 0} brigadista(s) con capacitación registrada pero solo ${counters.trainedWithEvidence ?? 0} cuentan con evidencia asociada.`,
        recommendation: 'Adjunte la evidencia de capacitación (trainingEvidence) de cada brigadista capacitado.',
      });
    }

    // ── COBERTURA DE ALTERNOS (redundancia operacional) ──
    const alternates = dims.alternates ?? {};
    if (alternates.ratio != null && alternates.ratio < 1) {
      keyIssues.push({
        id: 'emergency-brigade-alternates-incomplete',
        title: 'Cobertura de alternos incompleta',
        priority: alternates.ratio === 0 ? 'MEDIUM' : 'LOW',
        impact: `Las funciones núcleo no cuentan todas con integrante alterno activo (redundancia operacional): ${counters.coreFunctionsWithAlternate ?? 0} de 3 cubiertas.`,
        recommendation: 'Designe al menos un alterno activo por cada función núcleo (evacuación, primeros auxilios y contra incendios).',
      });
    }

    // ── OPERACIÓN (reuniones de brigada) ──
    const operation = dims.operation ?? {};
    if (operation.ratio != null && operation.ratio < 1) {
      const futuras = details.operation?.futureMeetingDates ?? counters.lastMeetingDateFuture ?? 0;
      keyIssues.push({
        id: 'emergency-brigade-meeting-overdue',
        title: 'Reunión de operación de brigada sin registro vigente',
        priority: 'MEDIUM',
        impact: `La señal operativa de reunión de brigada (lastMeetingDate) está ausente o no es válida según las reglas oficiales del provider${futuras > 0 ? ` (${futuras} fecha(s) futura(s) no acreditan operación)` : ''}.`,
        recommendation: 'Registre la última reunión de operación de la brigada con fecha válida y no futura en /emergencies → Brigadas.',
      });
    }

    // ── TRAZABILIDAD / CALIDAD DE REGISTRO ──
    const traceability = dims.traceability ?? {};
    if (activeMembers !== null && activeMembers > 0 && traceability.ratio != null && traceability.ratio < 1) {
      keyIssues.push({
        id: 'emergency-brigade-integrity',
        title: 'Calidad de registro de la brigada mejorable',
        priority: 'LOW',
        impact: 'Existen integrantes con datos de registro incompletos o inconsistentes (sin snapshot de nombre, función OTHER sin observaciones o duplicados). La trazabilidad exige employeeId válido, snapshot y función documentada.',
        recommendation: 'Complete el snapshot de nombre y las observaciones de los brigadistas para mejorar la trazabilidad del registro.',
      });
    }

    // Prioridad: HIGH primero; máximo 5 issues (contrato de la respuesta).
    const priorityWeight: Record<IssuePriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    keyIssues.sort((a, b) => priorityWeight[a.priority] - priorityWeight[b.priority]);
    const topIssues = keyIssues.slice(0, 5);

    const highCount = keyIssues.filter((i) => i.priority === 'HIGH').length;
    const allBrigadesInactive = meta.allBrigadesInactive === true;
    const summary = pct >= 90
      ? `La brigada de emergencia registra ${pct}% de cumplimiento.${highCount > 0 ? ` Persisten ${highCount} brecha(s) de alta prioridad.` : ''}`
      : pct >= 50
        ? `La brigada de emergencia avanza al ${pct}% pero mantiene brechas de conformación (${highCount} de alta prioridad).${allBrigadesInactive ? ' Se identifican brigadas registradas actualmente inactivas.' : ''}`
        : `La conformación de la brigada de emergencia requiere atención prioritaria (${pct}% de cumplimiento, ${highCount} brecha(s) de alta prioridad).${allBrigadesInactive ? ' Se identifican brigadas registradas actualmente inactivas.' : ''}`;

    return {
      summary,
      keyIssues: topIssues,
      quickWins: topIssues.slice(0, 3).map((i) => i.recommendation),
      nextSteps: topIssues.slice(0, 3).map((i) => i.recommendation),
    };
  }

  getMetrics(ctx: StandardAnalysisContext): StandardAnalysisMetrics {
    const meta = (ctx.moduleCompliance.metadata ?? {}) as EmergencyBrigadeProviderMetadata;
    const counters = meta.counters ?? {};
    const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    const bool = (v: unknown): number => (v === true ? 1 : 0);
    return {
      compliancePercentage: ctx.moduleCompliance.compliance,
      // Explicación de los counters oficiales del provider (sin re-cálculo):
      brigadesPresent: num(counters.brigadesPresent),
      activeBrigades: num(counters.activeBrigades),
      brigadesNamed: num(counters.brigadesNamed),
      activeMembers: num(counters.activeMembers),
      validMembers: num(counters.validMembers),
      duplicateEmployees: num(counters.duplicateEmployees),
      leaders: num(counters.leaders),
      evacuationMembers: num(counters.evacuationMembers),
      firstAidMembers: num(counters.firstAidMembers),
      firefightingMembers: num(counters.firefightingMembers),
      communicationMembers: num(counters.communicationMembers),
      logisticsMembers: num(counters.logisticsMembers),
      alternates: num(counters.alternates),
      trainedMembers: num(counters.trainedMembers),
      trainedWithEvidence: num(counters.trainedWithEvidence),
      membersWithoutTraining: num(counters.membersWithoutTraining),
      membersWithFutureTrainingDate: num(counters.membersWithFutureTrainingDate),
      coreFunctionsWithAlternate: num(counters.coreFunctionsWithAlternate),
      evacuationAlternates: num(counters.evacuationAlternates),
      firstAidAlternates: num(counters.firstAidAlternates),
      firefightingAlternates: num(counters.firefightingAlternates),
      traceableMembers: num(counters.traceableMembers),
      lastMeetingDatePresent: num(counters.lastMeetingDatePresent),
    };
  }
}
