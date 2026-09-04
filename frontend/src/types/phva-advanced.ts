// ============================================================
// PHVA Advanced Types — FASE 1 (2.2.1 Objetivos SST, 1.2.3 EPP, 1.1.10 Emergencias)
// ============================================================

// ==================== 2.2.1 OBJETIVOS SST ====================

export type SstObjectiveStatus = 'PENDIENTE' | 'EN_PROGRESO' | 'COMPLETADO' | 'RETRASADO';
export type SstObjectiveMeasurementMethod = 'MANUAL' | 'AUTOMATIC' | 'NONE';

export interface SstObjectiveActivity {
  activityId: string;
  name: string;
  description: string;
  status: string;
  tasks: SstObjectiveTask[];
}

export interface SstObjectiveTask {
  taskId: string;
  name: string;
  description: string;
  status: string;
  priority: string;
  responsible: string;
  dueDate?: string;
  completedDate?: string;
  subtasks: SstObjectiveSubtask[];
}

export interface SstObjectiveSubtask {
  subtaskId: string;
  name: string;
  status: string;
}

export interface SstObjectiveItem {
  objectiveId: string;
  name: string;
  description: string;
  standard?: string;
  responsible: string;
  status: SstObjectiveStatus;
  currentProgress: number;
  targetProgress: number;
  measurementMethod: SstObjectiveMeasurementMethod;
  currentValue?: number;
  targetValue?: number;
  indicator?: string;
  activities: SstObjectiveActivity[];
}

export interface SstObjectivesAdvancedModel {
  _id: string;
  companyId: string;
  itemCode: string;
  year: number;
  complianceStatus: string;
  complianceReason: string;
  objectives: SstObjectiveItem[];
  history: Array<{
    action: string;
    userId: string;
    userName: string;
    timestamp: string;
    details: string;
  }>;
}

// ==================== 1.2.3 EPP ====================

export type EppComplianceStatus = 'COMPLIES' | 'PENDING' | 'NON_COMPLIANT';
export type EppAssignmentStatus = 'ACTIVE' | 'EXPIRED' | 'RETURNED' | 'DAMAGED' | 'REPLACED';
export type EppCondition = 'GOOD' | 'FAIR' | 'POOR' | 'DAMAGED';

export interface EppCatalogItem {
  eppId: string;
  name: string;
  category: string;
  standard: string;
  requiredFor: string;
  expectedLifespanMonths: number;
  active: boolean;
}

export interface EppAssignment {
  assignmentId: string;
  employeeId: string;
  employeeName: string;
  eppItemId: string;
  eppName: string;
  deliveryDate: string;
  expectedReplacementDate?: string;
  actualReplacementDate?: string;
  condition: string;
  quantity: number;
  serialNumber: string;
  certificateUrl: string;
  deliveredBy: string;
  receivedBy: string;
  signatureUrl: string;
  status: string;
}

export interface EppInspection {
  inspectionId: string;
  date: string;
  inspector: string;
  area: string;
  findings: string;
  status: string;
  correctiveActions: string[];
  evidence: string[];
}

export interface SstEppAdvancedModel {
  _id: string;
  companyId: string;
  itemCode: string;
  year: number;
  complianceStatus: EppComplianceStatus;
  complianceReason: string;
  catalog: EppCatalogItem[];
  assignments: EppAssignment[];
  inspections: EppInspection[];
  history: Array<{
    action: string;
    userId: string;
    userName: string;
    timestamp: string;
    details: string;
  }>;
}

export interface EppCoverageModel {
  totalCatalog: number;
  totalAssignments: number;
  activeAssignments: number;
  coveragePercentage: number;
  pending: number;
}

// ==================== 1.1.10 EMERGENCIAS ====================

export type EmergenciesComplianceStatus = 'COMPLIES' | 'PENDING' | 'NON_COMPLIANT';

export interface EmergencyPlanModel {
  planName: string;
  version: string;
  effectiveDate?: string;
  expirationDate?: string;
  approvedBy: string;
  approvedAt?: string;
  documentUrl: string;
}

export interface EmergencyBrigadeModel {
  brigadeId: string;
  name: string;
  type: string;
  leader: string;
  members: string[];
  meetingFrequency: string;
  lastMeetingDate?: string;
}

export interface MeetingPointModel {
  pointId: string;
  name: string;
  location: string;
  capacity: number;
  coordinates: number[];
  active: boolean;
}

export interface EvacuationRouteModel {
  routeId: string;
  name: string;
  description: string;
  floor: string;
  diagramUrl: string;
  estimatedTimeMinutes: number;
  active: boolean;
}

export interface EmergencyEquipmentModel {
  equipmentId: string;
  name: string;
  type: string;
  location: string;
  quantity: number;
  lastInspectionDate?: string;
  nextInspectionDate?: string;
  status: string;
  certificateUrl: string;
}

export interface EmergencyDrillModel {
  drillId: string;
  name: string;
  type: string;
  date: string;
  participants: number;
  expectedParticipants: number;
  durationMinutes: number;
  results: string;
  findings: string;
  improvements: string;
  evidence: string[];
  status: string;
}

export interface SstEmergenciesAdvancedModel {
  _id: string;
  companyId: string;
  itemCode: string;
  year: number;
  complianceStatus: EmergenciesComplianceStatus;
  complianceReason: string;
  plan: EmergencyPlanModel;
  brigades: EmergencyBrigadeModel[];
  meetingPoints: MeetingPointModel[];
  evacuationRoutes: EvacuationRouteModel[];
  equipment: EmergencyEquipmentModel[];
  drills: EmergencyDrillModel[];
  history: Array<{
    action: string;
    userId: string;
    userName: string;
    timestamp: string;
    details: string;
  }>;
}
