import { RecommendationDto } from '../dto/recommendation.dto';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { ProviderComplianceResult } from '../providers/compliance-provider.interface';

const TRAINING_THRESHOLD = 70;

/**
 * Genera recomendaciones mediante reglas deterministas.
 *
 * ÚNICA fuente de recomendaciones del Compliance Intelligence Engine.
 * No utiliza IA: cada recomendación se deriva de los resultados reales de los providers.
 */
export function generateRecommendations(results: ProviderComplianceResult[]): RecommendationDto[] {
  const recommendations: RecommendationDto[] = [];
  let sequence = 0;
  const now = new Date().toISOString();

  const push = (module: string, title: string, description: string, priority: FindingPriority, targetPhase: CompliancePhaseKey) => {
    sequence += 1;
    recommendations.push({
      id: `recommendation-${sequence}`,
      module,
      title,
      description,
      priority,
      targetPhase,
      createdAt: now,
    });
  };

  // Regla: capacitación < 70% → fortalecer el programa anual.
  const trainings = results.find((result) => result.module === 'trainings');
  if (trainings && trainings.percentage < TRAINING_THRESHOLD) {
    push(
      'trainings',
      'Fortalecer el programa anual de capacitación',
      `El cumplimiento del programa de capacitación es del ${trainings.percentage}%, por debajo del umbral recomendado del ${TRAINING_THRESHOLD}%.`,
      FindingPriority.MEDIUM,
      'do',
    );
  }

  // Regla: documentos vencidos → actualización documental.
  const documents = results.find((result) => result.module === 'documents');
  if (documents && documents.findings.some((finding) => finding.title.includes('Documento vencido'))) {
    const expiredCount = documents.findings.filter((finding) => finding.title.includes('Documento vencido')).length;
    push(
      'documents',
      'Actualizar la documentación vencida',
      `Existen ${expiredCount} documento(s) con fecha de vencimiento superada. Actualizar y aprobar la documentación.`,
      FindingPriority.HIGH,
      'check',
    );
  }

  // Regla: actividades vencidas → priorizar el plan anual.
  const annualPlan = results.find((result) => result.module === 'annual-work-plan');
  if (annualPlan && (annualPlan.overdue ?? 0) > 0) {
    push(
      'annual-work-plan',
      'Priorizar el plan anual de trabajo',
      `Existen ${annualPlan.overdue} tarea(s) vencidas en el plan anual de trabajo. Priorizar su cierre o justificación.`,
      FindingPriority.HIGH,
      'act',
    );
  }

  // Regla: alertas críticas → atención inmediata.
  const alerts = results.find((result) => result.module === 'alerts');
  if (alerts && alerts.findings.some((finding) => finding.priority === FindingPriority.CRITICAL)) {
    push(
      'alerts',
      'Atender las alertas críticas de inmediato',
      'Existen alertas de severidad alta sin resolver que requieren atención inmediata.',
      FindingPriority.CRITICAL,
      'check',
    );
  }

  // Regla: riesgos altos → fortalecer controles.
  const risks = results.find((result) => result.module === 'risks');
  if (risks && risks.findings.some((finding) => finding.priority === FindingPriority.CRITICAL || finding.priority === FindingPriority.HIGH)) {
    push(
      'risks',
      'Intervenir los riesgos de nivel alto',
      'Existen riesgos con nivel alto que requieren medidas de control y seguimiento.',
      FindingPriority.HIGH,
      'do',
    );
  }

  // Regla: requisitos legales sin cumplir → cerrar brechas legales.
  const legalMatrix = results.find((result) => result.module === 'legal-matrix');
  if (legalMatrix && legalMatrix.findings.length > 0) {
    push(
      'legal-matrix',
      'Cerrar brechas de la matriz legal',
      'Existen requisitos legales pendientes o sin cumplir en la matriz legal.',
      FindingPriority.HIGH,
      'act',
    );
  }

  return recommendations;
}
