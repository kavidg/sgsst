import { useCallback, useEffect, useState } from 'react';
import {
  fetchEmergenciesAdvanced,
  updateEmergenciesAdvanced,
  createEmergenciesThreat,
  updateEmergenciesThreat,
  deactivateEmergenciesThreat,
  createEmergenciesContact,
  updateEmergenciesContact,
  deactivateEmergenciesContact,
  createEmergenciesResource,
  updateEmergenciesResource,
  deactivateEmergenciesResource,
  createEmergenciesBrigade,
  updateEmergenciesBrigade,
  deactivateEmergenciesBrigade,
  createEmergenciesBrigadeMember,
  updateEmergenciesBrigadeMember,
  deactivateEmergenciesBrigadeMember,
  createEmergenciesRoute,
  updateEmergenciesRoute,
  deactivateEmergenciesRoute,
  createEmergenciesMeetingPoint,
  updateEmergenciesMeetingPoint,
  deactivateEmergenciesMeetingPoint,
  addEmergenciesEvacuationCount,
  createEmergenciesDrill,
  updateEmergenciesDrill,
  deactivateEmergenciesDrill,
  submitEmergenciesAdvanced,
  approveEmergenciesAdvanced,
  rejectEmergenciesAdvanced,
  fetchEmployees,
  fetchAnnualWorkPlanCurrent,
  fetchPlanActivities,
  fetchDocumentManagementList,
  type AnnualWorkPlanModel,
  type DocumentMasterItem,
  type EmployeeModel,
  type PlanActivityModel,
} from '../api';
import { useCompanyContext } from '../context/CompanyContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import {
  AdvancedPageLayout,
  AdvancedHeader,
  type HeaderAction,
  AdvancedKpiGrid,
  AdvancedSection,
  AdvancedTabsSidebar,
  AdvancedTabsContent,
  type SidebarTabItem,
} from '../components/advanced-layout';
import { getOverview } from '../services/compliance-dashboard.service';
import type {
  DashboardFinding,
  DashboardModuleCompliance,
} from '../types/compliance-dashboard';
import { ComplianceAIInsight } from '../components/ComplianceAIInsight';
import { EmergencyBrigadeComplianceSection } from '../components/emergency-brigade/EmergencyBrigadeComplianceSection';

// ============================================================
// TYPES — 5.1.1 Plan de prevención, preparación y respuesta ante
// emergencias (identidad canónica; legacy interno '1.1.10')
// ============================================================

type Probability = 'LOW' | 'MEDIUM' | 'HIGH';
type Impact = 'LOW' | 'MEDIUM' | 'HIGH';
type ContactType = 'ARL' | 'BOMBEROS' | 'AMBULANCIA' | 'POLICIA' | 'HOSPITAL' | 'IPS' | 'DEFENSA_CIVIL' | 'CRUZ_ROJA' | 'INTERNO' | 'OTRO';
type ResourceType = 'EXTINTOR' | 'BOTIQUIN' | 'CAMILLA' | 'ALARMA' | 'SENALIZACION' | 'KIT_EMERGENCIA' | 'EQUIPO_COMUNICACION' | 'LINTERNA' | 'RADIO' | 'OTRO';
type ResourceStatus = 'OPERATIVE' | 'PARTIAL' | 'INOPERATIVE';
type BrigadeFunction = 'LEADER' | 'EVACUATION' | 'FIRST_AID' | 'FIREFIGHTING' | 'COMMUNICATION' | 'LOGISTICS' | 'OTHER';

type SstEmergenciesModel = {
  _id: string; companyId: string; itemCode: string; year: number;
  complianceStatus: string; complianceReason: string;
  plan: {
    planName: string; version: string; effectiveDate?: string; expirationDate?: string;
    approvedBy: string; approvedAt?: string; documentUrl: string;
    objectives: string[]; scope: string; preventiveActions: string[];
    generalResponseProcedure: string; updateMechanism: string;
    responsibleUserId?: string; approverUserId?: string;
    socialization?: { date?: string; coveragePercentage?: number; participants: string; observations: string; evidence: string[] };
    documentId?: string;
  };
  threats: Array<{
    threatId: string; scenario: string; threat: string; description: string;
    vulnerability: string; exposedPeople: string; exposedAssets: string; exposedProcesses: string;
    probability: Probability; impact: Impact;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    preventiveMeasures: string[]; responseMeasures: string[]; responseProcedure: string; active: boolean;
  }>;
  contacts: Array<{
    contactId: string; type: ContactType; name: string; phone: string; secondaryPhone: string;
    address: string; notes: string; callOrder: number; active: boolean;
  }>;
  brigades: Array<{
    brigadeId: string; name: string; type: string; leader: string;
    members: string[]; typedMembers: Array<{
      memberId: string; employeeId: string; employeeNameSnapshot: string; function: BrigadeFunction;
      isAlternate: boolean; active: boolean; trainingDate?: string; trainingType: string; trainingEvidence: string; observations: string;
    }>;
    meetingFrequency: string; lastMeetingDate?: string; active: boolean;
  }>;
  meetingPoints: Array<{
    pointId: string; name: string; location: string; capacity: number; coordinates: number[]; active: boolean;
    responsible: string; countProcedure: string; expectedCount: number;
    counts: Array<{ date?: string; expectedCount: number; actualCount: number; missingCount: number; responsible: string; observations: string }>;
  }>;
  evacuationRoutes: Array<{
    routeId: string; name: string; description: string; floor: string; diagramUrl: string;
    estimatedTimeMinutes: number; active: boolean;
    responsible: string; estimatedCapacity: number; associatedExit: string; signageVerified: boolean;
  }>;
  equipment: Array<{
    equipmentId: string; name: string; type: string; resourceType?: ResourceType; location: string; quantity: number;
    lastInspectionDate?: string; nextInspectionDate?: string; status: string; operationalStatus?: ResourceStatus;
    certificateUrl: string; evidenceUrl: string; active: boolean;
  }>;
  drills: Array<{ drillId: string; name: string; type: string; date: string; participants: number; expectedParticipants: number; durationMinutes: number; results: string; findings: string; improvements: string; evidence: string[]; status: string; planActivityId?: string; active: boolean }>;
  history: Array<{ action: string; userId: string; userName: string; timestamp: string; details: string }>;
};

// ============================================================
// OPTIONS
// ============================================================

const PROBABILITY_OPTIONS: Array<{ value: Probability; label: string }> = [
  { value: 'LOW', label: 'Baja' }, { value: 'MEDIUM', label: 'Media' }, { value: 'HIGH', label: 'Alta' },
];
const IMPACT_OPTIONS: Array<{ value: Impact; label: string }> = [
  { value: 'LOW', label: 'Bajo' }, { value: 'MEDIUM', label: 'Medio' }, { value: 'HIGH', label: 'Alto' },
];
const PROBABILITY_LABEL: Record<Probability, string> = { LOW: 'Baja', MEDIUM: 'Media', HIGH: 'Alta' };
const IMPACT_LABEL: Record<Impact, string> = { LOW: 'Bajo', MEDIUM: 'Medio', HIGH: 'Alto' };

const CONTACT_TYPE_OPTIONS: Array<{ value: ContactType; label: string }> = [
  { value: 'ARL', label: 'ARL' },
  { value: 'BOMBEROS', label: 'Bomberos' },
  { value: 'AMBULANCIA', label: 'Ambulancia' },
  { value: 'POLICIA', label: 'Policía' },
  { value: 'HOSPITAL', label: 'Hospital' },
  { value: 'IPS', label: 'IPS' },
  { value: 'DEFENSA_CIVIL', label: 'Defensa Civil' },
  { value: 'CRUZ_ROJA', label: 'Cruz Roja' },
  { value: 'INTERNO', label: 'Interno (responsable de emergencias)' },
  { value: 'OTRO', label: 'Otro' },
];
const CONTACT_TYPE_LABEL: Record<string, string> = Object.fromEntries(CONTACT_TYPE_OPTIONS.map((o) => [o.value, o.label]));

const RESOURCE_TYPE_OPTIONS: Array<{ value: ResourceType; label: string }> = [
  { value: 'EXTINTOR', label: 'Extintor' },
  { value: 'BOTIQUIN', label: 'Botiquín' },
  { value: 'CAMILLA', label: 'Camilla' },
  { value: 'ALARMA', label: 'Alarma' },
  { value: 'SENALIZACION', label: 'Señalización' },
  { value: 'KIT_EMERGENCIA', label: 'Kit de emergencia' },
  { value: 'EQUIPO_COMUNICACION', label: 'Equipo de comunicación' },
  { value: 'LINTERNA', label: 'Linterna' },
  { value: 'RADIO', label: 'Radio' },
  { value: 'OTRO', label: 'Otro' },
];
const RESOURCE_TYPE_LABEL: Record<string, string> = Object.fromEntries(RESOURCE_TYPE_OPTIONS.map((o) => [o.value, o.label]));

const RESOURCE_STATUS_OPTIONS: Array<{ value: ResourceStatus; label: string }> = [
  { value: 'OPERATIVE', label: 'Operativo' },
  { value: 'PARTIAL', label: 'Parcial' },
  { value: 'INOPERATIVE', label: 'Inoperativo' },
];

const BRIGADE_FUNCTION_OPTIONS: Array<{ value: BrigadeFunction; label: string }> = [
  { value: 'LEADER', label: 'Líder de brigada' },
  { value: 'EVACUATION', label: 'Evacuación' },
  { value: 'FIRST_AID', label: 'Primeros auxilios' },
  { value: 'FIREFIGHTING', label: 'Contra incendio' },
  { value: 'COMMUNICATION', label: 'Comunicaciones' },
  { value: 'LOGISTICS', label: 'Logística' },
  { value: 'OTHER', label: 'Otra' },
];
const BRIGADE_FUNCTION_LABEL: Record<string, string> = Object.fromEntries(BRIGADE_FUNCTION_OPTIONS.map((o) => [o.value, o.label]));

/** Convierte un estado legacy de recurso al estado tipado (solo para filtros/visualización). */
function legacyStatusToOperational(status: string): ResourceStatus | '' {
  switch (status) {
    case 'OPERATIVO': return 'OPERATIVE';
    case 'PARCIAL': return 'PARTIAL';
    case 'INOPERATIVO': case 'VENCIDO': return 'INOPERATIVE';
    default: return '';
  }
}

// ============================================================
// SIDEBAR TABS
// ============================================================

const SIDEBAR_ITEMS: SidebarTabItem[] = [
  { id: 'resumen', label: '📋 Resumen' },
  { id: 'plan', label: '📄 Plan de Emergencias' },
  { id: 'amenazas', label: '⚠️ Amenazas y Vulnerabilidades' },
  { id: 'contactos', label: '📞 Contactos y Cadena de Llamadas' },
  { id: 'brigadas', label: '🚒 Brigadas' },
  { id: 'puntos', label: '📍 Puntos de Encuentro' },
  { id: 'rutas', label: '🚶 Rutas de Evacuación' },
  { id: 'equipos', label: '🧯 Recursos de Emergencia' },
  { id: 'simulacros', label: '🚨 Simulacros' },
  { id: 'historial', label: '🕓 Historial' },
  { id: 'aprobacion', label: '✍ Aprobación' },
];

// ============================================================
// HELPERS
// ============================================================

const complianceBadge = (status: string) => {
  switch (status) {
    case 'COMPLIES': return <span className="badge badge--success">✅ Cumple</span>;
    case 'NON_COMPLIANT': return <span className="badge badge--danger">❌ No cumple</span>;
    default: return <span className="badge badge--warning">⏳ Pendiente</span>;
  }
};

const drillStatusBadge = (status: string) => {
  switch (status) {
    case 'Ejecutado': case 'Completado': return <span className="badge badge--success">Ejecutado</span>;
    case 'Planificado': case 'Programado': return <span className="badge badge--info">Planificado</span>;
    case 'Cancelado': return <span className="badge badge--danger">Cancelado</span>;
    default: return <span className="badge">{status}</span>;
  }
};

const riskLevelBadge = (level: string) => {
  switch (level) {
    case 'LOW': return <span className="badge badge--success">Bajo</span>;
    case 'MEDIUM': return <span className="badge badge--warning">Medio</span>;
    case 'HIGH': return <span className="badge badge--danger">Alto</span>;
    case 'CRITICAL': return <span className="badge badge--danger">Crítico</span>;
    default: return <span className="badge">{level}</span>;
  }
};

const operationalStatusBadge = (resource: SstEmergenciesModel['equipment'][number]) => {
  const value = resource.operationalStatus ?? legacyStatusToOperational(resource.status);
  switch (value) {
    case 'OPERATIVE': return <span className="badge badge--success">Operativo</span>;
    case 'PARTIAL': return <span className="badge badge--warning">Parcial</span>;
    case 'INOPERATIVE': return <span className="badge badge--danger">Inoperativo</span>;
    default: return <span className="badge">{resource.status || '—'}</span>;
  }
};

const activeBadge = (active: boolean, labels: { on: string; off: string }) => (
  <span className={`badge ${active ? 'badge--success' : 'badge--warning'}`}>{active ? labels.on : labels.off}</span>
);

const inputStyle = { width: '100%', padding: '0.5rem', border: '1px solid #e2e8f0', borderRadius: 6 } as const;
const labelStyle = { display: 'block', fontSize: '0.8rem', color: '#4a5568', marginBottom: '0.25rem' } as const;

const linesToArray = (text: string): string[] =>
  text.split('\n').map((line) => line.trim()).filter(Boolean);

const modalOverlayStyle = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' } as const;
const modalBoxStyle = { background: '#fff', borderRadius: 12, maxWidth: 760, width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '1.5rem' } as const;

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div style={modalBoxStyle} onClick={(e) => e.stopPropagation()}>
        <h4 style={{ margin: '0 0 1rem' }}>{title}</h4>
        {children}
      </div>
    </div>
  );
}

// ── Plan (Etapa 1) ──

type PlanFormState = {
  planName: string; version: string; effectiveDate: string; expirationDate: string;
  approvedBy: string; documentUrl: string; documentId: string;
  objectivesText: string; scope: string; preventiveActionsText: string;
  generalResponseProcedure: string; updateMechanism: string;
  socializationDate: string; coveragePercentage: string;
  socializationParticipants: string; socializationObservations: string; socializationEvidenceText: string;
};

const EMPTY_PLAN_FORM: PlanFormState = {
  planName: '', version: '', effectiveDate: '', expirationDate: '',
  approvedBy: '', documentUrl: '', documentId: '',
  objectivesText: '', scope: '', preventiveActionsText: '',
  generalResponseProcedure: '', updateMechanism: '',
  socializationDate: '', coveragePercentage: '',
  socializationParticipants: '', socializationObservations: '', socializationEvidenceText: '',
};

function planToForm(plan: SstEmergenciesModel['plan']): PlanFormState {
  return {
    planName: plan.planName ?? '',
    version: plan.version ?? '',
    effectiveDate: plan.effectiveDate ? plan.effectiveDate.slice(0, 10) : '',
    expirationDate: plan.expirationDate ? plan.expirationDate.slice(0, 10) : '',
    approvedBy: plan.approvedBy ?? '',
    documentUrl: plan.documentUrl ?? '',
    documentId: plan.documentId ?? '',
    objectivesText: (plan.objectives ?? []).join('\n'),
    scope: plan.scope ?? '',
    preventiveActionsText: (plan.preventiveActions ?? []).join('\n'),
    generalResponseProcedure: plan.generalResponseProcedure ?? '',
    updateMechanism: plan.updateMechanism ?? '',
    socializationDate: plan.socialization?.date ? plan.socialization.date.slice(0, 10) : '',
    coveragePercentage: plan.socialization?.coveragePercentage !== undefined ? String(plan.socialization.coveragePercentage) : '',
    socializationParticipants: plan.socialization?.participants ?? '',
    socializationObservations: plan.socialization?.observations ?? '',
    socializationEvidenceText: (plan.socialization?.evidence ?? []).join('\n'),
  };
}

function buildPlanPayload(plan: PlanFormState): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (plan.planName.trim()) payload.planName = plan.planName.trim();
  if (plan.version.trim()) payload.version = plan.version.trim();
  if (plan.effectiveDate) payload.effectiveDate = plan.effectiveDate;
  if (plan.expirationDate) payload.expirationDate = plan.expirationDate;
  if (plan.approvedBy.trim()) payload.approvedBy = plan.approvedBy.trim();
  if (plan.documentUrl.trim()) payload.documentUrl = plan.documentUrl.trim();
  if (plan.documentId.trim()) payload.documentId = plan.documentId.trim();
  if (plan.objectivesText.trim()) payload.objectives = linesToArray(plan.objectivesText);
  if (plan.scope.trim()) payload.scope = plan.scope.trim();
  if (plan.preventiveActionsText.trim()) payload.preventiveActions = linesToArray(plan.preventiveActionsText);
  if (plan.generalResponseProcedure.trim()) payload.generalResponseProcedure = plan.generalResponseProcedure.trim();
  if (plan.updateMechanism.trim()) payload.updateMechanism = plan.updateMechanism.trim();

  const socialization: Record<string, unknown> = {};
  if (plan.socializationDate) socialization.date = plan.socializationDate;
  if (plan.coveragePercentage.trim() !== '') {
    const coverage = Number(plan.coveragePercentage);
    if (!Number.isNaN(coverage)) socialization.coveragePercentage = Math.max(0, Math.min(100, Math.round(coverage)));
  }
  if (plan.socializationParticipants.trim()) socialization.participants = plan.socializationParticipants.trim();
  if (plan.socializationObservations.trim()) socialization.observations = plan.socializationObservations.trim();
  if (plan.socializationEvidenceText.trim()) socialization.evidence = linesToArray(plan.socializationEvidenceText);
  if (Object.keys(socialization).length > 0) payload.socialization = socialization;

  return payload;
}

// ── Amenazas (Etapa 1) ──

type ThreatFormState = {
  threatId?: string;
  scenario: string; threat: string; description: string; vulnerability: string;
  exposedPeople: string; exposedAssets: string; exposedProcesses: string;
  probability: Probability; impact: Impact;
  preventiveMeasuresText: string; responseMeasuresText: string; responseProcedure: string;
};

const EMPTY_THREAT_FORM: ThreatFormState = {
  scenario: '', threat: '', description: '', vulnerability: '',
  exposedPeople: '', exposedAssets: '', exposedProcesses: '',
  probability: 'LOW', impact: 'LOW',
  preventiveMeasuresText: '', responseMeasuresText: '', responseProcedure: '',
};

function threatToForm(t: SstEmergenciesModel['threats'][number]): ThreatFormState {
  return {
    threatId: t.threatId,
    scenario: t.scenario, threat: t.threat, description: t.description, vulnerability: t.vulnerability,
    exposedPeople: t.exposedPeople, exposedAssets: t.exposedAssets, exposedProcesses: t.exposedProcesses,
    probability: t.probability, impact: t.impact,
    preventiveMeasuresText: (t.preventiveMeasures ?? []).join('\n'),
    responseMeasuresText: (t.responseMeasures ?? []).join('\n'),
    responseProcedure: t.responseProcedure ?? '',
  };
}

function buildThreatPayload(form: ThreatFormState): Record<string, unknown> {
  return {
    scenario: form.scenario.trim(),
    threat: form.threat.trim(),
    ...(form.description.trim() ? { description: form.description.trim() } : {}),
    ...(form.vulnerability.trim() ? { vulnerability: form.vulnerability.trim() } : {}),
    ...(form.exposedPeople.trim() ? { exposedPeople: form.exposedPeople.trim() } : {}),
    ...(form.exposedAssets.trim() ? { exposedAssets: form.exposedAssets.trim() } : {}),
    ...(form.exposedProcesses.trim() ? { exposedProcesses: form.exposedProcesses.trim() } : {}),
    probability: form.probability,
    impact: form.impact,
    ...(form.preventiveMeasuresText.trim() ? { preventiveMeasures: linesToArray(form.preventiveMeasuresText) } : {}),
    ...(form.responseMeasuresText.trim() ? { responseMeasures: linesToArray(form.responseMeasuresText) } : {}),
    ...(form.responseProcedure.trim() ? { responseProcedure: form.responseProcedure.trim() } : {}),
  };
}

// ── Etapa 2: contactos, recursos, brigadistas, evacuación ──

type ContactFormState = {
  contactId?: string; type: ContactType; name: string; phone: string; secondaryPhone: string;
  address: string; notes: string; callOrder: string;
};

const EMPTY_CONTACT_FORM: ContactFormState = { type: 'ARL', name: '', phone: '', secondaryPhone: '', address: '', notes: '', callOrder: '1' };

function contactToForm(c: SstEmergenciesModel['contacts'][number]): ContactFormState {
  return { contactId: c.contactId, type: c.type, name: c.name, phone: c.phone, secondaryPhone: c.secondaryPhone, address: c.address, notes: c.notes, callOrder: String(c.callOrder) };
}

function buildContactPayload(form: ContactFormState): Record<string, unknown> {
  return {
    type: form.type,
    name: form.name.trim(),
    phone: form.phone.trim(),
    ...(form.secondaryPhone.trim() ? { secondaryPhone: form.secondaryPhone.trim() } : {}),
    ...(form.address.trim() ? { address: form.address.trim() } : {}),
    ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
    callOrder: Math.max(1, Number(form.callOrder) || 1),
  };
}

type ResourceFormState = {
  equipmentId?: string; resourceType: string; name: string; location: string; quantity: string;
  operationalStatus: string; lastInspectionDate: string; nextInspectionDate: string;
  certificateUrl: string; evidenceUrl: string;
};

const EMPTY_RESOURCE_FORM: ResourceFormState = { resourceType: 'EXTINTOR', name: '', location: '', quantity: '1', operationalStatus: 'OPERATIVE', lastInspectionDate: '', nextInspectionDate: '', certificateUrl: '', evidenceUrl: '' };

function resourceToForm(r: SstEmergenciesModel['equipment'][number]): ResourceFormState {
  return {
    equipmentId: r.equipmentId,
    // Filas legacy sin resourceType: el select queda vacío y el campo NO se envía (no se inventa un tipo).
    resourceType: r.resourceType ?? '',
    name: r.name,
    location: r.location,
    quantity: String(r.quantity),
    operationalStatus: r.operationalStatus ?? '',
    lastInspectionDate: r.lastInspectionDate ? r.lastInspectionDate.slice(0, 10) : '',
    nextInspectionDate: r.nextInspectionDate ? r.nextInspectionDate.slice(0, 10) : '',
    certificateUrl: r.certificateUrl ?? '',
    evidenceUrl: r.evidenceUrl ?? '',
  };
}

function buildResourcePayload(form: ResourceFormState): Record<string, unknown> {
  return {
    ...(form.resourceType ? { resourceType: form.resourceType } : {}),
    name: form.name.trim(),
    ...(form.location.trim() ? { location: form.location.trim() } : {}),
    quantity: Math.max(1, Number(form.quantity) || 1),
    ...(form.operationalStatus ? { operationalStatus: form.operationalStatus } : {}),
    ...(form.lastInspectionDate ? { lastInspectionDate: form.lastInspectionDate } : {}),
    ...(form.nextInspectionDate ? { nextInspectionDate: form.nextInspectionDate } : {}),
    ...(form.certificateUrl.trim() ? { certificateUrl: form.certificateUrl.trim() } : {}),
    ...(form.evidenceUrl.trim() ? { evidenceUrl: form.evidenceUrl.trim() } : {}),
  };
}

type MemberFormState = {
  brigadeId: string; memberId?: string; employeeId: string; function: BrigadeFunction;
  isAlternate: boolean; trainingDate: string; trainingType: string; trainingEvidence: string; observations: string;
};

const EMPTY_MEMBER_FORM: MemberFormState = { brigadeId: '', employeeId: '', function: 'OTHER', isAlternate: false, trainingDate: '', trainingType: '', trainingEvidence: '', observations: '' };

function memberToForm(brigadeId: string, m: SstEmergenciesModel['brigades'][number]['typedMembers'][number]): MemberFormState {
  return {
    brigadeId, memberId: m.memberId, employeeId: m.employeeId, function: m.function,
    isAlternate: m.isAlternate,
    trainingDate: m.trainingDate ? m.trainingDate.slice(0, 10) : '',
    trainingType: m.trainingType ?? '', trainingEvidence: m.trainingEvidence ?? '', observations: m.observations ?? '',
  };
}

type RouteFormState = {
  routeId: string; name: string; description: string; floor: string; estimatedTimeMinutes: string;
  responsible: string; estimatedCapacity: string; associatedExit: string; signageVerified: boolean;
};

function routeToForm(r: SstEmergenciesModel['evacuationRoutes'][number]): RouteFormState {
  return {
    routeId: r.routeId, name: r.name, description: r.description, floor: r.floor,
    estimatedTimeMinutes: String(r.estimatedTimeMinutes),
    responsible: r.responsible ?? '',
    estimatedCapacity: r.estimatedCapacity !== undefined ? String(r.estimatedCapacity) : '0',
    associatedExit: r.associatedExit ?? '',
    signageVerified: r.signageVerified ?? false,
  };
}

type PointFormState = {
  pointId: string; name: string; location: string; capacity: string;
  responsible: string; countProcedure: string; expectedCount: string;
};

function pointToForm(p: SstEmergenciesModel['meetingPoints'][number]): PointFormState {
  return {
    pointId: p.pointId, name: p.name, location: p.location, capacity: String(p.capacity),
    responsible: p.responsible ?? '',
    countProcedure: p.countProcedure ?? '',
    expectedCount: p.expectedCount !== undefined ? String(p.expectedCount) : '0',
  };
}

type CountFormState = { pointId: string; date: string; expectedCount: string; actualCount: string; responsible: string; observations: string };

const EMPTY_COUNT_FORM: CountFormState = { pointId: '', date: new Date().toISOString().slice(0, 10), expectedCount: '0', actualCount: '0', responsible: '', observations: '' };

// ── Brigada y simulacro (Etapa 3: captura completa) ──

type BrigadeFormState = { brigadeId: string; name: string; type: string; leader: string; meetingFrequency: string; lastMeetingDate: string };

const EMPTY_BRIGADE_FORM: BrigadeFormState = { brigadeId: '', name: '', type: 'Evacuación', leader: '', meetingFrequency: 'Mensual', lastMeetingDate: '' };

function brigadeToForm(b: SstEmergenciesModel['brigades'][number]): BrigadeFormState {
  return {
    brigadeId: b.brigadeId, name: b.name, type: b.type ?? '', leader: b.leader ?? '',
    meetingFrequency: b.meetingFrequency ?? '',
    lastMeetingDate: b.lastMeetingDate ? b.lastMeetingDate.slice(0, 10) : '',
  };
}

function buildBrigadePayload(form: BrigadeFormState): Record<string, unknown> {
  const payload: Record<string, unknown> = { name: form.name.trim() };
  if (form.type.trim()) payload.type = form.type.trim();
  if (form.leader.trim()) payload.leader = form.leader.trim();
  if (form.meetingFrequency.trim()) payload.meetingFrequency = form.meetingFrequency.trim();
  if (form.lastMeetingDate) payload.lastMeetingDate = form.lastMeetingDate;
  return payload;
}

const DRILL_STATUS_CHOICES = ['Programado', 'Planificado', 'Ejecutado', 'Completado', 'Cancelado'] as const;

type DrillFormState = { drillId: string; name: string; type: string; date: string; participants: string; expectedParticipants: string; durationMinutes: string; results: string; findings: string; improvements: string; evidenceText: string; status: string; planActivityId: string };

const EMPTY_DRILL_FORM: DrillFormState = { drillId: '', name: '', type: 'Evacuación', date: new Date().toISOString().slice(0, 10), participants: '0', expectedParticipants: '0', durationMinutes: '0', results: '', findings: '', improvements: '', evidenceText: '', status: 'Programado', planActivityId: '' };

function drillToForm(d: SstEmergenciesModel['drills'][number]): DrillFormState {
  return {
    drillId: d.drillId, name: d.name, type: d.type ?? '',
    date: d.date ? d.date.slice(0, 10) : '',
    participants: String(d.participants ?? 0),
    expectedParticipants: String(d.expectedParticipants ?? 0),
    durationMinutes: String(d.durationMinutes ?? 0),
    results: d.results ?? '', findings: d.findings ?? '', improvements: d.improvements ?? '',
    evidenceText: (d.evidence ?? []).join('\n'),
    status: d.status ?? 'Programado',
    planActivityId: d.planActivityId ?? '',
  };
}

function buildDrillPayload(form: DrillFormState): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: form.name.trim(),
    date: form.date,
    participants: Math.max(0, Number(form.participants) || 0),
    expectedParticipants: Math.max(0, Number(form.expectedParticipants) || 0),
    durationMinutes: Math.max(0, Number(form.durationMinutes) || 0),
  };
  if (form.type.trim()) payload.type = form.type.trim();
  if (form.results.trim()) payload.results = form.results.trim();
  if (form.findings.trim()) payload.findings = form.findings.trim();
  if (form.improvements.trim()) payload.improvements = form.improvements.trim();
  const evidence = linesToArray(form.evidenceText);
  if (evidence.length) payload.evidence = evidence;
  if (form.status) payload.status = form.status;
  // Vínculo opcional con el Plan Anual: '' → null ("Sin actividad vinculada").
  payload.planActivityId = form.planActivityId || null;
  return payload;
}

const EMPTY_ROUTE_FORM: RouteFormState = { routeId: '', name: '', description: '', floor: '', estimatedTimeMinutes: '5', responsible: '', estimatedCapacity: '0', associatedExit: '', signageVerified: false };
const EMPTY_POINT_FORM: PointFormState = { pointId: '', name: '', location: '', capacity: '0', responsible: '', countProcedure: '', expectedCount: '0' };

// ============================================================
// PAGE COMPONENT
// ============================================================

interface EmergenciesPageProps {
  token: string;
  role?: string;
}

export function EmergenciesPage({ token, role }: EmergenciesPageProps) {
  const { companyId } = useCompanyContext();
  const [data, setData] = useState<SstEmergenciesModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('resumen');
  const [lastSync, setLastSync] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const [planForm, setPlanForm] = useState<PlanFormState>(EMPTY_PLAN_FORM);
  const [threatForm, setThreatForm] = useState<ThreatFormState>(EMPTY_THREAT_FORM);
  const [threatModalOpen, setThreatModalOpen] = useState(false);

  const [contactForm, setContactForm] = useState<ContactFormState>(EMPTY_CONTACT_FORM);
  const [contactModalOpen, setContactModalOpen] = useState(false);

  const [resourceForm, setResourceForm] = useState<ResourceFormState>(EMPTY_RESOURCE_FORM);
  const [resourceModalOpen, setResourceModalOpen] = useState(false);
  const [resourceTypeFilter, setResourceTypeFilter] = useState('');
  const [resourceStatusFilter, setResourceStatusFilter] = useState('');

  const [memberForm, setMemberForm] = useState<MemberFormState>(EMPTY_MEMBER_FORM);
  const [memberModalOpen, setMemberModalOpen] = useState(false);
  const [employees, setEmployees] = useState<EmployeeModel[]>([]);

  const [routeForm, setRouteForm] = useState<RouteFormState | null>(null);
  const [pointForm, setPointForm] = useState<PointFormState | null>(null);
  const [countForm, setCountForm] = useState<CountFormState>(EMPTY_COUNT_FORM);
  const [countModalOpen, setCountModalOpen] = useState(false);

  // Etapa 3: brigada y simulacro (CRUD completo) + selectores AWP/Documento.
  const [brigadeForm, setBrigadeForm] = useState<BrigadeFormState>(EMPTY_BRIGADE_FORM);
  const [brigadeModalOpen, setBrigadeModalOpen] = useState(false);
  const [drillForm, setDrillForm] = useState<DrillFormState>(EMPTY_DRILL_FORM);
  const [drillModalOpen, setDrillModalOpen] = useState(false);
  const [awpPlan, setAwpPlan] = useState<AnnualWorkPlanModel | null>(null);
  const [awpActivities, setAwpActivities] = useState<PlanActivityModel[]>([]);
  const [emergencyDocs, setEmergencyDocs] = useState<DocumentMasterItem[]>([]);

  // Cumplimiento OFICIAL 5.1.2 — Brigada de emergencia (Compliance Engine).
  // Opcional: si la consulta falla queda null y la sección muestra el estado
  // "No disponible" sin bloquear la gestión de emergencias (patrón EPP).
  const [emergencyBrigadeCompliance, setEmergencyBrigadeCompliance] = useState<DashboardModuleCompliance | null>(null);
  const [emergencyBrigadeFindings, setEmergencyBrigadeFindings] = useState<DashboardFinding[]>([]);

  // Política de permisos ALINEADA con el backend (Roles guard):
  // escritura owner/admin/manager · submit owner/admin · decisión owner/manager · member lectura.
  const canWrite = role === 'owner' || role === 'admin' || role === 'manager';
  const canSubmit = role === 'owner' || role === 'admin';
  const canDecide = role === 'owner' || role === 'manager';

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [result, overview] = await Promise.all([
        fetchEmergenciesAdvanced(token),
        // Resumen de cumplimiento 5.1.2: overview OPCIONAL — su fallo no debe
        // bloquear la gestión de emergencias (patrón tolerante de EPP). Una
        // sola llamada alimenta score, dimensiones, counters y findings.
        getOverview(token, companyId ?? '').catch(() => null),
      ]);
      const model = result as unknown as SstEmergenciesModel;
      setData(model);
      setPlanForm(model?.plan ? planToForm(model.plan) : EMPTY_PLAN_FORM);
      setLastSync(new Date().toLocaleString('es-CO'));
      // 'emergency-brigade' es el identificador canónico del módulo 5.1.2.
      setEmergencyBrigadeCompliance(overview?.moduleCompliance.find((m) => m.module === 'emergency-brigade') ?? null);
      setEmergencyBrigadeFindings(overview ? overview.findings.filter((f) => f.module === 'emergency-brigade') : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar datos de emergencias');
    } finally {
      setLoading(false);
    }
  }, [token, companyId]);

  useEffect(() => { void loadData(); }, [loadData]);

  // Empleados de la empresa para el selector de brigadistas (solo si puede escribir).
  useEffect(() => {
    if (!canWrite) return;
    fetchEmployees(token)
      .then((list) => setEmployees(list.filter((e) => e.status === 'Activo')))
      .catch(() => setEmployees([]));
  }, [canWrite, token]);

  // Etapa 3: Plan Anual vigente + sus actividades (vínculo opcional del simulacro).
  useEffect(() => {
    if (!canWrite) return;
    let cancelled = false;
    (async () => {
      try {
        const plan = await fetchAnnualWorkPlanCurrent(token);
        if (cancelled || !plan) { if (!cancelled) { setAwpPlan(null); setAwpActivities([]); } return; }
        setAwpPlan(plan);
        const activities = await fetchPlanActivities(token, plan._id);
        if (!cancelled) setAwpActivities(activities.filter((a) => a.status !== 'Cancelled'));
      } catch {
        if (!cancelled) { setAwpPlan(null); setAwpActivities([]); }
      }
    })();
    return () => { cancelled = true; };
  }, [canWrite, token]);

  // Etapa 3: documentos oficiales EMERGENCY_PLAN para el selector del Plan.
  useEffect(() => {
    if (!canWrite) return;
    fetchDocumentManagementList(token)
      .then((docs) => setEmergencyDocs(docs.filter((d) => d.documentType === 'EMERGENCY_PLAN')))
      .catch(() => setEmergencyDocs([]));
  }, [canWrite, token]);

  const handleAction = async (action: () => Promise<unknown>) => {
    setActionLoading(true);
    try {
      await action();
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error en la acción');
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  const handleSavePlan = async () => {
    await handleAction(() => updateEmergenciesAdvanced(token, { plan: buildPlanPayload(planForm) }));
  };

  const handleSubmit = () => handleAction(() => submitEmergenciesAdvanced(token));
  const handleApprove = () => handleAction(() => approveEmergenciesAdvanced(token));
  const handleReject = () => {
    const reason = window.prompt('Motivo del rechazo:');
    if (reason) handleAction(() => rejectEmergenciesAdvanced(token, reason));
  };

  // Amenazas
  const openNewThreat = () => { setThreatForm(EMPTY_THREAT_FORM); setThreatModalOpen(true); };
  const openEditThreat = (t: SstEmergenciesModel['threats'][number]) => { setThreatForm(threatToForm(t)); setThreatModalOpen(true); };
  const handleSaveThreat = async () => {
    if (!threatForm.scenario.trim() || !threatForm.threat.trim()) {
      setError('Escenario y amenaza son obligatorios.');
      return;
    }
    const payload = buildThreatPayload(threatForm);
    if (threatForm.threatId) await handleAction(() => updateEmergenciesThreat(token, threatForm.threatId as string, payload));
    else await handleAction(() => createEmergenciesThreat(token, payload));
    setThreatModalOpen(false);
    setThreatForm(EMPTY_THREAT_FORM);
  };
  const handleToggleThreat = async (t: SstEmergenciesModel['threats'][number]) => {
    if (t.active) await handleAction(() => deactivateEmergenciesThreat(token, t.threatId));
    else await handleAction(() => updateEmergenciesThreat(token, t.threatId, { active: true }));
  };

  // Contactos
  const openNewContact = () => { setContactForm(EMPTY_CONTACT_FORM); setContactModalOpen(true); };
  const openEditContact = (c: SstEmergenciesModel['contacts'][number]) => { setContactForm(contactToForm(c)); setContactModalOpen(true); };
  const handleSaveContact = async () => {
    if (!contactForm.name.trim() || !contactForm.phone.trim()) {
      setError('Nombre y teléfono del contacto son obligatorios.');
      return;
    }
    const payload = buildContactPayload(contactForm);
    if (contactForm.contactId) await handleAction(() => updateEmergenciesContact(token, contactForm.contactId as string, payload));
    else await handleAction(() => createEmergenciesContact(token, payload));
    setContactModalOpen(false);
    setContactForm(EMPTY_CONTACT_FORM);
  };
  const handleToggleContact = async (c: SstEmergenciesModel['contacts'][number]) => {
    if (c.active) await handleAction(() => deactivateEmergenciesContact(token, c.contactId));
    else await handleAction(() => updateEmergenciesContact(token, c.contactId, { active: true }));
  };

  // Recursos
  const openNewResource = () => { setResourceForm(EMPTY_RESOURCE_FORM); setResourceModalOpen(true); };
  const openEditResource = (r: SstEmergenciesModel['equipment'][number]) => { setResourceForm(resourceToForm(r)); setResourceModalOpen(true); };
  const handleSaveResource = async () => {
    if (!resourceForm.name.trim()) {
      setError('El nombre del recurso es obligatorio.');
      return;
    }
    const payload = buildResourcePayload(resourceForm);
    if (resourceForm.equipmentId) await handleAction(() => updateEmergenciesResource(token, resourceForm.equipmentId as string, payload));
    else await handleAction(() => createEmergenciesResource(token, payload));
    setResourceModalOpen(false);
    setResourceForm(EMPTY_RESOURCE_FORM);
  };
  const handleToggleResource = async (r: SstEmergenciesModel['equipment'][number]) => {
    if (r.active) await handleAction(() => deactivateEmergenciesResource(token, r.equipmentId));
    else await handleAction(() => updateEmergenciesResource(token, r.equipmentId, { active: true }));
  };

  // Brigadistas
  const openNewMember = (brigadeId: string) => { setMemberForm({ ...EMPTY_MEMBER_FORM, brigadeId }); setMemberModalOpen(true); };
  const openEditMember = (brigadeId: string, m: SstEmergenciesModel['brigades'][number]['typedMembers'][number]) => { setMemberForm(memberToForm(brigadeId, m)); setMemberModalOpen(true); };
  const handleSaveMember = async () => {
    if (!memberForm.employeeId) {
      setError('Selecciona el trabajador brigadista.');
      return;
    }
    const payload: Record<string, unknown> = {
      employeeId: memberForm.employeeId,
      function: memberForm.function,
      isAlternate: memberForm.isAlternate,
      ...(memberForm.trainingDate ? { trainingDate: memberForm.trainingDate } : {}),
      ...(memberForm.trainingType.trim() ? { trainingType: memberForm.trainingType.trim() } : {}),
      ...(memberForm.trainingEvidence.trim() ? { trainingEvidence: memberForm.trainingEvidence.trim() } : {}),
      ...(memberForm.observations.trim() ? { observations: memberForm.observations.trim() } : {}),
    };
    if (memberForm.memberId) await handleAction(() => updateEmergenciesBrigadeMember(token, memberForm.brigadeId, memberForm.memberId as string, payload));
    else await handleAction(() => createEmergenciesBrigadeMember(token, memberForm.brigadeId, payload));
    setMemberModalOpen(false);
    setMemberForm(EMPTY_MEMBER_FORM);
  };
  const handleDeactivateMember = async (brigadeId: string, memberId: string) => {
    await handleAction(() => deactivateEmergenciesBrigadeMember(token, brigadeId, memberId));
  };

  // Brigadas (Etapa 3: CRUD completo)
  const openNewBrigade = () => { setBrigadeForm(EMPTY_BRIGADE_FORM); setBrigadeModalOpen(true); };
  const openEditBrigade = (b: SstEmergenciesModel['brigades'][number]) => { setBrigadeForm(brigadeToForm(b)); setBrigadeModalOpen(true); };
  const handleSaveBrigade = async () => {
    if (!brigadeForm.name.trim()) {
      setError('El nombre de la brigada es obligatorio.');
      return;
    }
    const payload = buildBrigadePayload(brigadeForm);
    if (brigadeForm.brigadeId) await handleAction(() => updateEmergenciesBrigade(token, brigadeForm.brigadeId as string, payload));
    else await handleAction(() => createEmergenciesBrigade(token, payload));
    setBrigadeModalOpen(false);
    setBrigadeForm(EMPTY_BRIGADE_FORM);
  };
  const handleToggleBrigade = async (b: SstEmergenciesModel['brigades'][number]) => {
    if (b.active) await handleAction(() => deactivateEmergenciesBrigade(token, b.brigadeId));
    else await handleAction(() => updateEmergenciesBrigade(token, b.brigadeId, { active: true }));
  };

  // Evacuación (Etapa 3: creación + activar/desactivar rutas y puntos)
  const openNewRoute = () => setRouteForm(EMPTY_ROUTE_FORM);
  const handleSaveRoute = async () => {
    if (!routeForm) return;
    if (!routeForm.name.trim()) {
      setError('El nombre de la ruta es obligatorio.');
      return;
    }
    const payload: Record<string, unknown> = {
      name: routeForm.name.trim(),
      estimatedTimeMinutes: Math.max(1, Number(routeForm.estimatedTimeMinutes) || 1),
      signageVerified: routeForm.signageVerified,
    };
    if (routeForm.description.trim()) payload.description = routeForm.description.trim();
    if (routeForm.floor.trim()) payload.floor = routeForm.floor.trim();
    if (routeForm.responsible.trim()) payload.responsible = routeForm.responsible.trim();
    if (routeForm.estimatedCapacity.trim() !== '') payload.estimatedCapacity = Math.max(0, Number(routeForm.estimatedCapacity) || 0);
    if (routeForm.associatedExit.trim()) payload.associatedExit = routeForm.associatedExit.trim();
    if (routeForm.routeId) await handleAction(() => updateEmergenciesRoute(token, routeForm.routeId, payload));
    else await handleAction(() => createEmergenciesRoute(token, payload));
    setRouteForm(null);
  };
  const handleToggleRoute = async (r: SstEmergenciesModel['evacuationRoutes'][number]) => {
    if (r.active) await handleAction(() => deactivateEmergenciesRoute(token, r.routeId));
    else await handleAction(() => updateEmergenciesRoute(token, r.routeId, { active: true }));
  };
  const openNewPoint = () => setPointForm(EMPTY_POINT_FORM);
  const handleSavePoint = async () => {
    if (!pointForm) return;
    if (!pointForm.name.trim()) {
      setError('El nombre del punto de encuentro es obligatorio.');
      return;
    }
    const payload: Record<string, unknown> = { name: pointForm.name.trim() };
    if (pointForm.location.trim()) payload.location = pointForm.location.trim();
    if (pointForm.capacity.trim() !== '') payload.capacity = Math.max(0, Number(pointForm.capacity) || 0);
    if (pointForm.responsible.trim()) payload.responsible = pointForm.responsible.trim();
    if (pointForm.countProcedure.trim()) payload.countProcedure = pointForm.countProcedure.trim();
    if (pointForm.expectedCount.trim() !== '') payload.expectedCount = Math.max(0, Number(pointForm.expectedCount) || 0);
    if (pointForm.pointId) await handleAction(() => updateEmergenciesMeetingPoint(token, pointForm.pointId, payload));
    else await handleAction(() => createEmergenciesMeetingPoint(token, payload));
    setPointForm(null);
  };
  const handleTogglePoint = async (p: SstEmergenciesModel['meetingPoints'][number]) => {
    if (p.active) await handleAction(() => deactivateEmergenciesMeetingPoint(token, p.pointId));
    else await handleAction(() => updateEmergenciesMeetingPoint(token, p.pointId, { active: true }));
  };

  // Simulacros (Etapa 3: CRUD completo + vínculo opcional AWP)
  const openNewDrill = () => { setDrillForm(EMPTY_DRILL_FORM); setDrillModalOpen(true); };
  const openEditDrill = (d: SstEmergenciesModel['drills'][number]) => { setDrillForm(drillToForm(d)); setDrillModalOpen(true); };
  const handleSaveDrill = async () => {
    if (!drillForm.name.trim()) {
      setError('El nombre del simulacro es obligatorio.');
      return;
    }
    if (!drillForm.date) {
      setError('La fecha del simulacro es obligatoria.');
      return;
    }
    const payload = buildDrillPayload(drillForm);
    if (drillForm.drillId) await handleAction(() => updateEmergenciesDrill(token, drillForm.drillId as string, payload));
    else await handleAction(() => createEmergenciesDrill(token, payload));
    setDrillModalOpen(false);
    setDrillForm(EMPTY_DRILL_FORM);
  };
  const handleToggleDrill = async (d: SstEmergenciesModel['drills'][number]) => {
    if (d.active) await handleAction(() => deactivateEmergenciesDrill(token, d.drillId));
    else await handleAction(() => updateEmergenciesDrill(token, d.drillId, { active: true }));
  };
  const handleAddCount = async () => {
    const payload = {
      date: countForm.date,
      expectedCount: Math.max(0, Number(countForm.expectedCount) || 0),
      actualCount: Math.max(0, Number(countForm.actualCount) || 0),
      ...(countForm.responsible.trim() ? { responsible: countForm.responsible.trim() } : {}),
      ...(countForm.observations.trim() ? { observations: countForm.observations.trim() } : {}),
    };
    await handleAction(() => addEmergenciesEvacuationCount(token, countForm.pointId, payload));
    setCountModalOpen(false);
    setCountForm(EMPTY_COUNT_FORM);
  };

  if (loading && !data) {
    return (
      <AdvancedPageLayout>
        <div style={{ padding: '2rem', textAlign: 'center' }}><p>Cargando información de emergencias...</p></div>
      </AdvancedPageLayout>
    );
  }

  if (error && !data) {
    return (
      <AdvancedPageLayout>
        <div style={{ padding: '2rem', textAlign: 'center', color: '#e53e3e' }}>
          <p>{error}</p>
          <Button onClick={() => void loadData()}>Reintentar</Button>
        </div>
      </AdvancedPageLayout>
    );
  }

  const plan = data?.plan ?? { planName: '', version: '', approvedBy: '', documentUrl: '', objectives: [], preventiveActions: [], scope: '', generalResponseProcedure: '', updateMechanism: '' };
  const threats = data?.threats ?? [];
  const activeThreats = threats.filter((t) => t.active);
  const contacts = data?.contacts ?? [];
  const activeContacts = contacts.filter((c) => c.active).sort((a, b) => a.callOrder - b.callOrder);
  const brigades = data?.brigades ?? [];
  const visibleBrigades = brigades.filter((b) => b.active !== false);
  const meetingPoints = data?.meetingPoints ?? [];
  const visibleMeetingPoints = meetingPoints.filter((p) => p.active !== false);
  const routes = data?.evacuationRoutes ?? [];
  const visibleRoutes = routes.filter((r) => r.active !== false);
  const equipment = data?.equipment ?? [];
  const activeEquipment = equipment.filter((e) => e.active);
  const drills = data?.drills ?? [];
  const visibleDrills = drills.filter((d) => d.active !== false);
  const history = data?.history ?? [];
  const executedDrills = visibleDrills.filter(d => d.status === 'Ejecutado' || d.status === 'Completado');
  const totalBrigadistas = brigades.reduce((sum, b) => sum + (b.typedMembers?.filter((m) => m.active).length ?? 0), 0);
  const legacyBrigadistas = brigades.reduce((sum, b) => sum + (b.members?.length ?? 0), 0);
  const operationalEquipment = activeEquipment.filter((e) => (e.operationalStatus ?? legacyStatusToOperational(e.status)) === 'OPERATIVE');
  const filteredEquipment = activeEquipment.filter((e) =>
    (!resourceTypeFilter || (e.resourceType ?? '') === resourceTypeFilter) &&
    (!resourceStatusFilter || (e.operationalStatus ?? legacyStatusToOperational(e.status)) === resourceStatusFilter),
  );
  const isLegacyRecord = data?.itemCode === '1.1.10';

  const actions: HeaderAction[] = [
    { label: '📄 Exportar PDF', onClick: () => {}, variant: 'secondary' },
  ];
  if (canWrite) {
    actions.push({ label: '💾 Guardar', onClick: handleSavePlan, variant: 'primary' });
  }

  return (
    <AdvancedPageLayout>
      <AdvancedHeader
        backPath="/documents/do"
        backLabel="← Volver a Hacer"
        moduleCode="5.1.1"
        moduleTitle="Plan de Emergencias"
        description="Plan de prevención, preparación y respuesta ante emergencias — Estándar 5.1.1"
        statusBadge={complianceBadge(data?.complianceStatus ?? 'PENDING')}
        actions={actions}
        lastSaved={lastSync ? `Última actualización: ${lastSync}` : undefined}
      />

      <AdvancedKpiGrid
        items={[
          { label: 'Amenazas activas', value: activeThreats.length, variant: activeThreats.length > 0 ? 'info' : 'warning' },
          { label: 'Contactos activos', value: activeContacts.length, variant: activeContacts.length > 0 ? 'info' : 'warning' },
          { label: 'Brigadistas', value: `${totalBrigadistas}${legacyBrigadistas > 0 ? ` (+${legacyBrigadistas} legacy)` : ''}`, variant: 'info' },
          { label: 'Recursos operativos', value: `${operationalEquipment.length}/${activeEquipment.length}`, variant: operationalEquipment.length === activeEquipment.length && activeEquipment.length > 0 ? 'success' : 'warning' },
          { label: 'Simulacros ejecutados', value: executedDrills.length, variant: 'success' },
          { label: 'Rutas configuradas', value: routes.length, variant: 'info' },
        ]}
        columns={3}
      />

      {error && (
        <Card style={{ padding: '0.75rem 1rem', marginBottom: '1rem', background: '#fff5f5', border: '1px solid #fc8181', color: '#c53030' }}>{error}</Card>
      )}

      <div className="flex gap-6" style={{ marginTop: '1.5rem' }}>
        <AdvancedTabsSidebar items={SIDEBAR_ITEMS} activeId={activeTab} onSelect={setActiveTab} />
        <AdvancedTabsContent>
          {/* RESUMEN */}
          {activeTab === 'resumen' && (
            <AdvancedSection title="Resumen de Emergencias" description="Estado general del plan de emergencias">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                <Card style={{ padding: '1rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem', color: '#4a5568' }}>Plan de Emergencias</h4>
                  <p style={{ margin: '0.25rem 0', fontSize: '0.875rem' }}><strong>Nombre:</strong> {plan.planName || 'No configurado'}</p>
                  <p style={{ margin: '0.25rem 0', fontSize: '0.875rem' }}><strong>Versión:</strong> {plan.version || '—'}</p>
                  {plan.approvedBy && <p style={{ margin: '0.25rem 0', fontSize: '0.875rem' }}><strong>Aprobado por:</strong> {plan.approvedBy}</p>}
                  {isLegacyRecord && (
                    <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: '#b7791f' }}>
                      Registro histórico (código legacy 1.1.10). La migración al código 5.1.1 se realizará en una etapa posterior.
                    </p>
                  )}
                </Card>
                <Card style={{ padding: '1rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem', color: '#4a5568' }}>Cobertura</h4>
                  <p style={{ margin: '0.25rem 0', fontSize: '0.875rem' }}><strong>Amenazas evaluadas:</strong> {activeThreats.length}</p>
                  <p style={{ margin: '0.25rem 0', fontSize: '0.875rem' }}><strong>Contactos de emergencia:</strong> {activeContacts.length}</p>
                  <p style={{ margin: '0.25rem 0', fontSize: '0.875rem' }}><strong>Brigadas:</strong> {brigades.length} ({totalBrigadistas} brigadistas)</p>
                  <p style={{ margin: '0.25rem 0', fontSize: '0.875rem' }}><strong>Puntos de encuentro:</strong> {meetingPoints.length}</p>
                  <p style={{ margin: '0.25rem 0', fontSize: '0.875rem' }}><strong>Rutas de evacuación:</strong> {routes.length}</p>
                </Card>
                <Card style={{ padding: '1rem' }}>
                  <h4 style={{ margin: '0 0 0.5rem', color: '#4a5568' }}>Estado</h4>
                  <p style={{ margin: '0.25rem 0', fontSize: '0.875rem' }}>
                    <strong>Cumplimiento:</strong> {complianceBadge(data?.complianceStatus ?? 'PENDING')}
                  </p>
                  {data?.complianceReason && <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem', color: '#718096' }}>{data.complianceReason}</p>}
                </Card>
              </div>

              {/* Cumplimiento OFICIAL 5.1.2 — Brigada de emergencia (Compliance Engine).
                  Separado del resultado 5.1.1 (plan, simulacros, recursos…). */}
              <div style={{ marginTop: '1rem' }}>
                <EmergencyBrigadeComplianceSection
                  compliance={emergencyBrigadeCompliance}
                  findings={emergencyBrigadeFindings}
                  loading={loading}
                  role={role}
                  onOpenBrigadesTab={() => setActiveTab('brigadas')}
                />
              </div>

              {/* IA 5.1.2 — análisis inteligente, claramente diferenciado del
                  resultado oficial; su fallo no bloquea la página. */}
              <div style={{ marginTop: '1rem' }}>
                <ComplianceAIInsight token={token} standardCode="5.1.2" />
              </div>
            </AdvancedSection>
          )}

          {/* PLAN (Etapa 1) */}
          {activeTab === 'plan' && (
            <AdvancedSection title="Plan de Emergencias" description="Identificación, contenido estructurado, socialización y documento oficial">
              <Card style={{ padding: '1rem', marginBottom: '1rem' }}>
                <h4 style={{ margin: '0 0 0.75rem' }}>Identificación</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                  <div>
                    <label style={labelStyle}>Nombre del plan</label>
                    <input style={inputStyle} value={planForm.planName} disabled={!canWrite} onChange={(e) => setPlanForm({ ...planForm, planName: e.target.value })} />
                  </div>
                  <div>
                    <label style={labelStyle}>Versión</label>
                    <input style={inputStyle} value={planForm.version} disabled={!canWrite} onChange={(e) => setPlanForm({ ...planForm, version: e.target.value })} />
                  </div>
                  <div>
                    <label style={labelStyle}>Fecha de vigencia</label>
                    <input type="date" style={inputStyle} value={planForm.effectiveDate} disabled={!canWrite} onChange={(e) => setPlanForm({ ...planForm, effectiveDate: e.target.value })} />
                  </div>
                  <div>
                    <label style={labelStyle}>Fecha de vencimiento</label>
                    <input type="date" style={inputStyle} value={planForm.expirationDate} disabled={!canWrite} onChange={(e) => setPlanForm({ ...planForm, expirationDate: e.target.value })} />
                  </div>
                  <div>
                    <label style={labelStyle}>Aprobado por</label>
                    <input style={inputStyle} value={planForm.approvedBy} disabled={!canWrite} onChange={(e) => setPlanForm({ ...planForm, approvedBy: e.target.value })} />
                  </div>
                </div>
              </Card>

              <Card style={{ padding: '1rem', marginBottom: '1rem' }}>
                <h4 style={{ margin: '0 0 0.75rem' }}>Contenido estructurado</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.75rem' }}>
                  <div>
                    <label style={labelStyle}>Objetivos (uno por línea)</label>
                    <textarea style={{ ...inputStyle, minHeight: 90 }} value={planForm.objectivesText} disabled={!canWrite} onChange={(e) => setPlanForm({ ...planForm, objectivesText: e.target.value })} />
                  </div>
                  <div>
                    <label style={labelStyle}>Acciones preventivas (una por línea)</label>
                    <textarea style={{ ...inputStyle, minHeight: 90 }} value={planForm.preventiveActionsText} disabled={!canWrite} onChange={(e) => setPlanForm({ ...planForm, preventiveActionsText: e.target.value })} />
                  </div>
                  <div>
                    <label style={labelStyle}>Alcance (sedes, áreas, personal cubierto)</label>
                    <textarea style={{ ...inputStyle, minHeight: 90 }} value={planForm.scope} disabled={!canWrite} onChange={(e) => setPlanForm({ ...planForm, scope: e.target.value })} />
                  </div>
                  <div>
                    <label style={labelStyle}>Procedimiento general de respuesta</label>
                    <textarea style={{ ...inputStyle, minHeight: 90 }} value={planForm.generalResponseProcedure} disabled={!canWrite} onChange={(e) => setPlanForm({ ...planForm, generalResponseProcedure: e.target.value })} />
                  </div>
                  <div>
                    <label style={labelStyle}>Mecanismo de actualización</label>
                    <textarea style={{ ...inputStyle, minHeight: 90 }} value={planForm.updateMechanism} disabled={!canWrite} onChange={(e) => setPlanForm({ ...planForm, updateMechanism: e.target.value })} />
                  </div>
                </div>
              </Card>

              <Card style={{ padding: '1rem', marginBottom: '1rem' }}>
                <h4 style={{ margin: '0 0 0.75rem' }}>Socialización</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                  <div>
                    <label style={labelStyle}>Fecha</label>
                    <input type="date" style={inputStyle} value={planForm.socializationDate} disabled={!canWrite} onChange={(e) => setPlanForm({ ...planForm, socializationDate: e.target.value })} />
                  </div>
                  <div>
                    <label style={labelStyle}>Cobertura (%)</label>
                    <input type="number" min={0} max={100} style={inputStyle} value={planForm.coveragePercentage} disabled={!canWrite} onChange={(e) => setPlanForm({ ...planForm, coveragePercentage: e.target.value })} />
                  </div>
                  <div>
                    <label style={labelStyle}>Participantes</label>
                    <input style={inputStyle} value={planForm.socializationParticipants} disabled={!canWrite} onChange={(e) => setPlanForm({ ...planForm, socializationParticipants: e.target.value })} />
                  </div>
                  <div>
                    <label style={labelStyle}>Evidencias (URL, una por línea)</label>
                    <textarea style={{ ...inputStyle, minHeight: 60 }} value={planForm.socializationEvidenceText} disabled={!canWrite} onChange={(e) => setPlanForm({ ...planForm, socializationEvidenceText: e.target.value })} />
                  </div>
                  <div>
                    <label style={labelStyle}>Observaciones</label>
                    <textarea style={{ ...inputStyle, minHeight: 60 }} value={planForm.socializationObservations} disabled={!canWrite} onChange={(e) => setPlanForm({ ...planForm, socializationObservations: e.target.value })} />
                  </div>
                </div>
              </Card>

              <Card style={{ padding: '1rem', marginBottom: '1rem' }}>
                <h4 style={{ margin: '0 0 0.75rem' }}>Documento oficial</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                  <div>
                    <label style={labelStyle}>Documento oficial en Gestión Documental (tipo EMERGENCY_PLAN)</label>
                    {canWrite ? (
                      <select
                        style={inputStyle}
                        value={planForm.documentId}
                        onChange={(e) => setPlanForm({ ...planForm, documentId: e.target.value })}
                      >
                        <option value="">— Sin documento oficial seleccionado —</option>
                        {emergencyDocs.map((d) => (
                          <option key={d._id} value={d._id}>{d.code} — {d.name} (v{d.version})</option>
                        ))}
                      </select>
                    ) : (
                      <input style={inputStyle} value={planForm.documentId} disabled readOnly />
                    )}
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#718096' }}>
                      {emergencyDocs.length === 0
                        ? 'No hay documentos EMERGENCY_PLAN en Gestión Documental. Se pueden registrar desde Gestión Documental.'
                        : 'Solo se listan documentos de tipo EMERGENCY_PLAN de la empresa; el servidor valida existencia, tenant y tipo.'}
                    </p>
                  </div>
                  <div>
                    <label style={labelStyle}>URL de referencia</label>
                    <input style={inputStyle} value={planForm.documentUrl} disabled={!canWrite} onChange={(e) => setPlanForm({ ...planForm, documentUrl: e.target.value })} />
                  </div>
                </div>
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: '#718096' }}>
                  El vínculo es referencial: la aprobación y el versionado del documento oficial se gestionan en Gestión Documental (flujo existente).
                </p>
              </Card>

              {canWrite && (
                <Button onClick={() => void handleSavePlan()} disabled={actionLoading}>💾 Guardar Plan</Button>
              )}
            </AdvancedSection>
          )}

          {/* AMENAZAS (Etapa 1) */}
          {activeTab === 'amenazas' && (
            <AdvancedSection title="Amenazas y Vulnerabilidades" description="Matriz de escenarios de emergencia evaluados (probabilidad × impacto)">
              {canWrite && (
                <div style={{ marginBottom: '1rem' }}>
                  <Button onClick={openNewThreat}>➕ Nueva Amenaza</Button>
                </div>
              )}
              {threats.length === 0 ? (
                <p style={{ color: '#718096', textAlign: 'center', padding: '2rem' }}>No hay amenazas evaluadas. Agrega la primera para iniciar la matriz.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Escenario</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Amenaza</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Vulnerabilidad</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Probabilidad</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Impacto</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Nivel de riesgo</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Estado</th>
                        {canWrite && <th style={{ padding: '0.75rem', textAlign: 'center' }}>Acciones</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {threats.map((t) => (
                        <tr key={t.threatId} style={{ borderBottom: '1px solid #e2e8f0', background: t.active ? undefined : '#f7fafc' }}>
                          <td style={{ padding: '0.75rem' }}>{t.scenario}</td>
                          <td style={{ padding: '0.75rem' }}>{t.threat}</td>
                          <td style={{ padding: '0.75rem' }}>{t.vulnerability || '—'}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{PROBABILITY_LABEL[t.probability] ?? t.probability}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{IMPACT_LABEL[t.impact] ?? t.impact}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{riskLevelBadge(t.riskLevel)}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{activeBadge(t.active, { on: 'Activa', off: 'Inactiva' })}</td>
                          {canWrite && (
                            <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                                <Button variant="ghost" onClick={() => openEditThreat(t)}>✏️ Editar</Button>
                                <Button variant="ghost" onClick={() => void handleToggleThreat(t)}>{t.active ? '🚫 Desactivar' : '✅ Activar'}</Button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </AdvancedSection>
          )}

          {/* CONTACTOS Y CADENA DE LLAMADAS (Etapa 2) */}
          {activeTab === 'contactos' && (
            <AdvancedSection title="Contactos y Cadena de Llamadas" description="Contactos de emergencia ordenados por prioridad de llamada">
              {canWrite && (
                <div style={{ marginBottom: '1rem' }}>
                  <Button onClick={openNewContact}>➕ Nuevo Contacto</Button>
                </div>
              )}
              {contacts.length === 0 ? (
                <p style={{ color: '#718096', textAlign: 'center', padding: '2rem' }}>No hay contactos de emergencia registrados.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Orden</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Tipo</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Nombre</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Teléfono</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Notas</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Estado</th>
                        {canWrite && <th style={{ padding: '0.75rem', textAlign: 'center' }}>Acciones</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {[...contacts].sort((a, b) => a.callOrder - b.callOrder).map((c) => (
                        <tr key={c.contactId} style={{ borderBottom: '1px solid #e2e8f0', background: c.active ? undefined : '#f7fafc' }}>
                          <td style={{ padding: '0.75rem', textAlign: 'center', fontWeight: 600 }}>{c.callOrder}</td>
                          <td style={{ padding: '0.75rem' }}>{CONTACT_TYPE_LABEL[c.type] ?? c.type}</td>
                          <td style={{ padding: '0.75rem' }}>{c.name}</td>
                          <td style={{ padding: '0.75rem' }}>{c.phone}{c.secondaryPhone ? ` · ${c.secondaryPhone}` : ''}</td>
                          <td style={{ padding: '0.75rem' }}>{c.notes || '—'}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{activeBadge(c.active, { on: 'Activo', off: 'Inactivo' })}</td>
                          {canWrite && (
                            <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                                <Button variant="ghost" onClick={() => openEditContact(c)}>✏️ Editar</Button>
                                <Button variant="ghost" onClick={() => void handleToggleContact(c)}>{c.active ? '🚫 Desactivar' : '✅ Activar'}</Button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p style={{ margin: '0.75rem 0 0', fontSize: '0.75rem', color: '#718096' }}>
                La cadena de llamadas indica el orden de contacto ante una emergencia: 1 = contacto principal, 2 = secundario, etc.
              </p>
            </AdvancedSection>
          )}

          {/* BRIGADAS (Etapa 2: miembros tipados → Employee) */}
          {activeTab === 'brigadas' && (
            <AdvancedSection title="Brigadas de Emergencias" description="Conformación, funciones, suplentes y capacitación de brigadistas">
              {canWrite && (
                <div style={{ marginBottom: '1rem' }}>
                  <Button onClick={openNewBrigade}>➕ Nueva Brigada</Button>
                </div>
              )}
              {visibleBrigades.length === 0 ? (
                <p style={{ color: '#718096', textAlign: 'center', padding: '2rem' }}>No hay brigadas activas configuradas.</p>
              ) : (
                <div style={{ display: 'grid', gap: '1.25rem' }}>
                  {visibleBrigades.map((b) => {
                    const members = b.typedMembers ?? [];
                    const activeMembers = members.filter((m) => m.active);
                    const titulars = activeMembers.filter((m) => !m.isAlternate);
                    const alternates = activeMembers.filter((m) => m.isAlternate);
                    const lastTraining = activeMembers
                      .map((m) => m.trainingDate)
                      .filter(Boolean)
                      .sort()
                      .reverse()[0];
                    return (
                      <Card key={b.brigadeId} style={{ padding: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                          <div>
                            <h4 style={{ margin: '0 0 0.25rem' }}>{b.name}</h4>
                            <p style={{ margin: 0, fontSize: '0.875rem', color: '#4a5568' }}>
                              <strong>Tipo:</strong> {b.type} · <strong>Líder:</strong> {b.leader || '—'} · <strong>Reuniones:</strong> {b.meetingFrequency}
                              {b.lastMeetingDate ? ` · Última: ${new Date(b.lastMeetingDate).toLocaleDateString('es-CO')}` : ''}
                            </p>
                            <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#718096' }}>
                              Titulares: {titulars.length} · Suplentes: {alternates.length}
                              {lastTraining ? ` · Última capacitación: ${new Date(lastTraining).toLocaleDateString('es-CO')}` : ' · Sin capacitación registrada'}
                            </p>
                          </div>
                          {canWrite && (
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                              <Button onClick={() => openNewMember(b.brigadeId)}>➕ Agregar brigadista</Button>
                              <Button variant="ghost" onClick={() => openEditBrigade(b)}>✏️ Editar</Button>
                              <Button variant="ghost" onClick={() => void handleToggleBrigade(b)}>🚫</Button>
                            </div>
                          )}
                        </div>

                        {members.length === 0 ? (
                          <p style={{ margin: 0, fontSize: '0.875rem', color: '#718096' }}>Sin brigadistas registrados en la estructura nueva.</p>
                        ) : (
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                              <thead>
                                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                                  <th style={{ padding: '0.5rem', textAlign: 'left' }}>Brigadista</th>
                                  <th style={{ padding: '0.5rem', textAlign: 'left' }}>Función</th>
                                  <th style={{ padding: '0.5rem', textAlign: 'center' }}>Titular/Suplente</th>
                                  <th style={{ padding: '0.5rem', textAlign: 'center' }}>Capacitación</th>
                                  <th style={{ padding: '0.5rem', textAlign: 'center' }}>Estado</th>
                                  {canWrite && <th style={{ padding: '0.5rem', textAlign: 'center' }}>Acciones</th>}
                                </tr>
                              </thead>
                              <tbody>
                                {members.map((m) => (
                                  <tr key={m.memberId} style={{ borderBottom: '1px solid #e2e8f0', background: m.active ? undefined : '#f7fafc' }}>
                                    <td style={{ padding: '0.5rem' }}>{m.employeeNameSnapshot}</td>
                                    <td style={{ padding: '0.5rem' }}>{BRIGADE_FUNCTION_LABEL[m.function] ?? m.function}</td>
                                    <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                      <span className={`badge ${m.isAlternate ? 'badge--info' : 'badge--success'}`}>{m.isAlternate ? 'Suplente' : 'Titular'}</span>
                                    </td>
                                    <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                      {m.trainingDate ? `${new Date(m.trainingDate).toLocaleDateString('es-CO')}${m.trainingType ? ` (${m.trainingType})` : ''}` : '—'}
                                    </td>
                                    <td style={{ padding: '0.5rem', textAlign: 'center' }}>{activeBadge(m.active, { on: 'Activo', off: 'Inactivo' })}</td>
                                    {canWrite && (
                                      <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                                          <Button variant="ghost" onClick={() => openEditMember(b.brigadeId, m)}>✏️</Button>
                                          {m.active && <Button variant="ghost" onClick={() => void handleDeactivateMember(b.brigadeId, m.memberId)}>🚫</Button>}
                                        </div>
                                      </td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {(b.members?.length ?? 0) > 0 && (
                          <div style={{ marginTop: '0.75rem' }}>
                            <p style={{ margin: '0 0 0.25rem', fontSize: '0.8rem', color: '#b7791f' }}>Miembros legacy (registro histórico por nombre):</p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                              {b.members.map((name, i) => (
                                <span key={`${b.brigadeId}-legacy-${i}`} className="badge badge--warning">Miembro legacy: {name}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </AdvancedSection>
          )}

          {/* PUNTOS DE ENCUENTRO (Etapa 2: responsable + conteo) */}
          {activeTab === 'puntos' && (
            <AdvancedSection title="Puntos de Encuentro" description="Puntos de reunión con responsable y conteo de evacuación">
              {canWrite && (
                <div style={{ marginBottom: '1rem' }}>
                  <Button onClick={openNewPoint}>➕ Nuevo Punto de Encuentro</Button>
                </div>
              )}
              {visibleMeetingPoints.length === 0 ? (
                <p style={{ color: '#718096', textAlign: 'center', padding: '2rem' }}>No hay puntos de encuentro activos.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Nombre</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Ubicación</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Capacidad</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Responsable</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Conteo esperado</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Conteos</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Estado</th>
                        {canWrite && <th style={{ padding: '0.75rem', textAlign: 'center' }}>Acciones</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleMeetingPoints.map((p) => (
                        <tr key={p.pointId} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '0.75rem' }}>{p.name}</td>
                          <td style={{ padding: '0.75rem' }}>{p.location || '—'}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{p.capacity}</td>
                          <td style={{ padding: '0.75rem' }}>{p.responsible || '—'}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{p.expectedCount ?? 0}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{p.counts?.length ?? 0}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{activeBadge(p.active, { on: 'Activo', off: 'Inactivo' })}</td>
                          {canWrite && (
                            <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                                <Button variant="ghost" onClick={() => setPointForm(pointToForm(p))}>✏️ Editar</Button>
                                <Button variant="ghost" onClick={() => { setCountForm({ ...EMPTY_COUNT_FORM, pointId: p.pointId, expectedCount: String(p.expectedCount ?? 0) }); setCountModalOpen(true); }}>🔢 Conteo</Button>
                                <Button variant="ghost" onClick={() => void handleTogglePoint(p)}>{p.active ? '🚫' : '✅'}</Button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </AdvancedSection>
          )}

          {/* RUTAS (Etapa 2: responsable, capacidad, salida, señalización) */}
          {activeTab === 'rutas' && (
            <AdvancedSection title="Rutas de Evacuación" description="Rutas con responsable, capacidad y señalización">
              {canWrite && (
                <div style={{ marginBottom: '1rem' }}>
                  <Button onClick={openNewRoute}>➕ Nueva Ruta</Button>
                </div>
              )}
              {visibleRoutes.length === 0 ? (
                <p style={{ color: '#718096', textAlign: 'center', padding: '2rem' }}>No hay rutas de evacuación activas.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Nombre</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Piso</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Responsable</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Capacidad</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Salida</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Tiempo</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Señalización</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Estado</th>
                        {canWrite && <th style={{ padding: '0.75rem', textAlign: 'center' }}>Acciones</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRoutes.map((r) => (
                        <tr key={r.routeId} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '0.75rem' }}>{r.name}</td>
                          <td style={{ padding: '0.75rem' }}>{r.floor || '—'}</td>
                          <td style={{ padding: '0.75rem' }}>{r.responsible || '—'}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{r.estimatedCapacity ?? 0}</td>
                          <td style={{ padding: '0.75rem' }}>{r.associatedExit || '—'}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{r.estimatedTimeMinutes} min</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{r.signageVerified ? '✅ Verificada' : '⏳ Sin verificar'}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{activeBadge(r.active, { on: 'Activa', off: 'Inactiva' })}</td>
                          {canWrite && (
                            <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                                <Button variant="ghost" onClick={() => setRouteForm(routeToForm(r))}>✏️ Editar</Button>
                                <Button variant="ghost" onClick={() => void handleToggleRoute(r)}>{r.active ? '🚫' : '✅'}</Button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </AdvancedSection>
          )}

          {/* RECURSOS (Etapa 2: tipología + filtros) */}
          {activeTab === 'equipos' && (
            <AdvancedSection title="Recursos de Emergencia" description="Inventario de preparación: extintores, botiquines, camillas, alarmas, señalización y kits">
              {canWrite && (
                <div style={{ marginBottom: '1rem' }}>
                  <Button onClick={openNewResource}>➕ Nuevo Recurso</Button>
                </div>
              )}
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                <select style={{ ...inputStyle, width: 'auto' }} value={resourceTypeFilter} onChange={(e) => setResourceTypeFilter(e.target.value)}>
                  <option value="">Todos los tipos</option>
                  {RESOURCE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <select style={{ ...inputStyle, width: 'auto' }} value={resourceStatusFilter} onChange={(e) => setResourceStatusFilter(e.target.value)}>
                  <option value="">Todos los estados</option>
                  {RESOURCE_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {filteredEquipment.length === 0 ? (
                <p style={{ color: '#718096', textAlign: 'center', padding: '2rem' }}>No hay recursos registrados con los filtros seleccionados.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Tipo</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Nombre</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Ubicación</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Cantidad</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Estado</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Próx. inspección</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEquipment.map((e) => {
                        const isExpired = e.nextInspectionDate && new Date(e.nextInspectionDate).getTime() < Date.now();
                        return (
                          <tr key={e.equipmentId} style={{ borderBottom: '1px solid #e2e8f0', background: isExpired ? '#fff5f5' : undefined }}>
                            <td style={{ padding: '0.75rem' }}>{e.resourceType ? (RESOURCE_TYPE_LABEL[e.resourceType] ?? e.resourceType) : (e.type || '—')}</td>
                            <td style={{ padding: '0.75rem' }}>{e.name}</td>
                            <td style={{ padding: '0.75rem' }}>{e.location || '—'}</td>
                            <td style={{ padding: '0.75rem', textAlign: 'center' }}>{e.quantity}</td>
                            <td style={{ padding: '0.75rem', textAlign: 'center' }}>{operationalStatusBadge(e)}</td>
                            <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                              {e.nextInspectionDate ? new Date(e.nextInspectionDate).toLocaleDateString('es-CO') : '—'}
                            </td>
                            <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                              {canWrite ? (
                                <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                                  <Button variant="ghost" onClick={() => openEditResource(e)}>✏️</Button>
                                  <Button variant="ghost" onClick={() => void handleToggleResource(e)}>{e.active ? '🚫' : '✅'}</Button>
                                </div>
                              ) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p style={{ margin: '0.75rem 0 0', fontSize: '0.75rem', color: '#718096' }}>
                Inventario de preparación ante emergencias. No genera registros de mantenimiento automáticos (4.2.5 es un módulo independiente).
              </p>
            </AdvancedSection>
          )}

          {/* SIMULACROS (Etapa 3: CRUD completo + vínculo opcional Plan Anual) */}
          {activeTab === 'simulacros' && (
            <AdvancedSection title="Simulacros de Evacuación" description="Historial de simulacros y ejercicios de evacuación">
              {canWrite && (
                <div style={{ marginBottom: '1rem' }}>
                  <Button onClick={openNewDrill}>➕ Nuevo Simulacro</Button>
                </div>
              )}
              {visibleDrills.length === 0 ? (
                <p style={{ color: '#718096', textAlign: 'center', padding: '2rem' }}>No hay simulacros activos registrados.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Nombre</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Tipo</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Fecha</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Participantes</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Duración</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Actividad PAC</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Estado</th>
                        {canWrite && <th style={{ padding: '0.75rem', textAlign: 'center' }}>Acciones</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleDrills.map((d) => {
                        const linkedActivity = drillForm.drillId === d.drillId
                          ? awpActivities.find((a) => a._id === drillForm.planActivityId)
                          : awpActivities.find((a) => a._id === d.planActivityId);
                        return (
                        <tr key={d.drillId} style={{ borderBottom: '1px solid #e2e8f0', background: d.active ? undefined : '#f7fafc' }}>
                          <td style={{ padding: '0.75rem' }}>{d.name}</td>
                          <td style={{ padding: '0.75rem' }}>{d.type}</td>
                          <td style={{ padding: '0.75rem' }}>{new Date(d.date).toLocaleDateString('es-CO')}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{d.participants}/{d.expectedParticipants}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{d.durationMinutes} min</td>
                          <td style={{ padding: '0.75rem', fontSize: '0.8rem', color: '#4a5568' }}>
                            {d.planActivityId ? (linkedActivity?.title ?? 'Actividad vinculada') : '—'}
                          </td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{drillStatusBadge(d.status)}</td>
                          {canWrite && (
                            <td style={{ padding: '0.75rem', textAlign: 'center' }}>
                              <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                                <Button variant="ghost" onClick={() => openEditDrill(d)}>✏️</Button>
                                <Button variant="ghost" onClick={() => void handleToggleDrill(d)}>{d.active ? '🚫' : '✅'}</Button>
                              </div>
                            </td>
                          )}
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </AdvancedSection>
          )}

          {/* HISTORIAL */}
          {activeTab === 'historial' && (
            <AdvancedSection title="Historial de Cambios" description="Registro de acciones en el módulo de emergencias">
              {history.length === 0 ? (
                <p style={{ color: '#718096', textAlign: 'center', padding: '2rem' }}>No hay historial registrado.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {[...history].reverse().map((entry, i) => (
                    <Card key={i} style={{ padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong>{entry.action}</strong>
                        <span style={{ color: '#718096', marginLeft: '0.5rem' }}>por {entry.userName || entry.userId}</span>
                        {entry.details && <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: '#4a5568' }}>{entry.details}</p>}
                      </div>
                      <span style={{ fontSize: '0.75rem', color: '#a0aec0' }}>{new Date(entry.timestamp).toLocaleString('es-CO')}</span>
                    </Card>
                  ))}
                </div>
              )}
            </AdvancedSection>
          )}

          {/* APROBACIÓN */}
          {activeTab === 'aprobacion' && (
            <AdvancedSection title="Aprobación del Plan de Emergencias" description="Enviar a aprobación o gestionar el estado actual">
              <Card style={{ padding: '1.5rem' }}>
                <h4 style={{ margin: '0 0 1rem' }}>Estado Actual</h4>
                <p style={{ margin: '0 0 0.5rem' }}><strong>Estado:</strong> {complianceBadge(data?.complianceStatus ?? 'PENDING')}</p>
                {data?.complianceReason && <p style={{ margin: '0 0 1rem', color: '#718096' }}>{data.complianceReason}</p>}
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {canSubmit && (
                    <>
                      <Button onClick={() => void handleSubmit()} disabled={actionLoading}>📤 Enviar a Aprobación</Button>
                      <Button onClick={() => void handleSavePlan()} variant="secondary" disabled={actionLoading}>💾 Guardar Cambios</Button>
                    </>
                  )}
                  {canDecide && (
                    <>
                      <Button onClick={() => void handleApprove()} variant="primary" disabled={actionLoading}>✅ Aprobar</Button>
                      <Button onClick={() => void handleReject()} variant="secondary" disabled={actionLoading} style={{ color: '#e53e3e' }}>❌ Rechazar</Button>
                    </>
                  )}
                </div>
              </Card>
            </AdvancedSection>
          )}
        </AdvancedTabsContent>
      </div>

      {/* MODAL BRIGADA (Etapa 3: captura completa) */}
      {brigadeModalOpen && (
        <Modal title={brigadeForm.brigadeId ? '✏️ Editar Brigada' : '➕ Nueva Brigada'} onClose={() => { setBrigadeModalOpen(false); setBrigadeForm(EMPTY_BRIGADE_FORM); }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
            <div>
              <label style={labelStyle}>Nombre *</label>
              <input style={inputStyle} value={brigadeForm.name} placeholder="Ej: Brigada de Evacuación Sede Principal" onChange={(e) => setBrigadeForm({ ...brigadeForm, name: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Tipo</label>
              <input style={inputStyle} value={brigadeForm.type} placeholder="Evacuación, Contra incendio…" onChange={(e) => setBrigadeForm({ ...brigadeForm, type: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Líder</label>
              <input style={inputStyle} value={brigadeForm.leader} onChange={(e) => setBrigadeForm({ ...brigadeForm, leader: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Frecuencia de reuniones</label>
              <input style={inputStyle} value={brigadeForm.meetingFrequency} placeholder="Mensual, Trimestral…" onChange={(e) => setBrigadeForm({ ...brigadeForm, meetingFrequency: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Última reunión</label>
              <input type="date" style={inputStyle} value={brigadeForm.lastMeetingDate} onChange={(e) => setBrigadeForm({ ...brigadeForm, lastMeetingDate: e.target.value })} />
            </div>
          </div>
          <p style={{ margin: '0.75rem 0 0', fontSize: '0.75rem', color: '#718096' }}>Los brigadistas se agregan después desde la tarjeta de la brigada (con referencia a Employee y snapshot generado en servidor).</p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <Button variant="secondary" onClick={() => { setBrigadeModalOpen(false); setBrigadeForm(EMPTY_BRIGADE_FORM); }}>Cancelar</Button>
            <Button onClick={() => void handleSaveBrigade()} disabled={actionLoading}>💾 Guardar</Button>
          </div>
        </Modal>
      )}

      {/* MODAL SIMULACRO (Etapa 3: CRUD + vínculo opcional Plan Anual) */}
      {drillModalOpen && (
        <Modal title={drillForm.drillId ? '✏️ Editar Simulacro' : '➕ Nuevo Simulacro'} onClose={() => { setDrillModalOpen(false); setDrillForm(EMPTY_DRILL_FORM); }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
            <div>
              <label style={labelStyle}>Nombre *</label>
              <input style={inputStyle} value={drillForm.name} placeholder="Ej: Simulacro de evacuación 2026-I" onChange={(e) => setDrillForm({ ...drillForm, name: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Tipo</label>
              <input style={inputStyle} value={drillForm.type} placeholder="Evacuación, Confiancimiento…" onChange={(e) => setDrillForm({ ...drillForm, type: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Fecha *</label>
              <input type="date" style={inputStyle} value={drillForm.date} onChange={(e) => setDrillForm({ ...drillForm, date: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Participantes</label>
              <input type="number" min={0} style={inputStyle} value={drillForm.participants} onChange={(e) => setDrillForm({ ...drillForm, participants: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Participantes esperados</label>
              <input type="number" min={0} style={inputStyle} value={drillForm.expectedParticipants} onChange={(e) => setDrillForm({ ...drillForm, expectedParticipants: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Duración (min)</label>
              <input type="number" min={0} style={inputStyle} value={drillForm.durationMinutes} onChange={(e) => setDrillForm({ ...drillForm, durationMinutes: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Estado</label>
              <select style={inputStyle} value={drillForm.status} onChange={(e) => setDrillForm({ ...drillForm, status: e.target.value })}>
                {DRILL_STATUS_CHOICES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Actividad del Plan Anual de Trabajo (opcional)</label>
              <select style={inputStyle} value={drillForm.planActivityId} onChange={(e) => setDrillForm({ ...drillForm, planActivityId: e.target.value })}>
                <option value="">— Sin actividad vinculada —</option>
                {awpActivities.map((a) => (
                  <option key={a._id} value={a._id}>{a.title} ({a.startDate.slice(0, 10)} → {a.endDate.slice(0, 10)})</option>
                ))}
              </select>
              {awpPlan ? null : <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#b7791f' }}>No hay Plan Anual vigente para vincular.</p>}
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Resultado</label>
              <textarea style={{ ...inputStyle, minHeight: 60 }} value={drillForm.results} onChange={(e) => setDrillForm({ ...drillForm, results: e.target.value })} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Hallazgos</label>
              <textarea style={{ ...inputStyle, minHeight: 60 }} value={drillForm.findings} onChange={(e) => setDrillForm({ ...drillForm, findings: e.target.value })} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Acciones de mejora</label>
              <textarea style={{ ...inputStyle, minHeight: 60 }} value={drillForm.improvements} onChange={(e) => setDrillForm({ ...drillForm, improvements: e.target.value })} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Evidencias (una URL por línea)</label>
              <textarea style={{ ...inputStyle, minHeight: 60 }} value={drillForm.evidenceText} onChange={(e) => setDrillForm({ ...drillForm, evidenceText: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <Button variant="secondary" onClick={() => { setDrillModalOpen(false); setDrillForm(EMPTY_DRILL_FORM); }}>Cancelar</Button>
            <Button onClick={() => void handleSaveDrill()} disabled={actionLoading}>💾 Guardar</Button>
          </div>
        </Modal>
      )}

      {/* MODAL AMENAZA */}
      {threatModalOpen && (
        <Modal title={threatForm.threatId ? '✏️ Editar Amenaza' : '➕ Nueva Amenaza'} onClose={() => { setThreatModalOpen(false); setThreatForm(EMPTY_THREAT_FORM); }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
            <div>
              <label style={labelStyle}>Escenario de emergencia *</label>
              <input style={inputStyle} value={threatForm.scenario} placeholder="Ej: Incendio en planta" onChange={(e) => setThreatForm({ ...threatForm, scenario: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Amenaza *</label>
              <input style={inputStyle} value={threatForm.threat} placeholder="Ej: Sobrecarga eléctrica" onChange={(e) => setThreatForm({ ...threatForm, threat: e.target.value })} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Descripción</label>
              <textarea style={{ ...inputStyle, minHeight: 60 }} value={threatForm.description} onChange={(e) => setThreatForm({ ...threatForm, description: e.target.value })} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Vulnerabilidad</label>
              <textarea style={{ ...inputStyle, minHeight: 60 }} value={threatForm.vulnerability} onChange={(e) => setThreatForm({ ...threatForm, vulnerability: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Personas expuestas</label>
              <input style={inputStyle} value={threatForm.exposedPeople} onChange={(e) => setThreatForm({ ...threatForm, exposedPeople: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Recursos expuestos</label>
              <input style={inputStyle} value={threatForm.exposedAssets} onChange={(e) => setThreatForm({ ...threatForm, exposedAssets: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Procesos expuestos</label>
              <input style={inputStyle} value={threatForm.exposedProcesses} onChange={(e) => setThreatForm({ ...threatForm, exposedProcesses: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Probabilidad</label>
              <select style={inputStyle} value={threatForm.probability} onChange={(e) => setThreatForm({ ...threatForm, probability: e.target.value as Probability })}>
                {PROBABILITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Impacto</label>
              <select style={inputStyle} value={threatForm.impact} onChange={(e) => setThreatForm({ ...threatForm, impact: e.target.value as Impact })}>
                {IMPACT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Medidas preventivas (una por línea)</label>
              <textarea style={{ ...inputStyle, minHeight: 60 }} value={threatForm.preventiveMeasuresText} onChange={(e) => setThreatForm({ ...threatForm, preventiveMeasuresText: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Medidas de respuesta (una por línea)</label>
              <textarea style={{ ...inputStyle, minHeight: 60 }} value={threatForm.responseMeasuresText} onChange={(e) => setThreatForm({ ...threatForm, responseMeasuresText: e.target.value })} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Procedimiento de respuesta del escenario</label>
              <textarea style={{ ...inputStyle, minHeight: 60 }} value={threatForm.responseProcedure} onChange={(e) => setThreatForm({ ...threatForm, responseProcedure: e.target.value })} />
            </div>
          </div>
          <p style={{ margin: '0.75rem 0 0', fontSize: '0.75rem', color: '#718096' }}>El nivel de riesgo se calcula automáticamente a partir de probabilidad × impacto.</p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <Button variant="secondary" onClick={() => { setThreatModalOpen(false); setThreatForm(EMPTY_THREAT_FORM); }}>Cancelar</Button>
            <Button onClick={() => void handleSaveThreat()} disabled={actionLoading}>💾 Guardar</Button>
          </div>
        </Modal>
      )}

      {/* MODAL CONTACTO */}
      {contactModalOpen && (
        <Modal title={contactForm.contactId ? '✏️ Editar Contacto' : '➕ Nuevo Contacto de Emergencia'} onClose={() => { setContactModalOpen(false); setContactForm(EMPTY_CONTACT_FORM); }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
            <div>
              <label style={labelStyle}>Tipo *</label>
              <select style={inputStyle} value={contactForm.type} onChange={(e) => setContactForm({ ...contactForm, type: e.target.value as ContactType })}>
                {CONTACT_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Nombre *</label>
              <input style={inputStyle} value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Teléfono principal *</label>
              <input style={inputStyle} value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Teléfono secundario</label>
              <input style={inputStyle} value={contactForm.secondaryPhone} onChange={(e) => setContactForm({ ...contactForm, secondaryPhone: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Orden en la cadena de llamadas (1 = principal)</label>
              <input type="number" min={1} max={99} style={inputStyle} value={contactForm.callOrder} onChange={(e) => setContactForm({ ...contactForm, callOrder: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Dirección</label>
              <input style={inputStyle} value={contactForm.address} onChange={(e) => setContactForm({ ...contactForm, address: e.target.value })} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Notas (horarios, contexto)</label>
              <textarea style={{ ...inputStyle, minHeight: 60 }} value={contactForm.notes} onChange={(e) => setContactForm({ ...contactForm, notes: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <Button variant="secondary" onClick={() => { setContactModalOpen(false); setContactForm(EMPTY_CONTACT_FORM); }}>Cancelar</Button>
            <Button onClick={() => void handleSaveContact()} disabled={actionLoading}>💾 Guardar</Button>
          </div>
        </Modal>
      )}

      {/* MODAL RECURSO */}
      {resourceModalOpen && (
        <Modal title={resourceForm.equipmentId ? '✏️ Editar Recurso' : '➕ Nuevo Recurso de Emergencia'} onClose={() => { setResourceModalOpen(false); setResourceForm(EMPTY_RESOURCE_FORM); }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
            <div>
              <label style={labelStyle}>Tipo de recurso *</label>
              <select style={inputStyle} value={resourceForm.resourceType} onChange={(e) => setResourceForm({ ...resourceForm, resourceType: e.target.value })}>
                <option value="">— (sin clasificar / legacy)</option>
                {RESOURCE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Nombre *</label>
              <input style={inputStyle} value={resourceForm.name} onChange={(e) => setResourceForm({ ...resourceForm, name: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Ubicación</label>
              <input style={inputStyle} value={resourceForm.location} onChange={(e) => setResourceForm({ ...resourceForm, location: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Cantidad</label>
              <input type="number" min={1} style={inputStyle} value={resourceForm.quantity} onChange={(e) => setResourceForm({ ...resourceForm, quantity: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Estado operativo</label>
              <select style={inputStyle} value={resourceForm.operationalStatus} onChange={(e) => setResourceForm({ ...resourceForm, operationalStatus: e.target.value })}>
                <option value="">— (sin cambiar / legacy)</option>
                {RESOURCE_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Última inspección</label>
              <input type="date" style={inputStyle} value={resourceForm.lastInspectionDate} onChange={(e) => setResourceForm({ ...resourceForm, lastInspectionDate: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Próxima inspección</label>
              <input type="date" style={inputStyle} value={resourceForm.nextInspectionDate} onChange={(e) => setResourceForm({ ...resourceForm, nextInspectionDate: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Evidencia (URL)</label>
              <input style={inputStyle} value={resourceForm.evidenceUrl} onChange={(e) => setResourceForm({ ...resourceForm, evidenceUrl: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <Button variant="secondary" onClick={() => { setResourceModalOpen(false); setResourceForm(EMPTY_RESOURCE_FORM); }}>Cancelar</Button>
            <Button onClick={() => void handleSaveResource()} disabled={actionLoading}>💾 Guardar</Button>
          </div>
        </Modal>
      )}

      {/* MODAL BRIGADISTA */}
      {memberModalOpen && (
        <Modal title={memberForm.memberId ? '✏️ Editar Brigadista' : '➕ Agregar Brigadista'} onClose={() => { setMemberModalOpen(false); setMemberForm(EMPTY_MEMBER_FORM); }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
            <div>
              <label style={labelStyle}>Trabajador (Employee) *</label>
              <select style={inputStyle} value={memberForm.employeeId} onChange={(e) => setMemberForm({ ...memberForm, employeeId: e.target.value })}>
                <option value="">Seleccionar empleado activo</option>
                {employees.map((emp) => <option key={emp._id} value={emp._id}>{emp.name} · {emp.document}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Función *</label>
              <select style={inputStyle} value={memberForm.function} onChange={(e) => setMemberForm({ ...memberForm, function: e.target.value as BrigadeFunction })}>
                {BRIGADE_FUNCTION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Condición</label>
              <select style={inputStyle} value={memberForm.isAlternate ? 'suplente' : 'titular'} onChange={(e) => setMemberForm({ ...memberForm, isAlternate: e.target.value === 'suplente' })}>
                <option value="titular">Titular</option>
                <option value="suplente">Suplente</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Fecha de capacitación</label>
              <input type="date" style={inputStyle} value={memberForm.trainingDate} onChange={(e) => setMemberForm({ ...memberForm, trainingDate: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Tipo de capacitación</label>
              <input style={inputStyle} value={memberForm.trainingType} placeholder="Ej: Brigada de emergencia, primeros auxilios" onChange={(e) => setMemberForm({ ...memberForm, trainingType: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Evidencia de capacitación (URL)</label>
              <input style={inputStyle} value={memberForm.trainingEvidence} onChange={(e) => setMemberForm({ ...memberForm, trainingEvidence: e.target.value })} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Observaciones</label>
              <textarea style={{ ...inputStyle, minHeight: 60 }} value={memberForm.observations} onChange={(e) => setMemberForm({ ...memberForm, observations: e.target.value })} />
            </div>
          </div>
          <p style={{ margin: '0.75rem 0 0', fontSize: '0.75rem', color: '#718096' }}>El nombre del brigadista se registra como snapshot histórico desde el empleado de la empresa.</p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <Button variant="secondary" onClick={() => { setMemberModalOpen(false); setMemberForm(EMPTY_MEMBER_FORM); }}>Cancelar</Button>
            <Button onClick={() => void handleSaveMember()} disabled={actionLoading}>💾 Guardar</Button>
          </div>
        </Modal>
      )}

      {/* MODAL RUTA */}
      {routeForm && (
        <Modal title={routeForm.routeId ? '✏️ Editar Ruta de Evacuación' : '➕ Nueva Ruta de Evacuación'} onClose={() => setRouteForm(null)}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
            <div>
              <label style={labelStyle}>Nombre *</label>
              <input style={inputStyle} value={routeForm.name} onChange={(e) => setRouteForm({ ...routeForm, name: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Piso</label>
              <input style={inputStyle} value={routeForm.floor} onChange={(e) => setRouteForm({ ...routeForm, floor: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Responsable</label>
              <input style={inputStyle} value={routeForm.responsible} onChange={(e) => setRouteForm({ ...routeForm, responsible: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Capacidad estimada (personas)</label>
              <input type="number" min={0} style={inputStyle} value={routeForm.estimatedCapacity} onChange={(e) => setRouteForm({ ...routeForm, estimatedCapacity: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Salida asociada</label>
              <input style={inputStyle} value={routeForm.associatedExit} onChange={(e) => setRouteForm({ ...routeForm, associatedExit: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Tiempo estimado (min)</label>
              <input type="number" min={1} style={inputStyle} value={routeForm.estimatedTimeMinutes} onChange={(e) => setRouteForm({ ...routeForm, estimatedTimeMinutes: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Señalización verificada</label>
              <select style={inputStyle} value={routeForm.signageVerified ? 'si' : 'no'} onChange={(e) => setRouteForm({ ...routeForm, signageVerified: e.target.value === 'si' })}>
                <option value="no">Sin verificar</option>
                <option value="si">Verificada</option>
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Descripción</label>
              <textarea style={{ ...inputStyle, minHeight: 60 }} value={routeForm.description} onChange={(e) => setRouteForm({ ...routeForm, description: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <Button variant="secondary" onClick={() => setRouteForm(null)}>Cancelar</Button>
            <Button onClick={() => void handleSaveRoute()} disabled={actionLoading}>💾 Guardar</Button>
          </div>
        </Modal>
      )}

      {/* MODAL PUNTO DE ENCUENTRO */}
      {pointForm && (
        <Modal title={pointForm.pointId ? '✏️ Editar Punto de Encuentro' : '➕ Nuevo Punto de Encuentro'} onClose={() => setPointForm(null)}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
            <div>
              <label style={labelStyle}>Nombre *</label>
              <input style={inputStyle} value={pointForm.name} onChange={(e) => setPointForm({ ...pointForm, name: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Ubicación</label>
              <input style={inputStyle} value={pointForm.location} onChange={(e) => setPointForm({ ...pointForm, location: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Capacidad</label>
              <input type="number" min={0} style={inputStyle} value={pointForm.capacity} onChange={(e) => setPointForm({ ...pointForm, capacity: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Responsable</label>
              <input style={inputStyle} value={pointForm.responsible} onChange={(e) => setPointForm({ ...pointForm, responsible: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Conteo esperado (personas asignadas)</label>
              <input type="number" min={0} style={inputStyle} value={pointForm.expectedCount} onChange={(e) => setPointForm({ ...pointForm, expectedCount: e.target.value })} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Procedimiento de conteo</label>
              <textarea style={{ ...inputStyle, minHeight: 60 }} value={pointForm.countProcedure} onChange={(e) => setPointForm({ ...pointForm, countProcedure: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <Button variant="secondary" onClick={() => setPointForm(null)}>Cancelar</Button>
            <Button onClick={() => void handleSavePoint()} disabled={actionLoading}>💾 Guardar</Button>
          </div>
        </Modal>
      )}

      {/* MODAL CONTEO DE EVACUACIÓN */}
      {countModalOpen && (
        <Modal title="🔢 Registrar Conteo de Evacuación" onClose={() => { setCountModalOpen(false); setCountForm(EMPTY_COUNT_FORM); }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
            <div>
              <label style={labelStyle}>Fecha *</label>
              <input type="date" style={inputStyle} value={countForm.date} onChange={(e) => setCountForm({ ...countForm, date: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Conteo esperado *</label>
              <input type="number" min={0} style={inputStyle} value={countForm.expectedCount} onChange={(e) => setCountForm({ ...countForm, expectedCount: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Conteo realizado *</label>
              <input type="number" min={0} style={inputStyle} value={countForm.actualCount} onChange={(e) => setCountForm({ ...countForm, actualCount: e.target.value })} />
            </div>
            <div>
              <label style={labelStyle}>Responsable del conteo</label>
              <input style={inputStyle} value={countForm.responsible} onChange={(e) => setCountForm({ ...countForm, responsible: e.target.value })} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Observaciones</label>
              <textarea style={{ ...inputStyle, minHeight: 60 }} value={countForm.observations} onChange={(e) => setCountForm({ ...countForm, observations: e.target.value })} />
            </div>
          </div>
          <p style={{ margin: '0.75rem 0 0', fontSize: '0.75rem', color: '#718096' }}>Las personas faltantes se calculan como esperado − realizado (mínimo 0).</p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <Button variant="secondary" onClick={() => { setCountModalOpen(false); setCountForm(EMPTY_COUNT_FORM); }}>Cancelar</Button>
            <Button onClick={() => void handleAddCount()} disabled={actionLoading}>💾 Registrar</Button>
          </div>
        </Modal>
      )}

      <div style={{ marginTop: '2rem', padding: '1rem', textAlign: 'center', color: '#a0aec0', fontSize: '0.75rem' }}>
        Módulo 5.1.1 — Plan de prevención, preparación y respuesta ante emergencias | Estándar SG-SST
      </div>
    </AdvancedPageLayout>
  );
}

export default EmergenciesPage;
