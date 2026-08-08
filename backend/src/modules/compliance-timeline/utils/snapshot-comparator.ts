import {
  CompliancePhaseKey,
  ModuleCompliance,
  PhaseCompliance,
} from '../../compliance-engine/interfaces/compliance-engine.interface';
import {
  ComplianceSnapshotData,
  SnapshotComparison,
} from '../interfaces/compliance-timeline.interface';
import { percentageVariation } from './variation';

const PHASE_KEYS: CompliancePhaseKey[] = ['plan', 'do', 'check', 'act'];

/**
 * Compara dos snapshots y devuelve únicamente las diferencias.
 *
 * Reglas:
 * - `overall` solo se incluye si el cumplimiento global cambió.
 * - `phaseCompliance` solo incluye las fases que cambiaron.
 * - `moduleCompliance` solo incluye los módulos cuyo cumplimiento cambió
 *   (unión de módulos presentes en cualquiera de los dos snapshots).
 * - Los conteos (findings, alerts, pendingActivities) solo se incluyen si difieren.
 *
 * @param a - Snapshot anterior (o base).
 * @param b - Snapshot posterior (o a comparar).
 */
export function compareSnapshots(
  a: ComplianceSnapshotData,
  b: ComplianceSnapshotData,
): SnapshotComparison {
  const comparison: SnapshotComparison = {};

  if (a.overallCompliance !== b.overallCompliance) {
    comparison.overall = {
      from: a.overallCompliance,
      to: b.overallCompliance,
      variation: percentageVariation(a.overallCompliance, b.overallCompliance),
    };
  }

  const phaseDifferences = comparePhases(a.phaseCompliance, b.phaseCompliance);
  if (phaseDifferences) {
    comparison.phaseCompliance = phaseDifferences;
  }

  const moduleDifferences = compareModules(a.moduleCompliance, b.moduleCompliance);
  if (moduleDifferences.length > 0) {
    comparison.moduleCompliance = moduleDifferences;
  }

  const findings = countDiff(a.findingsCount, b.findingsCount);
  if (findings) {
    comparison.findings = findings;
  }

  const alerts = countDiff(a.activeAlerts, b.activeAlerts);
  if (alerts) {
    comparison.alerts = alerts;
  }

  const pending = countDiff(a.pendingActivities, b.pendingActivities);
  if (pending) {
    comparison.pendingActivities = pending;
  }

  return comparison;
}

function comparePhases(
  a: PhaseCompliance,
  b: PhaseCompliance,
): SnapshotComparison['phaseCompliance'] | undefined {
  const differences: NonNullable<SnapshotComparison['phaseCompliance']> = {};
  let changed = false;

  for (const key of PHASE_KEYS) {
    if (a[key] !== b[key]) {
      differences[key] = { from: a[key], to: b[key] };
      changed = true;
    }
  }

  return changed ? differences : undefined;
}

function compareModules(
  a: ModuleCompliance[],
  b: ModuleCompliance[],
): NonNullable<SnapshotComparison['moduleCompliance']> {
  const complianceA = new Map(a.map((m) => [m.module, m.compliance]));
  const complianceB = new Map(b.map((m) => [m.module, m.compliance]));
  const modules = new Set([...complianceA.keys(), ...complianceB.keys()]);

  const differences: NonNullable<SnapshotComparison['moduleCompliance']> = [];
  for (const module of modules) {
    const from = complianceA.get(module);
    const to = complianceB.get(module);
    if (from !== to) {
      differences.push({ module, from: from ?? 0, to: to ?? 0 });
    }
  }

  return differences;
}

function countDiff(from: number, to: number): { from: number; to: number } | undefined {
  return from !== to ? { from, to } : undefined;
}
