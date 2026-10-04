/**
 * Núcleo PURO de scoring del estándar 5.1.2 — Brigada de prevención,
 * preparación y respuesta ante emergencias (HACER).
 *
 * Sin Mongo/Mongoose/servicios/HTTP: recibe únicamente datos serializables y
 * devuelve un breakdown completo (dimensions/counters/details/findings).
 * Patrón: emergency-plan-scoring.ts (5.1.1).
 *
 * DECISIONES FUNCIONALES CERRADAS (auditoría 5.1.2):
 *  - Fuente oficial: SstEmergencies.brigades[].typedMembers[]. NO se usan
 *    Brigade.leader (texto libre) ni Brigade.members[] (legacy textual) ni
 *    Training/AWP/COPASST/DocumentMaster.
 *  - Autoridad de liderazgo: typedMembers.function === 'LEADER'.
 *  - Sin proporción brigadistas/trabajadores (no hay dato estructurado).
 *  - `active` = estado lógico del registro, NO disponibilidad laboral; la
 *    redundancia operacional se mide con la dimensión de alternos.
 *  - Capacitación: trainingDate (no futura) + trainingEvidence; trainingType
 *    es metadata. No se inventa vigencia.
 *  - Employee.status NO filtra scoring (string libre sin política cerrada);
 *    la pertenencia al tenant del employeeId SÍ se valida vía
 *    employeeIdsInTenant (resuelto bulk por el provider).
 *  - Duplicados: el mismo employeeId repetido en la misma brigada NO genera
 *    puntos (duplicateEmployees como incidencia de integridad).
 *  - OTHER: válido solo con observations no vacías; nunca función núcleo.
 *  - SIN redistribución de pesos: una dimensión sin evidencia representa
 *    incumplimiento (no desaparece del cálculo) para evitar gaming por
 *    ausencia de datos.
 */

export const EMERGENCY_BRIGADE_MODULE = 'emergency-brigade';
export const EMERGENCY_BRIGADE_STANDARD_CODE = '5.1.2';
export const EMERGENCY_BRIGADE_FORMULA = 'dimensions:v1';

/**
 * Pesos DEFINITIVOS (suman exactamente 100). La propuesta original sumaba 105
 * (15+20+25+20+15+5+5); la intención relativa se preserva reduciendo
 * EXISTENCIA de 15 a 10: registrar una brigada es el piso mínimo y no debe
 * pesar más que la calidad estructural de la brigada misma.
 */
export const EMERGENCY_BRIGADE_SCORE_WEIGHTS = {
  existence: 10,
  composition: 20,
  functionalCoverage: 25,
  training: 20,
  alternates: 15,
  traceability: 5,
  operation: 5,
} as const;

/** Funciones núcleo operativas (cobertura mínima estructural). */
export const CORE_FUNCTIONS: readonly string[] = ['EVACUATION', 'FIRST_AID', 'FIREFIGHTING'];
/** Funciones válidas del enum del schema (EmergencyBrigadeFunction). */
export const BRIGADE_FUNCTIONS: readonly string[] = [
  'LEADER', 'EVACUATION', 'FIRST_AID', 'FIREFIGHTING', 'COMMUNICATION', 'LOGISTICS', 'OTHER',
];

// ── Entrada (serializable; sin tipos de Mongoose) ──

export interface BrigadeMemberLike {
  memberId?: string;
  employeeId?: unknown;
  employeeNameSnapshot?: string;
  function?: string;
  isAlternate?: boolean;
  active?: boolean;
  trainingDate?: Date | string;
  trainingType?: string;
  trainingEvidence?: string;
  observations?: string;
}

export interface BrigadeLike {
  brigadeId?: string;
  name?: string;
  type?: string;
  leader?: string;
  /** LEGACY textual: NUNCA aporta score. */
  members?: string[];
  typedMembers?: BrigadeMemberLike[];
  meetingFrequency?: string;
  lastMeetingDate?: Date | string;
  active?: boolean;
}

export interface EmergencyBrigadeScoreInput {
  /** Brigadas del documento SstEmergencias de la empresa (serializadas). */
  brigades: BrigadeLike[];
  /**
   * employeeId (hex) que pertenecen al tenant autenticado, resueltos en BULK
   * por el provider. Un employeeId fuera de este conjunto NO es evidencia
   * válida (integridad/tenant). Lista serializable: la función arma su Set.
   */
  employeeIdsInTenant: string[];
  /** Instante de evaluación (fechas futuras = inválidas; inyectable en tests). */
  now?: Date;
}

// ── Estructura de salida ──

export interface BrigadeDimensionDetail {
  ratio: number | null;
  numerator: number | null;
  denominator: number | null;
  [key: string]: unknown;
}

export interface BrigadeFindingDraft {
  id: string;
  title: string;
  description: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface EmergencyBrigadeScoreBreakdown {
  percentage: number;
  noData: boolean;
  /** true si existen brigadas pero todas están desactivadas. */
  allBrigadesInactive: boolean;
  dimensions: {
    existence: BrigadeDimensionDetail;
    composition: BrigadeDimensionDetail;
    functionalCoverage: BrigadeDimensionDetail;
    training: BrigadeDimensionDetail;
    alternates: BrigadeDimensionDetail;
    traceability: BrigadeDimensionDetail;
    operation: BrigadeDimensionDetail;
  };
  counters: {
    brigadesPresent: number;
    activeBrigades: number;
    brigadesNamed: number;
    activeMembers: number;
    validMembers: number;
    duplicateEmployees: number;
    leaders: number;
    evacuationMembers: number;
    firstAidMembers: number;
    firefightingMembers: number;
    communicationMembers: number;
    logisticsMembers: number;
    otherMembers: number;
    alternates: number;
    trainedMembers: number;
    trainedWithEvidence: number;
    membersWithoutTraining: number;
    membersWithFutureTrainingDate: number;
    membersWithoutEmployee: number;
    membersWithInvalidFunction: number;
    coreFunctionsWithAlternate: number;
    evacuationAlternates: number;
    firstAidAlternates: number;
    firefightingAlternates: number;
    traceableMembers: number;
    lastMeetingDatePresent: number;
    lastMeetingDateFuture: number;
  };
  details: {
    existence: { activeBrigades: number; namedBrigades: number; allBrigadesInactive: boolean };
    composition: { invalidMembers: number; duplicateEmployees: number };
    functionalCoverage: { leaderPresent: boolean; coreFunctionsWithTitular: string[]; missingCoreFunctions: string[] };
    training: { activeTitularMembers: number; futureTrainingDates: number; trainingTypeDocumented: number };
    alternates: { coreFunctionsWithAlternate: string[] };
    traceability: { missingSnapshot: number; otherWithoutObservations: number };
    operation: { latestMeetingDate: string | null; futureMeetingDates: number; meetingFrequency: string[] };
  };
  findings: BrigadeFindingDraft[];
}

// ── Helpers puros ──

function truthyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function asDate(value: Date | string | undefined): Date | null {
  if (value === undefined || value === null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Normaliza employeeId (ObjectId | string) a clave hex comparable. */
function employeeKey(employeeId: unknown): string | null {
  if (employeeId === undefined || employeeId === null || employeeId === '') return null;
  const key = typeof employeeId === 'string' ? employeeId.trim() : String(employeeId);
  return key.length > 0 ? key : null;
}

/**
 * Calcula el score de 5.1.2. Función PURA (determinista, sin efectos).
 * Sin redistribución: ratio null nunca ocurre aquí (las dimensiones sin
 * evidencia puntúan 0 = incumplimiento).
 */
export function computeEmergencyBrigadeScore(
  input: EmergencyBrigadeScoreInput,
  now: Date = new Date(),
): EmergencyBrigadeScoreBreakdown {
  const evaluationNow = input.now ?? now;
  const brigades = input.brigades ?? [];
  const tenantEmployees = new Set(input.employeeIdsInTenant ?? []);

  const activeBrigades = brigades.filter((b) => Boolean(b) && b.active !== false);
  const namedBrigades = activeBrigades.filter((b) => truthyText(b.name));
  const allBrigadesInactive = brigades.length > 0 && activeBrigades.length === 0;

  // ── Recolección DEDUPLICADA de miembros activos de brigadas activas ──
  // La deduplicación es POR BRIGADA: el mismo Employee puede pertenecer a
  // varias brigadas (legítimo) pero no inflar una misma brigada.
  const duplicateEmployees: string[] = [];
  interface CollectedMember {
    member: BrigadeMemberLike;
    brigade: BrigadeLike;
    employeeKey: string | null;
    employeeInTenant: boolean;
    functionValid: boolean;
    functionValue: string;
  }
  const collected: CollectedMember[] = [];

  for (const brigade of activeBrigades) {
    const seen = new Set<string>();
    const typedMembers = Array.isArray(brigade.typedMembers) ? brigade.typedMembers : [];
    for (const member of typedMembers) {
      if (!member || member.active === false) continue;
      const key = employeeKey(member.employeeId);
      if (key !== null) {
        if (seen.has(key)) {
          duplicateEmployees.push(key);
          continue; // el duplicado NO infling ninguna métrica
        }
        seen.add(key);
      }
      const functionValue = typeof member.function === 'string' ? member.function : '';
      collected.push({
        member,
        brigade,
        employeeKey: key,
        employeeInTenant: key !== null && tenantEmployees.has(key),
        functionValid: BRIGADE_FUNCTIONS.includes(functionValue),
        functionValue,
      });
    }
  }

  const activeMembers = collected.length;
  const validMembers = collected.filter(
    (c) => c.employeeKey !== null && c.employeeInTenant && c.functionValid &&
      (c.functionValue !== 'OTHER' || truthyText(c.member.observations)),
  );

  const countBy = (fn: string) => validMembers.filter((c) => c.functionValue === fn).length;
  const titulars = validMembers.filter((c) => c.member.isAlternate !== true);
  const alternatesCollected = validMembers.filter((c) => c.member.isAlternate === true);

  const hasTitularFor = (fn: string) => titulars.some((c) => c.functionValue === fn);
  const hasAlternateFor = (fn: string) => alternatesCollected.some((c) => c.functionValue === fn);

  // ── Dimensión EXISTENCIA Y ACTIVACIÓN (10) ──
  const existenceRatio = namedBrigades.length > 0 ? 1 : 0;
  const existence: BrigadeDimensionDetail = {
    ratio: existenceRatio, numerator: existenceRatio, denominator: 1,
    activeBrigades: activeBrigades.length, namedBrigades: namedBrigades.length, allBrigadesInactive,
  };

  // ── Dimensión COMPOSICIÓN E INTEGRIDAD (20) ──
  const membersWithoutEmployee = collected.filter((c) => c.employeeKey === null).length;
  const crossTenantMembers = collected.filter((c) => c.employeeKey !== null && !c.employeeInTenant).length;
  const membersWithInvalidFunction = collected.filter((c) => !c.functionValid).length;
  const otherWithoutObservations = collected.filter(
    (c) => c.functionValue === 'OTHER' && !truthyText(c.member.observations),
  ).length;
  const compositionRatio = activeMembers > 0 ? validMembers.length / activeMembers : 0;
  const composition: BrigadeDimensionDetail = {
    ratio: compositionRatio,
    numerator: activeMembers > 0 ? validMembers.length : null,
    denominator: activeMembers > 0 ? activeMembers : null,
    activeMembers, validMembers: validMembers.length,
    membersWithoutEmployee, crossTenantMembers, membersWithInvalidFunction, otherWithoutObservations,
    duplicateEmployees: duplicateEmployees.length,
  };

  // ── Dimensión COBERTURA FUNCIONAL (25): (core + líder) / 2 ──
  const coreFunctionsWithTitular = CORE_FUNCTIONS.filter((fn) => hasTitularFor(fn));
  const missingCoreFunctions = CORE_FUNCTIONS.filter((fn) => !coreFunctionsWithTitular.includes(fn));
  const leaderPresent = hasTitularFor('LEADER');
  const coreCoverage = coreFunctionsWithTitular.length / CORE_FUNCTIONS.length;
  const leaderCoverage = leaderPresent ? 1 : 0;
  const functionalRatio = (coreCoverage + leaderCoverage) / 2;
  const functionalCoverage: BrigadeDimensionDetail = {
    ratio: functionalRatio,
    numerator: coreFunctionsWithTitular.length + (leaderPresent ? 1 : 0),
    denominator: CORE_FUNCTIONS.length + 1,
    coreCoverage, leaderCoverage, leaderPresent,
    coreFunctionsWithTitular: [...coreFunctionsWithTitular],
    missingCoreFunctions: [...missingCoreFunctions],
    // COMMUNICATION/LOGISTICS son metadata: no compensan ausencias del núcleo.
    communicationMembers: countBy('COMMUNICATION'),
    logisticsMembers: countBy('LOGISTICS'),
  };

  // ── Dimensión CAPACITACIÓN (20): (trained + evidence) / 2 sobre titulares ──
  const futureTrainingDates = titulars.filter((c) => {
    const d = asDate(c.member.trainingDate);
    return d !== null && d.getTime() > evaluationNow.getTime();
  }).length;
  const trainedTitulars = titulars.filter((c) => {
    const d = asDate(c.member.trainingDate);
    return d !== null && d.getTime() <= evaluationNow.getTime();
  });
  const trainedWithEvidence = trainedTitulars.filter((c) => truthyText(c.member.trainingEvidence)).length;
  const activeTitularMembers = titulars.length;
  const trainedRatio = activeTitularMembers > 0 ? trainedTitulars.length / activeTitularMembers : 0;
  const evidenceRatio = activeTitularMembers > 0 ? trainedWithEvidence / activeTitularMembers : 0;
  const trainingRatio = (trainedRatio + evidenceRatio) / 2;
  const training: BrigadeDimensionDetail = {
    ratio: trainingRatio,
    numerator: trainedTitulars.length + trainedWithEvidence,
    denominator: activeTitularMembers * 2,
    trainedRatio, evidenceRatio, activeTitularMembers,
    trainedMembers: trainedTitulars.length, trainedWithEvidence,
    futureTrainingDates,
    trainingTypeDocumented: titulars.filter((c) => truthyText(c.member.trainingType)).length,
  };

  // ── Dimensión COBERTURA DE ALTERNOS (15): funciones núcleo con alterno / 3 ──
  const coreFunctionsWithAlternate = CORE_FUNCTIONS.filter((fn) => hasAlternateFor(fn));
  const alternatesRatio = coreFunctionsWithAlternate.length / CORE_FUNCTIONS.length;
  const alternates: BrigadeDimensionDetail = {
    ratio: alternatesRatio,
    numerator: coreFunctionsWithAlternate.length,
    denominator: CORE_FUNCTIONS.length,
    alternates: alternatesCollected.length,
    coreFunctionsWithAlternate: [...coreFunctionsWithAlternate],
    evacuationAlternates: hasAlternateFor('EVACUATION') ? 1 : 0,
    firstAidAlternates: hasAlternateFor('FIRST_AID') ? 1 : 0,
    firefightingAlternates: hasAlternateFor('FIREFIGHTING') ? 1 : 0,
  };

  // ── Dimensión TRAZABILIDAD / CALIDAD DE REGISTRO (5) ──
  // Calidad de registro, NO un segundo castigo de capacitación: un miembro es
  // trazable con employeeId+tenant, snapshot y función válida (OTHER con
  // observations). La falta de trainingDate NO reduce esta dimensión.
  const missingSnapshot = collected.filter((c) => !truthyText(c.member.employeeNameSnapshot)).length;
  const traceableMembers = validMembers.filter(
    (c) => truthyText(c.member.employeeNameSnapshot),
  ).length;
  const traceabilityRatio = activeMembers > 0 ? traceableMembers / activeMembers : 0;
  const traceability: BrigadeDimensionDetail = {
    ratio: traceabilityRatio,
    numerator: activeMembers > 0 ? traceableMembers : null,
    denominator: activeMembers > 0 ? activeMembers : null,
    missingSnapshot, otherWithoutObservations,
    duplicateEmployees: duplicateEmployees.length,
  };

  // ── Dimensión REUNIONES / OPERACIÓN (5) ──
  // Brigada activa más recientemente operativa (último lastMeetingDate válido).
  const meetingDates = activeBrigades
    .map((b) => ({ brigade: b, date: asDate(b.lastMeetingDate) }))
    .filter((x): x is { brigade: BrigadeLike; date: Date } => x.date !== null);
  const futureMeetingDates = meetingDates.filter((x) => x.date.getTime() > evaluationNow.getTime()).length;
  const latest = meetingDates
    .filter((x) => x.date.getTime() <= evaluationNow.getTime())
    .sort((a, b) => b.date.getTime() - a.date.getTime())[0];
  const operationRatio = latest ? 1 : 0;
  const operation: BrigadeDimensionDetail = {
    ratio: operationRatio, numerator: operationRatio, denominator: 1,
    latestMeetingDate: latest ? latest.date.toISOString() : null,
    futureMeetingDates,
    meetingFrequency: activeBrigades.map((b) => b.meetingFrequency).filter(truthyText),
  };

  const w = EMERGENCY_BRIGADE_SCORE_WEIGHTS;
  const weighted =
    existenceRatio * w.existence +
    compositionRatio * w.composition +
    functionalRatio * w.functionalCoverage +
    trainingRatio * w.training +
    alternatesRatio * w.alternates +
    traceabilityRatio * w.traceability +
    operationRatio * w.operation;

  const safePercentage = Number.isFinite(weighted)
    ? Math.min(100, Math.max(0, Math.round(weighted)))
    : 0;

  // ── NO_DATA ──
  // Caso 1/2: sin brigadas registradas o con todas desactivadas → NO_DATA.
  // Caso 3/4/5: brigada activa (aun sin miembros o incompleta) → score real.
  const noData = activeBrigades.length === 0;

  // ── Findings oficiales (sin findings de equipos/simulacros/plan: 5.1.1) ──
  const findings: BrigadeFindingDraft[] = [];
  if (brigades.length === 0) {
    findings.push({
      id: 'emergency-brigade-no-data',
      title: 'Sin brigada de emergencia registrada',
      description: 'No existe ninguna brigada de emergencia. El estándar 5.1.2 requiere brigada conformada y entrenada. Cree la brigada en /emergencies → Brigadas.',
      priority: 'HIGH',
    });
  } else if (allBrigadesInactive) {
    findings.push({
      id: 'emergency-brigade-no-active-brigade',
      title: 'Brigadas existentes pero ninguna activa',
      description: `Existen ${brigades.length} brigada(s) registrada(s) pero todas están desactivadas. Active una brigada en /emergencies → Brigadas o cree la vigente.`,
      priority: 'HIGH',
    });
  } else {
    if (activeMembers === 0) {
      findings.push({
        id: 'emergency-brigade-no-members',
        title: 'Brigada activa sin brigadistas',
        description: 'La brigada activa no tiene miembros tipados registrados. Agregue brigadistas desde el módulo de empleados en /emergencies → Brigadas.',
        priority: 'HIGH',
      });
    } else {
      if (compositionRatio < 1) {
        findings.push({
          id: 'emergency-brigade-invalid-members',
          title: `${activeMembers - validMembers.length} brigadista(s) con integridad incompleta`,
          description: `Miembros activos inválidos: ${membersWithoutEmployee} sin employeeId, ${crossTenantMembers} fuera del tenant, ${membersWithInvalidFunction} con función inválida, ${otherWithoutObservations} OTHER sin observaciones.`,
          priority: validMembers.length === 0 ? 'HIGH' : 'MEDIUM',
        });
      }
      if (duplicateEmployees.length > 0) {
        findings.push({
          id: 'emergency-brigade-duplicates',
          title: `${duplicateEmployees.length} brigadista(s) duplicado(s)`,
          description: 'El mismo empleado está registrado más de una vez en la misma brigada; los duplicados no generan puntos.',
          priority: 'LOW',
        });
      }
      if (!leaderPresent) {
        findings.push({
          id: 'emergency-brigade-no-leader',
          title: 'Brigada sin líder (LEADER)',
          description: 'No existe ningún brigadista titular activo con función LEADER. La autoridad de la brigada se define por typedMembers.function, no por el campo de texto leader.',
          priority: 'HIGH',
        });
      }
      if (missingCoreFunctions.length > 0) {
        findings.push({
          id: 'emergency-brigade-core-functions-incomplete',
          title: `Funciones núcleo sin titular: ${missingCoreFunctions.join(', ')}`,
          description: 'La cobertura estructural exige LEADER más titulares activos para EVACUATION, FIRST_AID y FIREFIGHTING. Un alterno no sustituye al titular.',
          priority: 'HIGH',
        });
      }
      if (activeTitularMembers > 0 && trainedTitulars.length < activeTitularMembers) {
        findings.push({
          id: 'emergency-brigade-training-incomplete',
          title: `${activeTitularMembers - trainedTitulars.length} titular(es) sin capacitación vigente`,
          description: `La capacitación exige trainingDate válida (no futura) por titular${futureTrainingDates > 0 ? `; ${futureTrainingDates} fecha(s) de capacitación son futuras y no cuentan` : ''}.`,
          priority: trainedTitulars.length === 0 ? 'HIGH' : 'MEDIUM',
        });
      }
      if (activeTitularMembers > 0 && trainedWithEvidence < trainedTitulars.length) {
        findings.push({
          id: 'emergency-brigade-training-evidence-missing',
          title: `${trainedTitulars.length - trainedWithEvidence} capacitación(es) sin evidencia`,
          description: 'Los brigadistas capacitados deben contar con trainingEvidence registrada.',
          priority: 'MEDIUM',
        });
      }
      if (coreFunctionsWithAlternate.length < CORE_FUNCTIONS.length) {
        const missingAlt = CORE_FUNCTIONS.filter((fn) => !coreFunctionsWithAlternate.includes(fn));
        findings.push({
          id: 'emergency-brigade-alternates-incomplete',
          title: `Funciones núcleo sin alterno: ${missingAlt.join(', ')}`,
          description: 'La redundancia operacional exige al menos un alterno activo por función núcleo (EVACUATION, FIRST_AID, FIREFIGHTING).',
          priority: coreFunctionsWithAlternate.length === 0 ? 'MEDIUM' : 'LOW',
        });
      }
      if (!latest) {
        findings.push({
          id: 'emergency-brigade-meeting-overdue',
          title: futureMeetingDates > 0 ? 'Reunión de brigada con fecha futura' : 'Brigada sin reunión registrada',
          description: 'La brigada activa no tiene lastMeetingDate válida y no futura. Registre la última reunión de operación en /emergencies → Brigadas.',
          priority: 'MEDIUM',
        });
      }
      if (traceabilityRatio < 1) {
        findings.push({
          id: 'emergency-brigade-integrity',
          title: 'Calidad de registro de brigada mejorable',
          description: `${missingSnapshot} miembro(s) sin snapshot de nombre, ${otherWithoutObservations} OTHER sin observaciones. La trazabilidad exige employeeId válido, snapshot y función documentada.`,
          priority: 'LOW',
        });
      }
    }
  }

  return {
    percentage: safePercentage,
    noData,
    allBrigadesInactive,
    dimensions: { existence, composition, functionalCoverage, training, alternates, traceability, operation },
    counters: {
      brigadesPresent: brigades.length,
      activeBrigades: activeBrigades.length,
      brigadesNamed: namedBrigades.length,
      activeMembers,
      validMembers: validMembers.length,
      duplicateEmployees: duplicateEmployees.length,
      leaders: countBy('LEADER'),
      evacuationMembers: countBy('EVACUATION'),
      firstAidMembers: countBy('FIRST_AID'),
      firefightingMembers: countBy('FIREFIGHTING'),
      communicationMembers: countBy('COMMUNICATION'),
      logisticsMembers: countBy('LOGISTICS'),
      otherMembers: countBy('OTHER'),
      alternates: alternatesCollected.length,
      trainedMembers: trainedTitulars.length,
      trainedWithEvidence,
      membersWithoutTraining: Math.max(0, activeTitularMembers - trainedTitulars.length),
      membersWithFutureTrainingDate: futureTrainingDates,
      membersWithoutEmployee,
      membersWithInvalidFunction,
      coreFunctionsWithAlternate: coreFunctionsWithAlternate.length,
      evacuationAlternates: hasAlternateFor('EVACUATION') ? 1 : 0,
      firstAidAlternates: hasAlternateFor('FIRST_AID') ? 1 : 0,
      firefightingAlternates: hasAlternateFor('FIREFIGHTING') ? 1 : 0,
      traceableMembers: traceableMembers,
      lastMeetingDatePresent: meetingDates.length,
      lastMeetingDateFuture: futureMeetingDates,
    },
    details: {
      existence: { activeBrigades: activeBrigades.length, namedBrigades: namedBrigades.length, allBrigadesInactive },
      composition: { invalidMembers: activeMembers - validMembers.length, duplicateEmployees: duplicateEmployees.length },
      functionalCoverage: { leaderPresent, coreFunctionsWithTitular: [...coreFunctionsWithTitular], missingCoreFunctions: [...missingCoreFunctions] },
      training: { activeTitularMembers, futureTrainingDates, trainingTypeDocumented: (training.trainingTypeDocumented as number) ?? 0 },
      alternates: { coreFunctionsWithAlternate: [...coreFunctionsWithAlternate] },
      traceability: { missingSnapshot, otherWithoutObservations },
      operation: { latestMeetingDate: (operation.latestMeetingDate as string | null) ?? null, futureMeetingDates, meetingFrequency: (operation.meetingFrequency as string[]) ?? [] },
    },
    findings,
  };
}
