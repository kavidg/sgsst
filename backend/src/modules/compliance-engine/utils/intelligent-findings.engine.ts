import { ComplianceOverviewDto } from '../dto/compliance-overview.dto';
import { FindingCategory } from '../enums/finding-category.enum';
import { FindingPriority } from '../enums/finding-priority.enum';
import { FindingSeverity } from '../enums/finding-severity.enum';
import { FindingSource } from '../enums/finding-source.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { IntelligentFinding } from '../interfaces/intelligent-finding.interface';
import { identifyWeakestPhases } from './compliance-calculator';
import { PHASE_LABELS } from './executive-summary';

// ---------------------------------------------------------------------------
// Umbrales configurables de cada regla de detección.
// ---------------------------------------------------------------------------

/** Cumplimiento documental mínimo aceptable. */
const DOCUMENTATION_THRESHOLD = 80;

/** Ejecución mínima aceptable del programa de capacitación. */
const TRAINING_THRESHOLD = 70;

/** Porcentaje mínimo de riesgos bajo control. */
const RISK_THRESHOLD = 75;

/** Ejecución mínima aceptable del plan anual (actividades pendientes elevadas). */
const ANNUAL_PLAN_THRESHOLD = 70;

/** Cumplimiento mínimo aceptable de la matriz legal. */
const LEGAL_THRESHOLD = 80;

/** Cantidad máxima de incidentes abiertos antes de generar un hallazgo operacional. */
const OPEN_INCIDENTS_THRESHOLD = 3;

/** Cantidad máxima de alertas críticas antes de generar un hallazgo crítico. */
const CRITICAL_ALERTS_THRESHOLD = 3;

/** Cumplimiento mínimo aceptable por fase PHVA. */
const PHASE_THRESHOLD = 80;

const SEVERITY_TO_PRIORITY: Record<FindingSeverity, FindingPriority> = {
  [FindingSeverity.LOW]: FindingPriority.LOW,
  [FindingSeverity.MEDIUM]: FindingPriority.MEDIUM,
  [FindingSeverity.HIGH]: FindingPriority.HIGH,
  [FindingSeverity.CRITICAL]: FindingPriority.CRITICAL,
};

/**
 * Genera hallazgos inteligentes por reglas a partir del ComplianceOverviewDto.
 *
 * No consulta bases de datos ni recalcula cumplimiento: trabaja únicamente con
 * la información ya agregada por ComplianceEngineService. Los hallazgos se
 * generan con createdAutomatically = true y se fusionan con los existentes.
 */
export function generateIntelligentFindings(
  overview: ComplianceOverviewDto,
): IntelligentFinding[] {
  const findings: IntelligentFinding[] = [];

  const addFinding = (params: {
    title: string;
    description: string;
    severity: FindingSeverity;
    category: FindingCategory;
    sourceModule: FindingSource;
    affectedPhase: CompliancePhaseKey | null;
    recommendedAction: string;
    estimatedImpact: string;
  }): void => {
    findings.push({
      id: `intelligent-${findings.length + 1}`,
      title: params.title,
      description: params.description,
      severity: params.severity,
      category: params.category,
      sourceModule: params.sourceModule,
      affectedPhase: params.affectedPhase,
      recommendedAction: params.recommendedAction,
      estimatedImpact: params.estimatedImpact,
      priority: SEVERITY_TO_PRIORITY[params.severity],
      createdAutomatically: true,
    });
  };

  const modulePercentage = (module: string): number | undefined =>
    overview.moduleCompliance.find((m) => m.module === module)?.compliance;

  // --- DOCUMENTACIÓN: cumplimiento documental < 80% ----------------------
  const documentation = modulePercentage(FindingSource.DOCUMENTS);
  if (documentation !== undefined && documentation < DOCUMENTATION_THRESHOLD) {
    addFinding({
      title: 'Cumplimiento documental insuficiente',
      description: `El cumplimiento documental es del ${documentation}%, inferior al umbral recomendado del ${DOCUMENTATION_THRESHOLD}%.`,
      severity: severityForPercentage(documentation),
      category: FindingCategory.DOCUMENTATION,
      sourceModule: FindingSource.DOCUMENTS,
      affectedPhase: 'check',
      recommendedAction:
        'Actualizar, aprobar y mantener vigente la documentación obligatoria del SG-SST.',
      estimatedImpact:
        'Riesgo de incumplimiento de requisitos documentales en auditorías y supervisiones.',
    });
  }

  // --- CAPACITACIONES: capacitación < 70% ---------------------------------
  const trainings = modulePercentage(FindingSource.TRAININGS);
  if (trainings !== undefined && trainings < TRAINING_THRESHOLD) {
    addFinding({
      title: 'Programa de capacitación con baja ejecución',
      description: `La ejecución del programa de capacitación es del ${trainings}%, inferior al umbral del ${TRAINING_THRESHOLD}%.`,
      severity: severityForPercentage(trainings),
      category: FindingCategory.TRAINING,
      sourceModule: FindingSource.TRAININGS,
      affectedPhase: 'do',
      recommendedAction: 'Fortalecer el programa anual de capacitación y cerrar las brechas de competencias.',
      estimatedImpact: 'Personal sin las competencias necesarias para controlar los peligros laborales.',
    });
  }

  // --- RIESGOS: riesgos bajo control < 75% --------------------------------
  const risks = modulePercentage(FindingSource.RISKS);
  if (risks !== undefined && risks < RISK_THRESHOLD) {
    addFinding({
      title: 'Gestión del riesgo insuficiente',
      description: `El ${risks}% de los riesgos se encuentra bajo control, inferior al umbral del ${RISK_THRESHOLD}%.`,
      severity: severityForPercentage(risks),
      category: FindingCategory.RISK_MANAGEMENT,
      sourceModule: FindingSource.RISKS,
      affectedPhase: 'do',
      recommendedAction: 'Intervenir los riesgos de nivel alto y reforzar las medidas de control.',
      estimatedImpact: 'Exposición a incidentes y enfermedades laborales por controles insuficientes.',
    });
  }

  // --- PLAN ANUAL: actividades pendientes elevadas -------------------------
  // Nota: si no existe plan vigente, el provider reporta 0/NO_DATA; una
  // ejecución de 0% también se considera una brecha de ejecución del plan.
  const annualPlan = modulePercentage(FindingSource.ANNUAL_WORK_PLAN);
  if (annualPlan !== undefined && annualPlan < ANNUAL_PLAN_THRESHOLD) {
    addFinding({
      title: 'Plan anual con ejecución deficiente',
      description: `La ejecución del plan anual de trabajo es del ${annualPlan}%, con un nivel elevado de actividades pendientes o vencidas.`,
      severity: severityForPercentage(annualPlan),
      category: FindingCategory.EXECUTION,
      sourceModule: FindingSource.ANNUAL_WORK_PLAN,
      affectedPhase: 'act',
      recommendedAction: 'Priorizar el cierre de las actividades pendientes y vencidas del plan anual.',
      estimatedImpact: 'Desfase en la implementación de las actividades programadas del SG-SST.',
    });
  }

  // --- MATRIZ LEGAL: cumplimiento legal < 80% ------------------------------
  // Nota: sin matriz legal registrada, el provider reporta 0/NO_DATA, que se
  // interpreta como una brecha legal sin cerrar.
  const legal = modulePercentage(FindingSource.LEGAL_MATRIX);
  if (legal !== undefined && legal < LEGAL_THRESHOLD) {
    addFinding({
      title: 'Cumplimiento legal insuficiente',
      description: `El cumplimiento de la matriz legal es del ${legal}%, inferior al umbral recomendado del ${LEGAL_THRESHOLD}%.`,
      severity: severityForPercentage(legal),
      category: FindingCategory.LEGAL,
      sourceModule: FindingSource.LEGAL_MATRIX,
      affectedPhase: 'act',
      recommendedAction: 'Cerrar las brechas legales y resolver los requisitos en estado de no cumplimiento.',
      estimatedImpact: 'Exposición a sanciones y multas por incumplimiento de la normativa vigente.',
    });
  }

  // --- INCIDENTES: abiertos por encima del umbral ---------------------------
  const openIncidents = overview.findings.filter((finding) => finding.module === FindingSource.INCIDENTS).length;
  if (openIncidents > OPEN_INCIDENTS_THRESHOLD) {
    addFinding({
      title: 'Volumen elevado de incidentes abiertos',
      description: `Existen ${openIncidents} incidentes abiertos, por encima del umbral configurado de ${OPEN_INCIDENTS_THRESHOLD}.`,
      severity: severityForCount(openIncidents),
      category: FindingCategory.OPERATIONAL,
      sourceModule: FindingSource.INCIDENTS,
      affectedPhase: 'do',
      recommendedAction: 'Gestionar y cerrar los incidentes abiertos y verificar sus planes de acción.',
      estimatedImpact: 'Acumulación de incidentes sin gestión que puede derivar en eventos graves.',
    });
  }

  // --- ALERTAS: más de 3 alertas críticas ----------------------------------
  // ComplianceAlertDto.severity está tipado como FindingPriority.
  const criticalAlerts = overview.alerts.filter(
    (alert) =>
      alert.severity === FindingPriority.CRITICAL || alert.severity === FindingPriority.HIGH,
  ).length;
  if (criticalAlerts > CRITICAL_ALERTS_THRESHOLD) {
    addFinding({
      title: 'Alertas críticas acumuladas',
      description: `Existen ${criticalAlerts} alertas de severidad crítica sin resolver, por encima del umbral de ${CRITICAL_ALERTS_THRESHOLD}.`,
      severity: severityForCount(criticalAlerts),
      category: FindingCategory.CRITICAL,
      sourceModule: FindingSource.ALERTS,
      affectedPhase: 'check',
      recommendedAction: 'Atender de inmediato las alertas críticas y verificar su resolución.',
      estimatedImpact: 'Situaciones de alto riesgo sin atención que requieren acción inmediata.',
    });
  }

  // --- FASES PHVA: fases con cumplimiento < 80% ----------------------------
  // Reutiliza identifyWeakestPhases (compliance-calculator) para detectar las
  // fases por debajo del umbral, evitando lógica duplicada.
  for (const phase of identifyWeakestPhases(overview.phaseCompliance, PHASE_THRESHOLD)) {
    const percentage = overview.phaseCompliance[phase];
    addFinding({
      title: `Fase ${PHASE_LABELS[phase]} por debajo del umbral`,
      description: `El cumplimiento de la fase ${PHASE_LABELS[phase]} es del ${percentage}%, inferior al umbral recomendado del ${PHASE_THRESHOLD}%.`,
      severity: severityForPercentage(percentage),
      category: FindingCategory.PHASE,
      sourceModule: FindingSource.PHVA,
      affectedPhase: phase,
      recommendedAction: `Reforzar las actividades de la fase ${PHASE_LABELS[phase]} del ciclo PHVA.`,
      estimatedImpact: `Debilidad en la fase ${PHASE_LABELS[phase]} que compromete la efectividad del SG-SST.`,
    });
  }

  return findings;
}

/**
 * Deriva la severidad de un hallazgo a partir del porcentaje de cumplimiento.
 */
function severityForPercentage(percentage: number): FindingSeverity {
  if (percentage < 40) {
    return FindingSeverity.CRITICAL;
  }
  if (percentage < 60) {
    return FindingSeverity.HIGH;
  }
  return FindingSeverity.MEDIUM;
}

/**
 * Deriva la severidad de un hallazgo a partir de una cantidad de ítems.
 */
function severityForCount(count: number): FindingSeverity {
  if (count >= 10) {
    return FindingSeverity.CRITICAL;
  }
  if (count >= 5) {
    return FindingSeverity.HIGH;
  }
  return FindingSeverity.MEDIUM;
}
