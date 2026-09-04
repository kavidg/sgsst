/**
 * Tipos TypeScript para el módulo Worker Participation (4.1.2).
 * Coinciden exactamente con el schema del backend.
 */

export enum ParticipationActivityType {
  HAZARD_IDENTIFICATION = 'HAZARD_IDENTIFICATION',
  RISK_ASSESSMENT = 'RISK_ASSESSMENT',
  RISK_VALUATION = 'RISK_VALUATION',
  CONTROL_DECISION = 'CONTROL_DECISION',
  CONTROL_ESTABLISHMENT = 'CONTROL_ESTABLISHMENT',
  OTHER = 'OTHER',
}

export enum ParticipationStatus {
  DRAFT = 'DRAFT',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export interface WorkerParticipation {
  _id: string;
  companyId: string;
  activityType: ParticipationActivityType;
  participationDate: string;
  participants: string[];
  description: string;
  observations?: string;
  riskId?: string;
  process?: string;
  area?: string;
  activity?: string;
  status: ParticipationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkerParticipationPayload {
  activityType: ParticipationActivityType;
  participationDate: string;
  participants?: string[];
  description: string;
  observations?: string;
  riskId?: string;
  process?: string;
  area?: string;
  activity?: string;
  status?: ParticipationStatus;
}

export interface UpdateWorkerParticipationPayload {
  activityType?: ParticipationActivityType;
  participationDate?: string;
  participants?: string[];
  description?: string;
  observations?: string;
  riskId?: string;
  process?: string;
  area?: string;
  activity?: string;
  status?: ParticipationStatus;
}

/** Labels para activityTypes */
export const ACTIVITY_TYPE_LABELS: Record<ParticipationActivityType, string> = {
  [ParticipationActivityType.HAZARD_IDENTIFICATION]: 'Identificación de peligros',
  [ParticipationActivityType.RISK_ASSESSMENT]: 'Evaluación de riesgos',
  [ParticipationActivityType.RISK_VALUATION]: 'Valoración de riesgos',
  [ParticipationActivityType.CONTROL_DECISION]: 'Decisión sobre controles',
  [ParticipationActivityType.CONTROL_ESTABLISHMENT]: 'Establecimiento de controles',
  [ParticipationActivityType.OTHER]: 'Otra actividad',
};

/** Labels para estados */
export const STATUS_LABELS: Record<ParticipationStatus, string> = {
  [ParticipationStatus.DRAFT]: 'Borrador',
  [ParticipationStatus.COMPLETED]: 'Completada',
  [ParticipationStatus.CANCELLED]: 'Cancelada',
};

/** Clases CSS para badges de estado */
export const STATUS_CLASSES: Record<ParticipationStatus, string> = {
  [ParticipationStatus.DRAFT]: 'badge--warning',
  [ParticipationStatus.COMPLETED]: 'badge--success',
  [ParticipationStatus.CANCELLED]: 'badge--muted',
};
