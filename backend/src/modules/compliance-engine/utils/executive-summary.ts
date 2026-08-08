import { FindingDto } from '../dto/finding.dto';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey, PhaseCompliance } from '../interfaces/compliance-engine.interface';
import { ProviderComplianceResult } from '../providers/compliance-provider.interface';
import { identifyWeakestPhases } from './compliance-calculator';

export const PHASE_LABELS: Record<CompliancePhaseKey, string> = {
  plan: 'Planear',
  do: 'Hacer',
  check: 'Verificar',
  act: 'Actuar',
};

const WEAKNESS_THRESHOLD = 80;

/**
 * Genera un resumen ejecutivo mediante reglas deterministas.
 * No utiliza IA: combina el cumplimiento global, las fases más débiles,
 * los hallazgos críticos y las actividades vencidas.
 */
export function buildExecutiveSummary(params: {
  overallCompliance: number;
  phaseCompliance: PhaseCompliance;
  findings: FindingDto[];
  results: ProviderComplianceResult[];
}): string {
  const sentences: string[] = [];

  sentences.push(`El cumplimiento general es del ${Math.round(params.overallCompliance)}%.`);

  const weakest = identifyWeakestPhases(params.phaseCompliance, WEAKNESS_THRESHOLD);
  if (weakest.length > 0) {
    const labels = weakest.map((key) => PHASE_LABELS[key]);
    sentences.push(`Las principales oportunidades de mejora corresponden a ${labels.join(' y ')}.`);
  }

  const criticalFindings = params.findings.filter(
    (finding) => finding.priority === FindingPriority.CRITICAL,
  ).length;
  const overdue = params.results.reduce((sum, result) => sum + (result.overdue ?? 0), 0);

  const details: string[] = [];
  if (criticalFindings > 0) details.push(`${criticalFindings} hallazgo(s) crítico(s)`);
  if (overdue > 0) details.push(`${overdue} actividad(es) vencida(s)`);

  if (details.length > 0) {
    sentences.push(`Existen ${details.join(' y ')}.`);
  }

  return sentences.join(' ');
}
