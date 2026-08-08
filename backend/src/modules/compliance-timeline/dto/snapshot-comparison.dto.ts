import { CompliancePhaseKey } from '../../compliance-engine/interfaces/compliance-engine.interface';

/**
 * Diferencias entre dos snapshots de cumplimiento.
 * Únicamente se incluyen los campos que cambiaron.
 */
export class SnapshotComparisonDto {
  overall?: { from: number; to: number; variation: number | null };
  phaseCompliance?: Partial<Record<CompliancePhaseKey, { from: number; to: number }>>;
  moduleCompliance?: Array<{ module: string; from: number; to: number }>;
  findings?: { from: number; to: number };
  alerts?: { from: number; to: number };
  pendingActivities?: { from: number; to: number };
}
