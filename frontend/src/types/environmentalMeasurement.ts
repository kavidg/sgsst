/**
 * Tipos TypeScript para el módulo Environmental Measurement (4.1.4).
 * Coinciden exactamente con el schema del backend.
 */

export enum MeasurementType {
  NOISE = 'NOISE',
  ILLUMINATION = 'ILLUMINATION',
  TEMPERATURE = 'TEMPERATURE',
  AIR_QUALITY = 'AIR_QUALITY',
  CHEMICAL_AGENTS = 'CHEMICAL_AGENTS',
  VIBRATION = 'VIBRATION',
  ERGONOMIC = 'ERGONOMIC',
  OTHER = 'OTHER',
}

export enum MeasurementStatus {
  COMPLETED = 'COMPLETED',
  PENDING = 'PENDING',
  CANCELLED = 'CANCELLED',
}

export enum ComplianceResult {
  WITHIN_LIMITS = 'WITHIN_LIMITS',
  EXCEEDS_LIMITS = 'EXCEEDS_LIMITS',
  INCONCLUSIVE = 'INCONCLUSIVE',
}

export interface EnvironmentalMeasurement {
  _id: string;
  companyId: string;
  measurementType: MeasurementType;
  description: string;
  area: string;
  measurementDate: string;
  responsible?: string;
  resultValue?: number;
  resultUnit?: string;
  regulatoryLimit?: number;
  regulatoryLimitUnit?: string;
  complianceResult?: ComplianceResult;
  methodInstrument?: string;
  observations?: string;
  riskId?: string;
  status: MeasurementStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEnvironmentalMeasurementPayload {
  measurementType: MeasurementType;
  description: string;
  area: string;
  measurementDate: string;
  responsible?: string;
  resultValue?: number;
  resultUnit?: string;
  regulatoryLimit?: number;
  regulatoryLimitUnit?: string;
  complianceResult?: ComplianceResult;
  methodInstrument?: string;
  observations?: string;
  riskId?: string;
  status?: MeasurementStatus;
}

export interface UpdateEnvironmentalMeasurementPayload {
  measurementType?: MeasurementType;
  description?: string;
  area?: string;
  measurementDate?: string;
  responsible?: string;
  resultValue?: number;
  resultUnit?: string;
  regulatoryLimit?: number;
  regulatoryLimitUnit?: string;
  complianceResult?: ComplianceResult;
  methodInstrument?: string;
  observations?: string;
  riskId?: string;
  status?: MeasurementStatus;
}

/** Labels para measurementType */
export const MEASUREMENT_TYPE_LABELS: Record<MeasurementType, string> = {
  [MeasurementType.NOISE]: 'Ruido',
  [MeasurementType.ILLUMINATION]: 'Iluminación',
  [MeasurementType.TEMPERATURE]: 'Temperatura',
  [MeasurementType.AIR_QUALITY]: 'Calidad del aire',
  [MeasurementType.CHEMICAL_AGENTS]: 'Agentes químicos',
  [MeasurementType.VIBRATION]: 'Vibración',
  [MeasurementType.ERGONOMIC]: 'Ergonomía',
  [MeasurementType.OTHER]: 'Otro',
};

/** Labels para complianceResult */
export const COMPLIANCE_RESULT_LABELS: Record<ComplianceResult, string> = {
  [ComplianceResult.WITHIN_LIMITS]: 'Dentro del límite',
  [ComplianceResult.EXCEEDS_LIMITS]: 'Excede el límite',
  [ComplianceResult.INCONCLUSIVE]: 'Inconcluso',
};

/** Clases CSS para badges de complianceResult */
export const COMPLIANCE_RESULT_CLASSES: Record<ComplianceResult, string> = {
  [ComplianceResult.WITHIN_LIMITS]: 'badge--success',
  [ComplianceResult.EXCEEDS_LIMITS]: 'badge--danger',
  [ComplianceResult.INCONCLUSIVE]: 'badge--warning',
};

/** Labels para status */
export const MEASUREMENT_STATUS_LABELS: Record<MeasurementStatus, string> = {
  [MeasurementStatus.COMPLETED]: 'Completada',
  [MeasurementStatus.PENDING]: 'Pendiente',
  [MeasurementStatus.CANCELLED]: 'Cancelada',
};

/** Clases CSS para badges de status */
export const MEASUREMENT_STATUS_CLASSES: Record<MeasurementStatus, string> = {
  [MeasurementStatus.COMPLETED]: 'badge--success',
  [MeasurementStatus.PENDING]: 'badge--warning',
  [MeasurementStatus.CANCELLED]: 'badge--muted',
};
