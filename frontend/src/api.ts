const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';
const ACTIVE_COMPANY_STORAGE_KEY = 'activeCompanyId';

export type UserRole = 'owner' | 'admin' | 'member' | 'manager';

export interface UserModel {
  _id: string;
  firebaseUid: string;
  email: string;
  companyId: string;
  role: UserRole;
}

export interface CompanyModel {
  _id: string;
  name: string;
  nit: string;
  standardsType?: string;
  economicSector?: string;
  ownerId: string;
}

export interface MyCompanyModel {
  id: string;
  name: string;
  nit: string;
}

export interface EvaluationModel {
  _id: string;
  companyId: string;
  standard: string;
  description: string;
  complies: boolean;
  observation?: string;
}

export interface ComplianceResponse {
  total: number;
  complies: number;
  percentage: number;
}


export interface DashboardResponse {
  employees: number;
  incidents: number;
  trainings: number;
  compliance: number;
  highRisks: number;
}

export type EvaluationStatus = 'CUMPLE' | 'NO_CUMPLE' | 'NO_APLICA';

export interface DashboardEvaluationModel {
  _id: string;
  code: string;
  status: EvaluationStatus;
  improvementPlan?: {
    activity?: string;
    responsible?: string;
    startDate?: string;
    endDate?: string;
    observations?: string;
  };
  weight?: number;
}

export interface InspectionActivityModel {
  _id: string;
  companyId: string;
  title: string;
  description: string;
  plannedDate: string;
  status: string;
  responsible?: string;
  frequency?: string;
  notes?: string;
  completedDate?: string;
}

export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface AlertModel {
  _id: string;
  companyId: string;
  type: string;
  message: string;
  severity: AlertSeverity;
  isRead: boolean;
  createdAt: string;
}


export interface RiskModel {
  _id: string;
  companyId: string;
  process: string;
  activity: string;
  hazard: string;
  risk: string;
  probability: number;
  consequence: number;
  riskLevel: number;
  controlMeasures: string;
}

export interface CreateRiskPayload {
  process: string;
  activity: string;
  hazard: string;
  risk: string;
  probability: number;
  consequence: number;
  controlMeasures: string;
}

export interface UpdateRiskPayload {
  process?: string;
  activity?: string;
  hazard?: string;
  risk?: string;
  probability?: number;
  consequence?: number;
  controlMeasures?: string;
}

export interface IncidentModel {
  _id: string;
  employeeId: string;
  companyId: string;
  type: string;
  date: string;
  description: string;
  severity: string;
  status: string;
}

export type AbsenteeismType = 'ENFERMEDAD' | 'ACCIDENTE' | 'PERMISO';

export interface AbsenteeismModel {
  _id: string;
  companyId: string;
  userId: string;
  tipo: AbsenteeismType;
  fechaInicio: string;
  fechaFin: string;
  dias: number;
  descripcion?: string;
  soporte?: string;
}

export interface AbsenteeismStats {
  totalDiasPerdidos: number;
  totalCasos: number;
  promedioDias: number;
}

export interface CreateAbsenteeismPayload {
  companyId: string;
  userId: string;
  tipo: AbsenteeismType;
  fechaInicio: string;
  fechaFin: string;
  descripcion?: string;
  soporte?: string;
}

export interface CreateIncidentPayload {
  employeeId: string;
  type: string;
  date: string;
  description: string;
  severity: string;
  status: string;
}

export interface UpdateIncidentPayload {
  employeeId?: string;
  type?: string;
  date?: string;
  description?: string;
  severity?: string;
  status?: string;
}


export interface TrainingModel {
  _id: string;
  companyId: string;
  copasstId?: string;
  topic: string;
  date: string;
  instructor: string;
  description: string;
  evidenceUrl?: string;
  attendanceControl?: {
    initialListUrl?: string;
    middleListUrl?: string;
    finalListUrl?: string;
  };
  media?: {
    videos?: string[];
    presentations?: string[];
    pdfs?: string[];
    images?: string[];
    supportMaterials?: string[];
  };
  structure?: {
    duration?: string;
    modality?: string;
    participants?: number;
  };
}

export interface CreateTrainingPayload {
  topic: string;
  date: string;
  instructor: string;
  description: string;
  evidenceUrl?: string;
  copasstId?: string;
  attendanceControl?: {
    initialListUrl?: string;
    middleListUrl?: string;
    finalListUrl?: string;
  };
  media?: {
    videos?: string[];
    presentations?: string[];
    pdfs?: string[];
    images?: string[];
    supportMaterials?: string[];
  };
  structure?: {
    duration?: string;
    modality?: string;
    participants?: number;
  };
}

export interface UpdateTrainingPayload extends Partial<CreateTrainingPayload> {}

export interface TrainingAttendanceModel {
  _id: string;
  trainingId: string;
  employeeId: EmployeeModel;
  companyId: string;
}

export interface CreateTrainingAttendancePayload {
  employeeId: string;
}

export interface DocumentUploadedByModel {
  _id: string;
  email: string;
}

export interface DocumentModel {
  _id: string;
  companyId: string;
  name: string;
  type: string;
  fileUrl: string;
  uploadedBy: DocumentUploadedByModel;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDocumentPayload {
  name: string;
  type?: string;
  file: File;
}

export interface TemplateUploadedByModel {
  _id: string;
  email: string;
}

export interface TemplateModel {
  _id: string;
  companyId: string;
  uploadedBy: TemplateUploadedByModel;
  name: string;
  originalFileName: string;
  fileUrl: string;
  storagePath: string;
  variables: string[];
  createdAt: string;
  updatedAt: string;
}

export interface UploadTemplatePayload {
  name: string;
  variables?: string[];
  file: File;
}

export interface GenerateTemplatePayload {
  data: Record<string, string | number | boolean | null>;
}

export interface UpdateTemplateVariablesPayload {
  variables: string[];
}

export interface TemplateVariableModel {
  name: string;
  label: string;
}

export interface EmployeeModel {
  _id: string;
  name: string;
  document: string;
  position: string;
  area: string;
  contractType: string;
  status: string;
  companyId: string;
}

export interface CreateEmployeePayload {
  name: string;
  document: string;
  position: string;
  area: string;
  contractType: string;
  status: string;
}



export interface BulkEmployeesResponse {
  inserted: number;
  failed: number;
  errors: Array<{
    row: number;
    message: string;
  }>;
}

interface UpdateEmployeePayload {
  name?: string;
  document?: string;
  position?: string;
  area?: string;
  contractType?: string;
  status?: string;
}

interface CreateUserPayload {
  email: string;
  password: string;
  role: UserRole;
  companyId?: string;
}

interface UpdateUserPayload {
  companyId?: string;
}

interface CreateCompanyPayload {
  name: string;
  nit: string;
  standardsType: string;
  economicSector: string;
}

interface UpdateCompanyPayload {
  name?: string;
  nit?: string;
  standardsType?: string;
  economicSector?: string;
}

interface CreateEvaluationPayload {
  companyId: string;
  standard: string;
  description: string;
  complies: boolean;
  observation?: string;
}

interface UpdateEvaluationPayload {
  complies?: boolean;
  observation?: string;
}

function withCompanyHeader(headers: HeadersInit = {}): HeadersInit {
  const companyId = localStorage.getItem(ACTIVE_COMPANY_STORAGE_KEY);

  return {
    ...headers,
    ...(companyId ? { 'x-company-id': companyId } : {}),
  };
}

async function apiFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: withCompanyHeader({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = data?.message ?? 'Error calling backend endpoint';
    throw new Error(Array.isArray(message) ? message.join(', ') : message);
  }

  return data as T;
}


async function apiFetchFormData<T>(path: string, token: string, body: FormData, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    body,
    headers: withCompanyHeader({
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = data?.message ?? 'Error calling backend endpoint';
    throw new Error(Array.isArray(message) ? message.join(', ') : message);
  }

  return data as T;
}

export function getActiveCompanyId(): string | null {
  return localStorage.getItem(ACTIVE_COMPANY_STORAGE_KEY);
}

export function setActiveCompanyId(companyId: string) {
  localStorage.setItem(ACTIVE_COMPANY_STORAGE_KEY, companyId);
}

export function clearActiveCompanyId() {
  localStorage.removeItem(ACTIVE_COMPANY_STORAGE_KEY);
}

export function fetchUserByFirebaseUid(uid: string, token: string) {
  return apiFetch<UserModel>(`/users/by-firebase/${uid}`, token, { method: 'GET' });
}

export function fetchMyCompanies(token: string) {
  return apiFetch<MyCompanyModel[]>('/companies/my-companies', token, { method: 'GET' });
}

export function fetchAdmins(token: string) {
  return apiFetch<UserModel[]>('/users/admins', token, { method: 'GET' });
}

export function createAdmin(token: string, payload: CreateUserPayload) {
  return apiFetch<UserModel>('/users/admins', token, { method: 'POST', body: JSON.stringify(payload) });
}

export function createUser(token: string, payload: CreateUserPayload) {
  return apiFetch<UserModel>('/users', token, { method: 'POST', body: JSON.stringify(payload) });
}

export function updateAdmin(token: string, id: string, payload: UpdateUserPayload) {
  return apiFetch<UserModel>(`/users/admins/${id}`, token, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function deleteAdmin(token: string, id: string) {
  return apiFetch<void>(`/users/admins/${id}`, token, { method: 'DELETE' });
}

export function fetchMembers(token: string) {
  return apiFetch<UserModel[]>('/users/members', token, { method: 'GET' });
}

export function createMember(token: string, payload: CreateUserPayload) {
  return apiFetch<UserModel>('/users/members', token, { method: 'POST', body: JSON.stringify(payload) });
}

export function updateMember(token: string, id: string, payload: UpdateUserPayload) {
  return apiFetch<UserModel>(`/users/members/${id}`, token, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function deleteMember(token: string, id: string) {
  return apiFetch<void>(`/users/members/${id}`, token, { method: 'DELETE' });
}

export function fetchCompanies(token: string) {
  return apiFetch<CompanyModel[]>('/companies', token, { method: 'GET' });
}

export function createCompany(token: string, payload: CreateCompanyPayload) {
  return apiFetch<CompanyModel>('/companies', token, { method: 'POST', body: JSON.stringify(payload) });
}

export function updateCompany(token: string, id: string, payload: UpdateCompanyPayload) {
  return apiFetch<CompanyModel>(`/companies/${id}`, token, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function deleteCompany(token: string, id: string) {
  return apiFetch<void>(`/companies/${id}`, token, { method: 'DELETE' });
}

export function fetchEvaluationsByCompany(token: string, companyId: string) {
  return apiFetch<EvaluationModel[]>(`/evaluations/company/${companyId}`, token, { method: 'GET' });
}

export function createEvaluation(token: string, payload: CreateEvaluationPayload) {
  return apiFetch<EvaluationModel>('/evaluations', token, { method: 'POST', body: JSON.stringify(payload) });
}

export function updateEvaluation(token: string, id: string, payload: UpdateEvaluationPayload) {
  return apiFetch<EvaluationModel>(`/evaluations/${id}`, token, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function fetchComplianceByCompany(token: string, companyId: string) {
  return apiFetch<ComplianceResponse>(`/evaluations/company/${companyId}/compliance`, token, { method: 'GET' });
}


export function fetchEmployees(token: string) {
  return apiFetch<EmployeeModel[]>('/employees', token, { method: 'GET' });
}

export function createEmployee(token: string, payload: CreateEmployeePayload) {
  return apiFetch<EmployeeModel>('/employees', token, { method: 'POST', body: JSON.stringify(payload) });
}

export function updateEmployee(token: string, id: string, payload: UpdateEmployeePayload) {
  return apiFetch<EmployeeModel>(`/employees/${id}`, token, { method: 'PATCH', body: JSON.stringify(payload) });
}


export function bulkCreateEmployees(token: string, payload: { employees: CreateEmployeePayload[] }) {
  return apiFetch<BulkEmployeesResponse>('/employees/bulk', token, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function deleteEmployee(token: string, id: string) {
  return apiFetch<void>(`/employees/${id}`, token, { method: 'DELETE' });
}

export function fetchRisks(token: string) {
  return apiFetch<RiskModel[]>('/risks', token, { method: 'GET' });
}

export function createRisk(token: string, payload: CreateRiskPayload) {
  return apiFetch<RiskModel>('/risks', token, { method: 'POST', body: JSON.stringify(payload) });
}

export function updateRisk(token: string, id: string, payload: UpdateRiskPayload) {
  return apiFetch<RiskModel>(`/risks/${id}`, token, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function deleteRisk(token: string, id: string) {
  return apiFetch<void>(`/risks/${id}`, token, { method: 'DELETE' });
}


export function fetchIncidents(token: string) {
  return apiFetch<IncidentModel[]>('/incidents', token, { method: 'GET' });
}

export function createIncident(token: string, payload: CreateIncidentPayload) {
  return apiFetch<IncidentModel>('/incidents', token, { method: 'POST', body: JSON.stringify(payload) });
}

export function updateIncident(token: string, id: string, payload: UpdateIncidentPayload) {
  return apiFetch<IncidentModel>(`/incidents/${id}`, token, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function deleteIncident(token: string, id: string) {
  return apiFetch<void>(`/incidents/${id}`, token, { method: 'DELETE' });
}

export function fetchAbsenteeismByCompany(token: string, companyId: string) {
  return apiFetch<AbsenteeismModel[]>(`/absenteeism/company/${companyId}`, token, { method: 'GET' });
}

export function fetchAbsenteeismStatsByCompany(token: string, companyId: string) {
  return apiFetch<AbsenteeismStats>(`/absenteeism/stats/company/${companyId}`, token, { method: 'GET' });
}

export function createAbsenteeism(token: string, payload: CreateAbsenteeismPayload) {
  return apiFetch<AbsenteeismModel>('/absenteeism', token, { method: 'POST', body: JSON.stringify(payload) });
}

export function deleteAbsenteeism(token: string, id: string) {
  return apiFetch<void>(`/absenteeism/${id}`, token, { method: 'DELETE' });
}


export function fetchDocuments(token: string) {
  return apiFetch<DocumentModel[]>('/documents', token, { method: 'GET' });
}

export function createDocument(token: string, payload: CreateDocumentPayload) {
  const formData = new FormData();
  formData.append('name', payload.name);

  if (payload.type) {
    formData.append('type', payload.type);
  }

  formData.append('file', payload.file);

  return apiFetchFormData<DocumentModel>('/documents', token, formData, { method: 'POST' });
}

export function fetchDocument(token: string, id: string) {
  return apiFetch<DocumentModel>(`/documents/${id}`, token, { method: 'GET' });
}

export function deleteDocument(token: string, id: string) {
  return apiFetch<void>(`/documents/${id}`, token, { method: 'DELETE' });
}



export function uploadTemplate(token: string, payload: UploadTemplatePayload) {
  const formData = new FormData();
  formData.append('name', payload.name);

  if (payload.variables) {
    payload.variables.forEach((variable) => formData.append('variables', variable));
  }

  formData.append('file', payload.file);

  return apiFetchFormData<TemplateModel>('/templates/upload', token, formData, { method: 'POST' });
}

export function fetchTemplatesByCompany(token: string, companyId: string) {
  return apiFetch<TemplateModel[]>(`/templates/company/${companyId}`, token, { method: 'GET' });
}

export function fetchTemplateVariables(token: string, templateId: string) {
  return apiFetch<TemplateVariableModel[]>(`/templates/${templateId}/variables`, token, { method: 'GET' });
}

export function updateTemplateVariables(token: string, templateId: string, payload: UpdateTemplateVariablesPayload) {
  return apiFetch<TemplateModel>(`/templates/${templateId}/variables`, token, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function generateTemplate(token: string, templateId: string, payload: GenerateTemplatePayload) {
  const response = await fetch(`${BACKEND_URL}/templates/generate/${templateId}`, {
    method: 'POST',
    headers: withCompanyHeader({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const message = data?.message ?? 'Error generating template document';
    throw new Error(Array.isArray(message) ? message.join(', ') : message);
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get('content-disposition');
  const matchedName = contentDisposition?.match(/filename="(.+)"/i)?.[1];

  return {
    blob,
    fileName: matchedName ?? `template-${templateId}.docx`,
  };
}

export function fetchTrainings(token: string) {
  return apiFetch<TrainingModel[]>('/trainings', token, { method: 'GET' });
}

export function fetchTraining(token: string, id: string) {
  return apiFetch<TrainingModel>(`/trainings/${id}`, token, { method: 'GET' });
}

export function createTraining(token: string, payload: CreateTrainingPayload) {
  return apiFetch<TrainingModel>('/trainings', token, { method: 'POST', body: JSON.stringify(payload) });
}

export function updateTraining(token: string, id: string, payload: UpdateTrainingPayload) {
  return apiFetch<TrainingModel>(`/trainings/${id}`, token, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function deleteTraining(token: string, id: string) {
  return apiFetch<void>(`/trainings/${id}`, token, { method: 'DELETE' });
}

export function fetchTrainingAttendance(token: string, trainingId: string) {
  return apiFetch<TrainingAttendanceModel[]>(`/trainings/${trainingId}/attendance`, token, { method: 'GET' });
}

export function createTrainingAttendance(token: string, trainingId: string, payload: CreateTrainingAttendancePayload) {
  return apiFetch<TrainingAttendanceModel>(`/trainings/${trainingId}/attendance`, token, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}


export function fetchDashboard(token: string) {
  return apiFetch<DashboardResponse>('/dashboard', token, { method: 'GET' });
}

export function fetchDashboardEvaluations(token: string, companyId: string) {
  const query = new URLSearchParams({ companyId });
  return apiFetch<DashboardEvaluationModel[]>(`/evaluations?${query.toString()}`, token, { method: 'GET' });
}

export function fetchInspectionScheduleByCompany(token: string, companyId: string) {
  return apiFetch<InspectionActivityModel[]>(`/inspection-schedule/company/${companyId}`, token, { method: 'GET' });
}

export function fetchInspectionActivities(token: string) {
  return apiFetch<InspectionActivityModel[]>('/inspections/activities', token, { method: 'GET' });
}

export function fetchAlertsByCompany(token: string, companyId: string) {
  return apiFetch<AlertModel[]>(`/alerts/company/${companyId}`, token, { method: 'GET' });
}

export function markAlertAsRead(token: string, id: string) {
  return apiFetch<AlertModel>(`/alerts/${id}/read`, token, { method: 'PATCH' });
}

export function deleteAlert(token: string, id: string) {
  return apiFetch<void>(`/alerts/${id}`, token, { method: 'DELETE' });
}

export type ResponsableSstComplianceStatus = 'COMPLIES' | 'PENDING' | 'NON_COMPLIANT';
export type ResponsableSstDocumentType = 'DIPLOMA' | 'FIFTY_HOUR_CERTIFICATE' | 'TWENTY_HOUR_UPDATE_CERTIFICATE';

export interface ResponsableSstStoredDocumentModel {
  type: ResponsableSstDocumentType;
  fileName: string;
  fileUrl: string;
  detectedDate?: string;
  uploadedAt?: string;
}

export interface ResponsableSstAuditEntryModel {
  userId?: string;
  userEmail?: string;
  changedAt: string;
  field: string;
  oldValue?: string;
  newValue?: string;
  warning?: string;
}

export interface ResponsableSstAlertEntryModel {
  type: string;
  message: string;
  severity: AlertSeverity;
  dueAt: string;
  generated: boolean;
}

export interface ResponsableSstAdvancedModel {
  _id: string;
  companyId: string;
  itemCode: string;
  fullName: string;
  documentNumber: string;
  position: string;
  profession: string;
  sstProfessionalType: string;
  sstLicenseNumber: string;
  licenseExpiresAt?: string;
  course50HoursDate?: string;
  course50HoursDetectedDate?: string;
  course20HoursDate?: string;
  requires20HourUpdate: boolean;
  documents: ResponsableSstStoredDocumentModel[];
  alerts: ResponsableSstAlertEntryModel[];
  auditHistory: ResponsableSstAuditEntryModel[];
  complianceStatus: ResponsableSstComplianceStatus;
  complianceReason: string;
  updatedAt: string;
}

export interface UpdateResponsableSstAdvancedPayload {
  fullName: string;
  documentNumber: string;
  position: string;
  profession: string;
  sstProfessionalType: string;
  sstLicenseNumber: string;
  licenseExpiresAt: string;
  course50HoursDate: string;
  course50HoursDetectedDate?: string;
  course20HoursDate?: string;
}

export interface UploadResponsableSstDocumentPayload {
  type: ResponsableSstDocumentType;
  file: File;
  finalUserDate?: string;
}


export type ComplianceCredentialCourseType = 'COURSE_50_HOURS' | 'COURSE_20_HOURS';
export type ComplianceCredentialStatus = 'Vigente' | 'Próximo a vencer' | 'Vencido';
export type ComplianceCredentialValidationStatus = 'VALID' | 'PENDING_20H' | 'MISSING_DOCUMENTS' | 'INVALID';
export type ComplianceResponsibleStatus = 'ACTIVE' | 'INACTIVE';
export type ComplianceResponsibleType = 'Coordinador SST' | 'Líder SST' | 'Profesional SST' | 'Tecnólogo SST' | 'Responsable SG-SST';

export interface ComplianceCredentialModel {
  _id: string;
  companyId: string;
  itemCode: string;
  responsibleUserId?: string;
  courseType: ComplianceCredentialCourseType;
  trainingEntity: string;
  certificateNumber: string;
  courseDate?: string;
  expirationDate?: string;
  status: ComplianceCredentialStatus;
  comments: string;
  requires20HourCourse: boolean;
  relatedFiftyHourCredentialId?: string;
  relatedTwentyHourCredentialId?: string;
  validationStatus: ComplianceCredentialValidationStatus;
  phvaComplianceStatus: ResponsableSstComplianceStatus;
  phvaComplianceReason: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ComplianceCredentialResponsibleModel {
  _id: string;
  employeeId: string | EmployeeModel;
  responsibleType: ComplianceResponsibleType;
  status: ComplianceResponsibleStatus;
  comments?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ComplianceCredentialDocumentModel {
  _id: string;
  credentialId: string;
  courseType: ComplianceCredentialCourseType;
  fileName: string;
  fileUrl: string;
  storagePath?: string;
  mimeType?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ComplianceCredentialOcrModel {
  _id: string;
  credentialId: string;
  documentId: string;
  extractedCourseDate?: string;
  originalOCRDate?: string;
  modifiedDate?: string;
  extractedCertificateNumber?: string;
  extractedTrainingEntity?: string;
  confidence?: number;
  hasManualDateModification: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ComplianceCredentialAlertModel {
  _id: string;
  credentialId?: string;
  type: 'expiration' | 'missing_documents' | 'missing_20h_course' | 'manual_ocr_modification';
  message: string;
  severity: 'info' | 'warning' | 'critical';
  dueAt?: string;
  generated: boolean;
  resolved: boolean;
  createdAt?: string;
}

export interface ComplianceCredentialHistoryModel {
  _id: string;
  credentialId?: string;
  action: 'upload' | 'edit' | 'ocr_change' | 'expiration_update' | 'responsible_change' | 'validation_change';
  field: string;
  oldValue?: string;
  newValue?: string;
  details?: string;
  createdAt?: string;
}

export interface ComplianceCredentialValidationModel {
  _id: string;
  status: ComplianceCredentialValidationStatus;
  reason: string;
  requires20HourCourse: boolean;
  hasRequired20HourCourse: boolean;
  hasDocuments: boolean;
  hasActiveResponsible: boolean;
  phvaComplianceStatus: ResponsableSstComplianceStatus;
  createdAt?: string;
}

export interface ComplianceCredentialDetailModel {
  credential: ComplianceCredentialModel;
  documents: ComplianceCredentialDocumentModel[];
  ocrData: ComplianceCredentialOcrModel[];
  alerts: ComplianceCredentialAlertModel[];
  validations: ComplianceCredentialValidationModel[];
  history: ComplianceCredentialHistoryModel[];
}

export interface UpsertComplianceCredentialPayload {
  responsibleUserId?: string;
  courseType: ComplianceCredentialCourseType;
  trainingEntity?: string;
  certificateNumber?: string;
  courseDate?: string;
  expirationDate?: string;
  comments?: string;
  relatedFiftyHourCredentialId?: string;
}

export interface AttachComplianceCredentialDocumentPayload {
  credentialId: string;
  fileName: string;
  fileUrl: string;
  storagePath?: string;
  mimeType?: string;
  ocrCourseDate?: string;
  ocrCertificateNumber?: string;
  ocrTrainingEntity?: string;
  rawOcrText?: string;
}

export function fetchResponsableSstAdvanced(token: string) {
  return apiFetch<ResponsableSstAdvancedModel>('/phva-advanced/responsable-sst', token, { method: 'GET' });
}

export function updateResponsableSstAdvanced(token: string, payload: UpdateResponsableSstAdvancedPayload) {
  return apiFetch<ResponsableSstAdvancedModel>('/phva-advanced/responsable-sst', token, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function uploadResponsableSstDocument(token: string, payload: UploadResponsableSstDocumentPayload) {
  const formData = new FormData();
  formData.append('type', payload.type);
  if (payload.finalUserDate) formData.append('finalUserDate', payload.finalUserDate);
  formData.append('file', payload.file);

  return apiFetchFormData<ResponsableSstAdvancedModel>('/phva-advanced/responsable-sst/documents', token, formData, { method: 'POST' });
}

export function fetchResponsableSstAudit(token: string) {
  return apiFetch<ResponsableSstAuditEntryModel[]>('/phva-advanced/responsable-sst/audit', token, { method: 'GET' });
}


export const fetchComplianceCredentials = (token: string) => apiFetch<ComplianceCredentialModel[]>('/compliance-credentials', token, { method: 'GET' });
export const fetchComplianceCredential = (token: string, id: string) => apiFetch<ComplianceCredentialDetailModel>(`/compliance-credentials/${id}`, token, { method: 'GET' });
export const createComplianceCredential = (token: string, payload: UpsertComplianceCredentialPayload) => apiFetch<ComplianceCredentialModel>('/compliance-credentials', token, { method: 'POST', body: JSON.stringify(payload) });
export const updateComplianceCredential = (token: string, id: string, payload: Partial<UpsertComplianceCredentialPayload>) => apiFetch<ComplianceCredentialModel>(`/compliance-credentials/${id}`, token, { method: 'PATCH', body: JSON.stringify(payload) });
export const listComplianceResponsibles = (token: string) => apiFetch<ComplianceCredentialResponsibleModel[]>('/compliance-credentials/responsibles/list', token, { method: 'GET' });
export const addComplianceResponsible = (token: string, payload: { employeeId: string; responsibleType: ComplianceResponsibleType; comments?: string }) => apiFetch<ComplianceCredentialResponsibleModel>('/compliance-credentials/responsibles', token, { method: 'POST', body: JSON.stringify(payload) });
export const updateComplianceResponsible = (token: string, id: string, payload: { responsibleType?: ComplianceResponsibleType; comments?: string }) => apiFetch<ComplianceCredentialResponsibleModel>(`/compliance-credentials/responsibles/${id}`, token, { method: 'PATCH', body: JSON.stringify(payload) });
export const deactivateComplianceResponsible = (token: string, id: string) => apiFetch<ComplianceCredentialResponsibleModel>(`/compliance-credentials/responsibles/${id}/deactivate`, token, { method: 'PATCH' });
export const removeComplianceResponsible = (token: string, id: string) => apiFetch<void>(`/compliance-credentials/responsibles/${id}`, token, { method: 'DELETE' });
export const attachComplianceCredentialDocument = (token: string, payload: AttachComplianceCredentialDocumentPayload) => apiFetch<{ document: ComplianceCredentialDocumentModel; ocr: ComplianceCredentialOcrModel }>('/compliance-credentials/documents', token, { method: 'POST', body: JSON.stringify(payload) });
export const updateComplianceCredentialOcrDate = (token: string, payload: { ocrDataId: string; modifiedDate: string }) => apiFetch<ComplianceCredentialOcrModel>('/compliance-credentials/ocr/date', token, { method: 'PATCH', body: JSON.stringify(payload) });

export interface ResponsibilityRowModel {
  title: string;
  category: string;
  role: string;
  employeeId?: string;
  active: boolean;
  requiresSignature: boolean;
  status: string;
  signature?: { accepted?: boolean; signatureImage?: string; signedAt?: string; signedBy?: string; version?: number; pdfUrl?: string };
}

export interface ResponsibilitiesAdvancedModel {
  _id: string;
  itemCode: string;
  responsibilities: ResponsibilityRowModel[];
  alerts: string[];
  complianceStatus: ResponsableSstComplianceStatus;
  complianceReason: string;
}

export function fetchResponsibilitiesAdvanced(token: string) {
  return apiFetch<ResponsibilitiesAdvancedModel>('/phva-advanced/responsibilities', token, { method: 'GET' });
}

export function updateResponsibilitiesAdvanced(token: string, responsibilities: ResponsibilityRowModel[]) {
  return apiFetch<ResponsibilitiesAdvancedModel>('/phva-advanced/responsibilities', token, { method: 'PATCH', body: JSON.stringify({ responsibilities }) });
}

export interface ResourceAssignmentAdvancedModel {
  _id: string;
  itemCode: string;
  financialResources: Array<{ concept: string; description?: string; value?: number; status?: string; responsible?: string; date?: string }>;
  humanResources: Array<{ employeeId: string; role: string; responsibilities?: string[]; active?: boolean }>;
  technicalResources: Array<{ name: string; status?: string; quantity?: number; responsible?: string; maintenanceDate?: string }>;
  activities: Array<{ name: string; frequency?: string; assignedUsers?: string[]; plannedHours?: number; completionStatus?: string }>;
  evidences: Array<{ fileName: string; fileUrl: string }>;
  approval: { approved?: boolean; signatureImage?: string; signedAt?: string; signedBy?: string; version?: number; pdfUrl?: string };
  alerts: string[];
  complianceStatus: ResponsableSstComplianceStatus;
  complianceReason: string;
}

export function fetchResourceAssignmentAdvanced(token: string) {
  return apiFetch<ResourceAssignmentAdvancedModel>('/phva-advanced/resource-assignment', token, { method: 'GET' });
}

export function updateResourceAssignmentAdvanced(token: string, payload: Partial<ResourceAssignmentAdvancedModel>) {
  return apiFetch<ResourceAssignmentAdvancedModel>('/phva-advanced/resource-assignment', token, { method: 'PATCH', body: JSON.stringify(payload) });
}

export interface ArlAffiliationsAdvancedModel {
  _id: string;
  itemCode: string;
  employees: Array<{ employeeId: string; employeeName: string; document?: string; position?: string; arlName?: string; riskClass?: string; affiliationStatus?: string; affiliationDate?: string; retirementDate?: string; socialSecurityActive?: boolean; evidences?: string[]; workCenter?: string; contractType?: string }>;
  companyDocuments: Array<{ type: string; fileName: string; fileUrl: string; uploadedAt?: string }>;
  socialSecurityPeriods: Array<{ period: string; paymentDate?: string; status?: string; supportDocument?: string; observations?: string }>;
  alerts: string[];
  complianceStatus: ResponsableSstComplianceStatus;
}

export function fetchArlAffiliationsAdvanced(token: string) {
  return apiFetch<ArlAffiliationsAdvancedModel>('/phva-advanced/arl-affiliations', token, { method: 'GET' });
}

export function updateArlAffiliationsAdvanced(token: string, payload: Partial<ArlAffiliationsAdvancedModel>) {
  return apiFetch<ArlAffiliationsAdvancedModel>('/phva-advanced/arl-affiliations', token, { method: 'PATCH', body: JSON.stringify(payload) });
}

export interface SpecialPensionAdvancedModel {
  _id: string;
  itemCode: string;
  enabled: boolean;
  records: Array<{ employeeId: string; employeeName: string; position?: string; highRiskType?: string; requiresSpecialContribution?: boolean; contributionStatus?: string; startDate?: string; observations?: string; supportDocument?: string }>;
  documents: Array<{ type: string; fileName: string; fileUrl: string; uploadedAt?: string }>;
  alerts: string[];
  warnings: string[];
  complianceStatus: ResponsableSstComplianceStatus;
}

export function fetchSpecialPensionAdvanced(token: string) {
  return apiFetch<SpecialPensionAdvancedModel>('/phva-advanced/special-pension', token, { method: 'GET' });
}

export function updateSpecialPensionAdvanced(token: string, payload: Partial<SpecialPensionAdvancedModel>) {
  return apiFetch<SpecialPensionAdvancedModel>('/phva-advanced/special-pension', token, { method: 'PATCH', body: JSON.stringify(payload) });
}


export interface TrainingManagementAdvancedModel {
  _id: string; itemCode: string; annualProgram: any[]; inductions: any[]; reinductions: any[]; trainings: any[]; attendanceEvidence: string[]; signatureEvidence: string[]; alerts: string[]; history: any[]; approval: { status: 'PENDING'|'APPROVED'|'REJECTED'|'ADJUSTMENTS_REQUESTED'; approvedBy?: string; approvedAt?: string; comments?: string; version: number; }; complianceStatus: ResponsableSstComplianceStatus;
}
export const fetchTrainingManagementAdvanced = (token: string) => apiFetch<TrainingManagementAdvancedModel>('/phva-advanced/training-management', token, { method: 'GET' });
export const updateTrainingManagementAdvanced = (token: string, payload: Partial<TrainingManagementAdvancedModel>) => apiFetch<TrainingManagementAdvancedModel>('/phva-advanced/training-management', token, { method: 'PATCH', body: JSON.stringify(payload) });
export const approveTrainingManagementAdvanced = (token: string, payload: { status: 'APPROVED'|'REJECTED'|'ADJUSTMENTS_REQUESTED'; comments?: string }) => apiFetch<TrainingManagementAdvancedModel>('/phva-advanced/training-management/approval', token, { method: 'PATCH', body: JSON.stringify(payload) });
export interface CopasstPeriodModel { _id: string; periodName: string; startDate: string; endDate: string; status: 'ACTIVO'|'PROXIMO_A_VENCER'|'VENCIDO'|'ARCHIVADO'; members: Array<{ userId: string; userName: string; committeeRole: string; representationType: string; principalType: string; startDate: string; endDate: string; status: string }>; candidates: Array<{ name: string; document: string; phone: string; area: string; position: string; motivation: string; accepted: boolean; votes: number }>; meetings: Array<{ meetingDate: string; status: string; attendees: string[]; commitments: string[] }>; documents: Array<{ type: string; title: string; version: number; generatedAt: string }>; auditHistory: Array<{ action: string; createdBy: string; createdAt: string; data: string }>; }
export const fetchCopasstCurrent = (token: string) => apiFetch<CopasstPeriodModel>('/copasst/current', token, { method: 'GET' });
export const createCopasstPeriod = (token: string, payload: { periodName: string; startDate: string }) => apiFetch<CopasstPeriodModel>('/copasst/periods', token, { method: 'POST', body: JSON.stringify(payload) });
export const addCopasstMember = (token: string, periodId: string, payload: { userId: string; userName: string; committeeRole: string; representationType: string; principalType: string; startDate: string }) => apiFetch<CopasstPeriodModel>(`/copasst/periods/${periodId}/members`, token, { method: 'POST', body: JSON.stringify(payload) });
export const registerCopasstCandidate = (periodId: string, payload: { name: string; document: string; phone: string; area: string; position: string; motivation: string; accepted: boolean; photoUrl?: string }) => apiFetch<CopasstPeriodModel>(`/copasst/periods/${periodId}/candidates`, '', { method: 'POST', body: JSON.stringify(payload) });
export const sendCopasstOtp = (payload: { electionId: string; document: string; phone: string }) => apiFetch<{ sent: boolean }>('/copasst/elections/otp', '', { method: 'POST', body: JSON.stringify(payload) });
export const voteCopasst = (payload: { electionId: string; document: string; phone: string; otpCode: string; candidateDocument: string }) => apiFetch('/copasst/elections/vote', '', { method: 'POST', body: JSON.stringify(payload) });
export const fetchCopasstResults = (periodId: string) => apiFetch<{ totalVotes:number; participation:number; winners:any[]; alternates:any[] }>(`/copasst/periods/${periodId}/results`, '', { method: 'GET' });

export interface CommitteePeriodModel extends CopasstPeriodModel { committeeType?: 'COPASST'|'CONVIVENCIA'|'BRIGADA'|'OTHER'; regulations?: Array<Record<string, unknown>>; confidentiality?: Array<Record<string, unknown>>; commitments?: Array<Record<string, unknown>>; }
export const fetchCommitteeCurrent = (token: string, committeeType: 'COPASST'|'CONVIVENCIA'|'BRIGADA'|'OTHER') => apiFetch<CommitteePeriodModel>(`/committee-engine/${committeeType}/current`, token, { method: 'GET' });
export const createCommitteePeriod = (token: string, payload: { periodName: string; startDate: string; committeeType: 'COPASST'|'CONVIVENCIA'|'BRIGADA'|'OTHER' }) => apiFetch<CommitteePeriodModel>('/committee-engine/periods', token, { method: 'POST', body: JSON.stringify(payload) });
export const addCommitteeMember = (token: string, periodId: string, payload: { userId: string; userName: string; committeeRole: string; representationType: string; principalType: string; startDate: string }) => apiFetch<CommitteePeriodModel>(`/committee-engine/periods/${periodId}/members`, token, { method: 'POST', body: JSON.stringify(payload) });
export const fetchCommitteeResults = (periodId: string) => apiFetch<{ totalVotes:number; participation:number; winners:any[]; alternates:any[] }>(`/committee-engine/periods/${periodId}/results`, '', { method: 'GET' });

export type SstPolicyStatus = 'Borrador' | 'Pendiente aprobación' | 'Aprobado' | 'Vencido' | 'Archivado';
export type PolicySignatureStatus = 'Pendiente firma' | 'Firmado' | 'Rechazado';
export type PolicySocializationStatus = 'Pendiente' | 'Leído' | 'Firmado digitalmente';

export interface PolicyVersionModel {
  version: string;
  content: string;
  status: SstPolicyStatus;
  issuedAt?: string;
  approvedAt?: string;
  expiresAt?: string;
  archived: boolean;
}

export interface PolicySignatureModel {
  role: string;
  signerName: string;
  signerEmail: string;
  required: boolean;
  status: PolicySignatureStatus;
  signedAt?: string;
  evidence?: string;
  rejectionReason?: string;
}

export interface PolicySocializationModel {
  employeeId?: string;
  employeeName: string;
  area?: string;
  status: PolicySocializationStatus;
  readAt?: string;
  signedAt?: string;
  evidence?: string;
}

export interface PolicyAlertModel {
  type: string;
  message: string;
  recipients: string[];
  dueAt: string;
  generated: boolean;
}

export interface PolicyHistoryModel {
  userId?: string;
  userEmail?: string;
  action: string;
  date: string;
  previousValue?: string;
  newValue?: string;
}

export interface SstPolicyAdvancedModel {
  _id: string;
  companyId: string;
  itemCode: string;
  documentCode: string;
  documentName: string;
  currentVersion: string;
  status: SstPolicyStatus;
  content?: string;
  versions: PolicyVersionModel[];
  signatures: PolicySignatureModel[];
  socializations: PolicySocializationModel[];
  alerts: PolicyAlertModel[];
  history: PolicyHistoryModel[];
  complianceStatus: ResponsableSstComplianceStatus;
  complianceReason: string;
}

export interface PolicyMasterListRowModel {
  code: string;
  document: string;
  version: string;
  status: SstPolicyStatus;
  issuedAt?: string;
  expiresAt?: string;
  responsible: string;
}

export const fetchSstPolicyAdvanced = (token: string) => apiFetch<SstPolicyAdvancedModel>('/phva-advanced/sst-policy', token, { method: 'GET' });
export const generateSstPolicyAdvanced = (token: string) => apiFetch<SstPolicyAdvancedModel>('/phva-advanced/sst-policy/generate', token, { method: 'POST' });
export const updateSstPolicyAdvanced = (token: string, payload: Partial<SstPolicyAdvancedModel> & { issuedAt?: string; approvedAt?: string; expiresAt?: string }) => apiFetch<SstPolicyAdvancedModel>('/phva-advanced/sst-policy', token, { method: 'PATCH', body: JSON.stringify(payload) });
export const createSstPolicyVersionAdvanced = (token: string) => apiFetch<SstPolicyAdvancedModel>('/phva-advanced/sst-policy/versions', token, { method: 'POST' });
export const archiveSstPolicyVersionAdvanced = (token: string, version: string) => apiFetch<SstPolicyAdvancedModel>(`/phva-advanced/sst-policy/versions/${encodeURIComponent(version)}/archive`, token, { method: 'PATCH' });
export const updateSstPolicySignatureAdvanced = (token: string, payload: Partial<PolicySignatureModel> & { role: string }) => apiFetch<SstPolicyAdvancedModel>('/phva-advanced/sst-policy/signatures', token, { method: 'PATCH', body: JSON.stringify(payload) });
export const approveSstPolicyAdvanced = (token: string) => apiFetch<SstPolicyAdvancedModel>('/phva-advanced/sst-policy/approve', token, { method: 'POST' });
export const assignSstPolicySocializationAdvanced = (token: string, payload: { mode?: 'all' | 'selected' | 'area'; employeeIds?: string[]; area?: string }) => apiFetch<SstPolicyAdvancedModel>('/phva-advanced/sst-policy/socializations/assign', token, { method: 'POST', body: JSON.stringify(payload) });
export const updateSstPolicySocializationAdvanced = (token: string, payload: { employeeId: string; status: PolicySocializationStatus; evidence?: string }) => apiFetch<SstPolicyAdvancedModel>('/phva-advanced/sst-policy/socializations', token, { method: 'PATCH', body: JSON.stringify(payload) });
export const fetchSstPolicyMasterListAdvanced = (token: string) => apiFetch<PolicyMasterListRowModel[]>('/phva-advanced/sst-policy/master-list', token, { method: 'GET' });
export type SstObjectiveMeasurementMethod = 'MANUAL' | 'AUTOMATIC' | 'ACTIVITY_BASED';
export type SstObjectiveStatus = 'Not Started' | 'In Progress' | 'Completed' | 'Delayed' | 'Cancelled';
export type SstObjectiveActivityStatus = 'Pending' | 'In Progress' | 'Completed' | 'Delayed' | 'Cancelled';
export type SstObjectiveTaskPriority = 'Low' | 'Medium' | 'High' | 'Critical';
export type SstObjectiveAutomaticSource = 'MANUAL' | 'TRAININGS' | 'INSPECTIONS' | 'EMPLOYEES' | 'INCIDENTS';

export interface SstObjectiveEvidenceModel { evidenceId?: string; fileName: string; fileUrl?: string; fileType: string; uploadedBy?: string; uploadedAt?: string; }
export interface SstObjectiveSubtaskModel { subtaskId?: string; name: string; description?: string; status: SstObjectiveActivityStatus; progress: number; }
export interface SstObjectiveJustificationModel { justificationId?: string; reason: string; comments?: string; userId?: string; userEmail?: string; date?: string; }
export interface SstObjectiveRescheduleModel { requestId?: string; newDueDate: string; correctiveAction: string; comments?: string; status: string; managerComments?: string; reviewedBy?: string; reviewedAt?: string; }
export interface SstObjectiveTaskModel { taskId?: string; name: string; description?: string; relatedObjective?: string; relatedActivity?: string; responsibleUser: string; assignmentDate: string; dueDate: string; priority: SstObjectiveTaskPriority; estimatedCost?: number; notes?: string; status: SstObjectiveActivityStatus; progress: number; subtasks: SstObjectiveSubtaskModel[]; evidence: SstObjectiveEvidenceModel[]; justifications: SstObjectiveJustificationModel[]; reschedules: SstObjectiveRescheduleModel[]; lastProgressAt?: string; }
export interface SstObjectiveActivityModel {
  activityId?: string;
  name: string;
  responsible: string;
  dueDate: string;
  status: SstObjectiveActivityStatus;
  completedAt?: string;
  tasks: SstObjectiveTaskModel[];
}

export interface SstObjectiveExecutionLogModel { logId?: string; userId?: string; userEmail?: string; date?: string; progressNotes?: string; achievements?: string; difficulties?: string; observations?: string; nextActions?: string; }

export interface SstObjectiveItemModel {
  objectiveId: string;
  name: string;
  responsible: string;
  dueDate: string;
  active: boolean;
  measurementMethod: SstObjectiveMeasurementMethod;
  status: SstObjectiveStatus;
  currentProgress: number;
  targetProgress: number;
  indicator?: string;
  targetValue?: number;
  currentValue?: number;
  automaticSource?: SstObjectiveAutomaticSource;
  activities: SstObjectiveActivityModel[];
  executionLog: SstObjectiveExecutionLogModel[];
  lastUpdatedAt?: string;
}

export interface SstObjectiveAlertModel {
  type: string;
  objectiveId: string;
  message: string;
  recipients: string[];
  dueAt: string;
  generated: boolean;
}

export interface SstObjectiveHistoryModel {
  userId?: string;
  userEmail?: string;
  action: string;
  objectiveId: string;
  field: string;
  date: string;
  previousValue?: string;
  newValue?: string;
}

export interface SstObjectivesAdvancedModel {
  _id: string;
  companyId: string;
  itemCode: string;
  objectives: SstObjectiveItemModel[];
  alerts: SstObjectiveAlertModel[];
  history: SstObjectiveHistoryModel[];
  complianceStatus: ResponsableSstComplianceStatus;
  complianceReason: string;
}

export const fetchSstObjectivesAdvanced = (token: string) => apiFetch<SstObjectivesAdvancedModel>('/phva-advanced/sst-objectives', token, { method: 'GET' });
export const updateSstObjectivesAdvanced = (token: string, payload: Partial<SstObjectivesAdvancedModel>) => apiFetch<SstObjectivesAdvancedModel>('/phva-advanced/sst-objectives', token, { method: 'PATCH', body: JSON.stringify(payload) });
export const updateSstObjectiveProgressAdvanced = (token: string, objectiveId: string, payload: Partial<SstObjectiveItemModel>) => apiFetch<SstObjectivesAdvancedModel>(`/phva-advanced/sst-objectives/${encodeURIComponent(objectiveId)}/progress`, token, { method: 'PATCH', body: JSON.stringify(payload) });
export const updateSstObjectiveActivitiesAdvanced = (token: string, objectiveId: string, activities: SstObjectiveActivityModel[]) => apiFetch<SstObjectivesAdvancedModel>(`/phva-advanced/sst-objectives/${encodeURIComponent(objectiveId)}/activities`, token, { method: 'PATCH', body: JSON.stringify({ activities }) });
export const fetchAnnualWorkPlanAdvanced = (token: string) => apiFetch<SstObjectivesAdvancedModel>('/phva-advanced/annual-work-plan', token, { method: 'GET' });
export const updateAnnualWorkPlanAdvanced = (token: string, payload: Partial<SstObjectivesAdvancedModel>) => apiFetch<SstObjectivesAdvancedModel>('/phva-advanced/annual-work-plan', token, { method: 'PATCH', body: JSON.stringify(payload) });
export const updateAnnualWorkPlanActivitiesAdvanced = (token: string, objectiveId: string, activities: SstObjectiveActivityModel[]) => apiFetch<SstObjectivesAdvancedModel>(`/phva-advanced/annual-work-plan/${encodeURIComponent(objectiveId)}/activities`, token, { method: 'PATCH', body: JSON.stringify({ activities }) });

// ==================== DOCUMENT MANAGEMENT SYSTEM API ====================

export type DocumentType =
  | 'POLICY' | 'PROCEDURE' | 'MANUAL' | 'FORMAT' | 'RECORD'
  | 'MEETING_MINUTES' | 'TRAINING_RECORD' | 'AUDIT' | 'INSPECTION'
  | 'EMERGENCY_PLAN' | 'COPASST' | 'COMMITTEE' | 'LEGAL_DOCUMENT'
  | 'MEDICAL_RECORD' | 'CONTRACTOR_RECORD' | 'OTHER';

export type DocumentStatus =
  | 'DRAFT' | 'UNDER_REVIEW' | 'PENDING_APPROVAL' | 'APPROVED'
  | 'ACTIVE' | 'OBSOLETE' | 'ARCHIVED';

export type DocumentHistoryAction =
  | 'CREATE' | 'EDIT' | 'DELETE' | 'VERSION_CHANGE' | 'APPROVAL'
  | 'SIGNATURE' | 'ARCHIVE' | 'RESTORE' | 'STATUS_CHANGE' | 'DOWNLOAD' | 'REPLACEMENT';

export interface DocumentMasterModel {
  _id: string;
  companyId: string;
  code: string;
  name: string;
  description?: string;
  documentType: DocumentType;
  process?: string;
  version: number;
  status: DocumentStatus;
  ownerUser?: { _id: string; name?: string; email?: string } | string;
  approvalUser?: { _id: string; name?: string; email?: string } | string;
  approvalDate?: string;
  expirationDate?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentVersionModel {
  _id: string;
  documentId: string;
  versionNumber: number;
  fileUrl: string;
  uploadedBy?: { _id: string; name?: string; email?: string } | string;
  uploadDate?: string;
  changeDescription?: string;
  isCurrent: boolean;
  createdAt: string;
}

export interface DocumentHistoryModel {
  _id: string;
  companyId: string;
  documentId: string;
  userId: { _id: string; name?: string; email?: string } | string;
  action: DocumentHistoryAction;
  previousValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  description?: string;
  createdAt: string;
}

export interface DocumentApprovalModel {
  _id: string;
  companyId: string;
  documentId: string | DocumentMasterModel;
  requestedBy: { _id: string; name?: string; email?: string } | string;
  approvedBy?: { _id: string; name?: string; email?: string } | string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  comments?: string;
  rejectionReason?: string;
  approvedAt?: string;
  createdAt: string;
}

export interface DocumentSignatureModel {
  _id: string;
  companyId: string;
  documentId: string;
  userId: { _id: string; name?: string; email?: string } | string;
  signerName: string;
  signerEmail?: string;
  signatureHash?: string;
  signatureUrl?: string;
  comments?: string;
  isExecutiveSignature: boolean;
  createdAt: string;
}

export interface RetentionRuleModel {
  _id: string;
  companyId: string;
  documentType: DocumentType;
  retentionYears: number;
  description?: string;
  isActive: boolean;
}

export interface DocumentStatsModel {
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  active: number;
  expiringSoon: number;
  expired: number;
}

export interface DocumentSearchResult {
  documents: DocumentMasterModel[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ExpirationInfo {
  isExpired: boolean;
  retentionDate: string | null;
  daysUntilExpiration: number | null;
}

export function fetchDocumentsMaster(token: string) {
  return apiFetch<DocumentMasterModel[]>('/document-management', token, { method: 'GET' });
}

export function fetchDocumentMaster(token: string, id: string) {
  return apiFetch<DocumentMasterModel>(`/document-management/${id}`, token, { method: 'GET' });
}

export function createDocumentMaster(token: string, payload: {
  code: string;
  name: string;
  description?: string;
  documentType: DocumentType;
  process?: string;
  version?: number;
  status?: DocumentStatus;
  ownerUser?: string;
  approvalUser?: string;
  expirationDate?: string;
}) {
  return apiFetch<DocumentMasterModel>('/document-management', token, { method: 'POST', body: JSON.stringify(payload) });
}

export function updateDocumentMaster(token: string, id: string, payload: Record<string, unknown>) {
  return apiFetch<DocumentMasterModel>(`/document-management/${id}`, token, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function deleteDocumentMaster(token: string, id: string) {
  return apiFetch<void>(`/document-management/${id}`, token, { method: 'DELETE' });
}

export function changeDocumentStatus(token: string, id: string, status: DocumentStatus, reason?: string) {
  return apiFetch<DocumentMasterModel>(`/document-management/${id}/status`, token, { method: 'PATCH', body: JSON.stringify({ status, reason }) });
}

export function fetchDocumentStats(token: string) {
  return apiFetch<DocumentStatsModel>('/document-management/stats', token, { method: 'GET' });
}

export function searchDocuments(token: string, params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') query.append(key, String(value));
  });
  return apiFetch<DocumentSearchResult>(`/document-management/search?${query.toString()}`, token, { method: 'GET' });
}

export function uploadDocumentVersion(token: string, documentId: string, fileUrl: string, changeDescription?: string) {
  return apiFetch<{ document: DocumentMasterModel; version: DocumentVersionModel }>(
    `/document-management/${documentId}/versions`, token,
    { method: 'POST', body: JSON.stringify({ fileUrl, changeDescription }) },
  );
}

export function fetchDocumentVersions(token: string, documentId: string) {
  return apiFetch<DocumentVersionModel[]>(`/document-management/${documentId}/versions`, token, { method: 'GET' });
}

export function fetchDocumentHistory(token: string, documentId: string) {
  return apiFetch<DocumentHistoryModel[]>(`/document-management/${documentId}/history`, token, { method: 'GET' });
}

export function fetchAllHistory(token: string) {
  return apiFetch<DocumentHistoryModel[]>('/document-management/history/all', token, { method: 'GET' });
}

export function submitDocumentForApproval(token: string, documentId: string, comments?: string) {
  return apiFetch<DocumentApprovalModel>(
    `/document-management/${documentId}/submit-approval`, token,
    { method: 'POST', body: JSON.stringify({ comments }) },
  );
}

export function fetchPendingApprovals(token: string) {
  return apiFetch<DocumentApprovalModel[]>('/document-management/approvals/pending', token, { method: 'GET' });
}

export function fetchApprovalHistory(token: string) {
  return apiFetch<DocumentApprovalModel[]>('/document-management/approvals/history', token, { method: 'GET' });
}

export function approveDocument(token: string, approvalId: string, payload: {
  approvedBy: string;
  comments?: string;
  signatureHash?: string;
  signatureUrl?: string;
  signerName?: string;
  signerEmail?: string;
}) {
  return apiFetch<{ approval: DocumentApprovalModel; document: DocumentMasterModel }>(
    `/document-management/approvals/${approvalId}/approve`, token,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

export function rejectDocument(token: string, approvalId: string, rejectionReason: string, comments?: string) {
  return apiFetch<DocumentApprovalModel>(
    `/document-management/approvals/${approvalId}/reject`, token,
    { method: 'POST', body: JSON.stringify({ rejectionReason, comments }) },
  );
}

export function addDocumentSignature(token: string, documentId: string, payload: {
  signerName: string;
  signerEmail?: string;
  signatureHash?: string;
  signatureUrl?: string;
  comments?: string;
  isExecutiveSignature?: boolean;
}) {
  return apiFetch<DocumentSignatureModel>(
    `/document-management/${documentId}/signatures`, token,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

export function fetchDocumentSignatures(token: string, documentId: string) {
  return apiFetch<DocumentSignatureModel[]>(`/document-management/${documentId}/signatures`, token, { method: 'GET' });
}

export function fetchRetentionRules(token: string) {
  return apiFetch<RetentionRuleModel[]>('/document-management/retention-rules', token, { method: 'GET' });
}

export function createRetentionRule(token: string, payload: { documentType: DocumentType; retentionYears: number; description?: string }) {
  return apiFetch<RetentionRuleModel>('/document-management/retention-rules', token, { method: 'POST', body: JSON.stringify(payload) });
}

export function updateRetentionRule(token: string, documentType: DocumentType, payload: { retentionYears?: number; description?: string }) {
  return apiFetch<RetentionRuleModel>(`/document-management/retention-rules/${documentType}`, token, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function deleteRetentionRule(token: string, documentType: DocumentType) {
  return apiFetch<void>(`/document-management/retention-rules/${documentType}`, token, { method: 'DELETE' });
}

export function checkDocumentExpiration(token: string, documentId: string) {
  return apiFetch<ExpirationInfo>(`/document-management/${documentId}/expiration`, token, { method: 'GET' });
}

export function fetchExpiringDocuments(token: string, withinDays: number) {
  return apiFetch<DocumentMasterModel[]>(`/document-management/expiring/${withinDays}`, token, { method: 'GET' });
}

export function fetchExpiredDocuments(token: string) {
  return apiFetch<DocumentMasterModel[]>('/document-management/expired', token, { method: 'GET' });
}

export function triggerDocumentAlerts(token: string) {
  return apiFetch<{ message: string }>('/document-management/alerts/check', token, { method: 'POST' });
}


// ==================== COMMUNICATION / COMUNICACIÓN SG-SST API ====================

export type CommunicationType =
  | 'ANNOUNCEMENT' | 'CIRCULAR' | 'BULLETIN' | 'CAMPAIGN'
  | 'EMERGENCY_NOTICE' | 'POLICY_COMMUNICATION'
  | 'PROCEDURE_COMMUNICATION' | 'TRAINING_COMMUNICATION';

export type CommunicationPriority = 'INFORMATIVE' | 'IMPORTANT' | 'URGENT' | 'CRITICAL';

export type TargetAudienceType =
  | 'ALL_COMPANY' | 'AREA' | 'POSITION' | 'INDIVIDUAL'
  | 'COPASST' | 'COMMITTEE' | 'BRIGADE' | 'MANAGERS' | 'SST_TEAM';

export type CommunicationStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export type CommunicationCampaignStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export type SurveyQuestionType = 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'OPEN_TEXT';

export type SurveyStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED';

export type MailboxType = 'SUGGESTION' | 'COMPLAINT' | 'UNSAFE_ACT' | 'UNSAFE_CONDITION' | 'IMPROVEMENT_IDEA' | 'REPORT';

export type MailboxStatus = 'PENDING' | 'UNDER_REVIEW' | 'RESOLVED' | 'CLOSED';

export interface CommunicationModel {
  _id: string;
  companyId: string;
  title: string;
  body?: string;
  communicationType: CommunicationType;
  priority: CommunicationPriority;
  targetAudience: TargetAudienceType;
  targetIds: string[];
  status: CommunicationStatus;
  publishedAt?: string;
  scheduledAt?: string;
  expiresAt?: string;
  createdBy?: { _id: string } | string;
  createdByName?: string;
  linkedDocumentIds: string[];
  attachmentUrls: string[];
  requiresSignature: boolean;
  requiresSurvey: boolean;
  surveyId?: string;
  isFromAutoGeneration: boolean;
  autoGeneratedFromModule?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommunicationRecipientModel {
  _id: string;
  companyId: string;
  communicationId: string;
  employeeId: string;
  employeeName: string;
  employeeEmail?: string;
  status: 'PENDING' | 'DELIVERED' | 'READ' | 'SIGNED';
  deliveredAt?: string;
  readAt?: string;
  signedAt?: string;
}

export interface CommunicationReadReceiptModel {
  _id: string;
  companyId: string;
  communicationId: string;
  employeeId: string;
  employeeName: string;
  readDate: string;
  readTime: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface CommunicationSignatureModel {
  _id: string;
  companyId: string;
  communicationId: string;
  employeeId: string;
  employeeName: string;
  employeeEmail?: string;
  signatureDate: string;
  signatureHash?: string;
  signatureUrl?: string;
  comments?: string;
}

export interface CommunicationCampaignModel {
  _id: string;
  companyId: string;
  name: string;
  description?: string;
  status: CommunicationCampaignStatus;
  startDate?: string;
  endDate?: string;
  linkedCommunicationIds: string[];
  attachmentUrls: string[];
  tags: string[];
  totalReached: number;
  totalRead: number;
  totalSigned: number;
  createdAt: string;
}

export interface CommunicationSurveyQuestionModel {
  questionId: string;
  questionText: string;
  questionType: SurveyQuestionType;
  options: string[];
  required: boolean;
}

export interface CommunicationSurveyModel {
  _id: string;
  companyId: string;
  title: string;
  description?: string;
  status: SurveyStatus;
  questions: CommunicationSurveyQuestionModel[];
  communicationId?: string;
  startDate?: string;
  endDate?: string;
  totalResponses: number;
  totalInvited: number;
  createdAt: string;
}

export interface CommunicationSurveyResponseModel {
  _id: string;
  companyId: string;
  surveyId: string;
  employeeId: string;
  employeeName: string;
  answers: Array<{ questionId: string; answer?: string; selectedOptions: string[] }>;
  submittedAt: string;
  isAnonymous: boolean;
}

export interface CommunicationMailboxModel {
  _id: string;
  companyId: string;
  mailboxType: MailboxType;
  subject: string;
  message: string;
  isAnonymous: boolean;
  submittedBy?: string;
  submittedByName?: string;
  status: MailboxStatus;
  response?: string;
  respondedBy?: string;
  respondedAt?: string;
  attachmentUrls: string[];
  isPriority: boolean;
  createdAt: string;
}

export interface CommunicationDashboardModel {
  totalCommunications: number;
  published: number;
  drafts: number;
  unread: number;
  pendingSignatures: number;
  pendingSurveys: number;
  totalRecipients: number;
  totalRead: number;
  mailboxPending: number;
  campaignsActive: number;
  readRate: number;
}

export interface CommunicationAutoComplianceModel {
  complies: boolean;
  reasons: string[];
  score: number;
}

export function fetchCommunicationDashboard(token: string) {
  return apiFetch<CommunicationDashboardModel>('/communication/dashboard', token, { method: 'GET' });
}

export function fetchCommunicationAutoCompliance(token: string) {
  return apiFetch<CommunicationAutoComplianceModel>('/communication/auto-compliance', token, { method: 'GET' });
}

export function fetchCommunications(token: string) {
  return apiFetch<CommunicationModel[]>('/communication', token, { method: 'GET' });
}

export function createCommunication(token: string, payload: Partial<CommunicationModel>) {
  return apiFetch<CommunicationModel>('/communication', token, { method: 'POST', body: JSON.stringify(payload) });
}

export function updateCommunication(token: string, id: string, payload: Record<string, unknown>) {
  return apiFetch<CommunicationModel>(`/communication/${id}`, token, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function publishCommunication(token: string, id: string) {
  return apiFetch<CommunicationModel>(`/communication/${id}/publish`, token, { method: 'POST' });
}

export function archiveCommunication(token: string, id: string) {
  return apiFetch<CommunicationModel>(`/communication/${id}/archive`, token, { method: 'POST' });
}

export function deleteCommunication(token: string, id: string) {
  return apiFetch<void>(`/communication/${id}`, token, { method: 'DELETE' });
}

export function fetchCommunicationRecipients(token: string, id: string) {
  return apiFetch<CommunicationRecipientModel[]>(`/communication/${id}/recipients`, token, { method: 'GET' });
}

export function addCommunicationRecipients(token: string, id: string, employeeIds: string[]) {
  return apiFetch<CommunicationRecipientModel[]>(`/communication/${id}/recipients`, token, { method: 'POST', body: JSON.stringify({ employeeIds }) });
}

export function registerCommunicationRead(token: string, id: string, employeeId: string, employeeName: string) {
  return apiFetch<CommunicationReadReceiptModel>(`/communication/${id}/read`, token, { method: 'POST', body: JSON.stringify({ employeeId, employeeName }) });
}

export function fetchCommunicationReadReceipts(token: string, id: string) {
  return apiFetch<CommunicationReadReceiptModel[]>(`/communication/${id}/read-receipts`, token, { method: 'GET' });
}

export function signCommunication(token: string, id: string, payload: { employeeId: string; employeeName: string; employeeEmail: string; signatureHash?: string; signatureUrl?: string; comments?: string }) {
  return apiFetch<CommunicationSignatureModel>(`/communication/${id}/sign`, token, { method: 'POST', body: JSON.stringify(payload) });
}

export function fetchCommunicationSignatures(token: string, id: string) {
  return apiFetch<CommunicationSignatureModel[]>(`/communication/${id}/signatures`, token, { method: 'GET' });
}

export function fetchCommunicationCampaigns(token: string) {
  return apiFetch<CommunicationCampaignModel[]>('/communication/campaigns', token, { method: 'GET' });
}

export function createCommunicationCampaign(token: string, payload: Partial<CommunicationCampaignModel>) {
  return apiFetch<CommunicationCampaignModel>('/communication/campaigns', token, { method: 'POST', body: JSON.stringify(payload) });
}

export function updateCommunicationCampaign(token: string, id: string, payload: Record<string, unknown>) {
  return apiFetch<CommunicationCampaignModel>(`/communication/campaigns/${id}`, token, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function deleteCommunicationCampaign(token: string, id: string) {
  return apiFetch<void>(`/communication/campaigns/${id}`, token, { method: 'DELETE' });
}

export function fetchSurveys(token: string) {
  return apiFetch<CommunicationSurveyModel[]>('/communication/surveys', token, { method: 'GET' });
}

export function createSurvey(token: string, payload: Partial<CommunicationSurveyModel>) {
  return apiFetch<CommunicationSurveyModel>('/communication/surveys', token, { method: 'POST', body: JSON.stringify(payload) });
}

export function updateSurvey(token: string, id: string, payload: Record<string, unknown>) {
  return apiFetch<CommunicationSurveyModel>(`/communication/surveys/${id}`, token, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function deleteSurvey(token: string, id: string) {
  return apiFetch<void>(`/communication/surveys/${id}`, token, { method: 'DELETE' });
}

export function submitSurveyResponse(token: string, surveyId: string, payload: { employeeId: string; employeeName: string; answers: Array<{ questionId: string; answer?: string; selectedOptions: string[] }>; isAnonymous?: boolean }) {
  return apiFetch<CommunicationSurveyResponseModel>(`/communication/surveys/${surveyId}/respond`, token, { method: 'POST', body: JSON.stringify(payload) });
}

export function fetchSurveyResults(token: string, surveyId: string) {
  return apiFetch<{ survey: CommunicationSurveyModel; totalResponses: number; stats: any[] }>(`/communication/surveys/${surveyId}/results`, token, { method: 'GET' });
}

export function fetchSurveyStats(token: string, surveyId: string) {
  return apiFetch<{ total: number; participationRate: number }>(`/communication/surveys/${surveyId}/stats`, token, { method: 'GET' });
}

export function fetchMailbox(token: string, status?: string) {
  const q = status ? `?status=${status}` : '';
  return apiFetch<CommunicationMailboxModel[]>(`/communication/mailbox${q}`, token, { method: 'GET' });
}

export function createMailboxEntry(token: string, payload: { mailboxType: MailboxType; subject: string; message: string; isAnonymous?: boolean; employeeId?: string }) {
  return apiFetch<CommunicationMailboxModel>('/communication/mailbox', token, { method: 'POST', body: JSON.stringify(payload) });
}

export function respondMailbox(token: string, id: string, response: string, respondedBy: string) {
  return apiFetch<CommunicationMailboxModel>(`/communication/mailbox/${id}/respond`, token, { method: 'POST', body: JSON.stringify({ response, respondedBy }) });
}

export function deleteMailboxEntry(token: string, id: string) {
  return apiFetch<void>(`/communication/mailbox/${id}`, token, { method: 'DELETE' });
}

export function fetchCommunicationHistory(token: string, limit = 100, skip = 0) {
  return apiFetch<any[]>(`/communication/history?limit=${limit}&skip=${skip}`, token, { method: 'GET' });
}

export function triggerCommunicationAlerts(token: string) {
  return apiFetch<string[]>('/communication/check-alerts', token, { method: 'POST' });
}

// ==================== ACCOUNTABILITY / RENDICIÓN DE CUENTAS API ====================

export type AccountabilityReportType = 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUAL' | 'ANNUAL';
export type AccountabilityReportStatus = 'DRAFT' | 'GENERATED' | 'SIGNED' | 'ARCHIVED';
export type AccountabilityMeetingType = 'MONTHLY' | 'QUARTERLY' | 'EXTRAORDINARY';
export type AccountabilityMeetingStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
export type AccountabilityCommitmentPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type AccountabilityCommitmentStatus = 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE' | 'CANCELLED';

export interface AccountabilityReportModel {
  _id: string;
  companyId: string;
  reportNumber: string;
  reportType: AccountabilityReportType;
  periodStart: string;
  periodEnd: string;
  status: AccountabilityReportStatus;
  generatedBy?: { _id: string; name?: string; email?: string };
  signedBy?: { _id: string; name?: string; email?: string };
  signedAt?: string;
  executiveSummary: string;
  achievements: string;
  pendingActions: string;
  riskAreas: string;
  compliancePercentage: number;
  criticalFindings: string;
  recommendations: string;
  nextActions: string;
  documentId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountabilityMeetingModel {
  _id: string;
  companyId: string;
  title: string;
  date: string;
  time?: string;
  location?: string;
  meetingType: AccountabilityMeetingType;
  status: AccountabilityMeetingStatus;
  participants?: Array<{ _id: string; name?: string; email?: string }>;
  createdBy?: { _id: string; name?: string; email?: string };
  topicsDiscussed?: string;
  decisions?: string;
  minutesContent?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountabilityCommitmentModel {
  _id: string;
  companyId: string;
  title: string;
  description?: string;
  responsibleUser: { _id: string; name?: string; email?: string };
  dueDate: string;
  priority: AccountabilityCommitmentPriority;
  status: AccountabilityCommitmentStatus;
  meetingId?: { _id: string; title: string; date: string };
  justificationReason?: string;
  justificationCorrectiveAction?: string;
  justificationNewDate?: string;
  justificationStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  justificationApprovedBy?: { _id: string; name?: string; email?: string };
  createdAt: string;
  updatedAt: string;
}

export interface AccountabilityHistoryModel {
  _id: string;
  companyId: string;
  userId?: { _id: string; name?: string; email?: string } | string;
  userEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  previousValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  description: string;
  createdAt: string;
}

export interface AccountabilityDashboardModel {
  totalMeetings: number;
  completedMeetings: number;
  scheduledMeetings: number;
  totalReports: number;
  signedReports: number;
  draftReports: number;
  totalCommitments: number;
  openCommitments: number;
  overdueCommitments: number;
  completedCommitments: number;
  compliancePercentage: number;
}

export interface AutoComplianceModel {
  complies: boolean;
  reasons: string[];
  score: number;
}

export function fetchAccountabilityDashboard(token: string) {
  return apiFetch<AccountabilityDashboardModel>('/accountability/dashboard', token, { method: 'GET' });
}

export function fetchAutoCompliance(token: string) {
  return apiFetch<AutoComplianceModel>('/accountability/auto-compliance', token, { method: 'GET' });
}

export function fetchAccountabilityReports(token: string) {
  return apiFetch<AccountabilityReportModel[]>('/accountability/reports', token, { method: 'GET' });
}

export function fetchAccountabilityReportStats(token: string) {
  return apiFetch<{ total: number; byType: Record<string, number>; byStatus: Record<string, number>; signed: number; draft: number }>('/accountability/reports/stats', token, { method: 'GET' });
}

export function fetchAccountabilityReport(token: string, id: string) {
  return apiFetch<AccountabilityReportModel>(`/accountability/reports/${id}`, token, { method: 'GET' });
}

export function createAccountabilityReport(token: string, payload: {
  reportType: AccountabilityReportType;
  periodStart: string;
  periodEnd: string;
  executiveSummary?: string;
  achievements?: string;
  pendingActions?: string;
  riskAreas?: string;
  compliancePercentage?: number;
  criticalFindings?: string;
  recommendations?: string;
  nextActions?: string;
}) {
  return apiFetch<AccountabilityReportModel>('/accountability/reports', token, { method: 'POST', body: JSON.stringify(payload) });
}

export function createIndividualReport(token: string, payload: {
  activitiesPerformed: string;
  activitiesPending: string;
  difficulties?: string;
  correctiveActions?: string;
  recommendations?: string;
  observations?: string;
}) {
  return apiFetch<AccountabilityReportModel>('/accountability/reports/individual', token, { method: 'POST', body: JSON.stringify(payload) });
}

export function updateAccountabilityReport(token: string, id: string, payload: Record<string, unknown>) {
  return apiFetch<AccountabilityReportModel>(`/accountability/reports/${id}`, token, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function signAccountabilityReport(token: string, id: string, payload: { signedBy: string; signatureHash?: string; signatureUrl?: string }) {
  return apiFetch<AccountabilityReportModel>(`/accountability/reports/${id}/sign`, token, { method: 'POST', body: JSON.stringify(payload) });
}

export function archiveAccountabilityReport(token: string, id: string) {
  return apiFetch<AccountabilityReportModel>(`/accountability/reports/${id}/archive`, token, { method: 'POST' });
}

export function fetchAccountabilityMeetings(token: string) {
  return apiFetch<AccountabilityMeetingModel[]>('/accountability/meetings', token, { method: 'GET' });
}

export function fetchUpcomingMeetings(token: string, days = 30) {
  return apiFetch<AccountabilityMeetingModel[]>(`/accountability/meetings/upcoming?days=${days}`, token, { method: 'GET' });
}

export function fetchAccountabilityMeeting(token: string, id: string) {
  return apiFetch<AccountabilityMeetingModel>(`/accountability/meetings/${id}`, token, { method: 'GET' });
}

export function createAccountabilityMeeting(token: string, payload: {
  title: string;
  date: string;
  time?: string;
  location?: string;
  meetingType: AccountabilityMeetingType;
  participants?: string[];
  topicsDiscussed?: string;
  decisions?: string;
}) {
  return apiFetch<AccountabilityMeetingModel>('/accountability/meetings', token, { method: 'POST', body: JSON.stringify(payload) });
}

export function updateAccountabilityMeeting(token: string, id: string, payload: Record<string, unknown>) {
  return apiFetch<AccountabilityMeetingModel>(`/accountability/meetings/${id}`, token, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function completeAccountabilityMeeting(token: string, id: string, payload: { topicsDiscussed?: string; decisions?: string; minutesContent?: string }) {
  return apiFetch<AccountabilityMeetingModel>(`/accountability/meetings/${id}/complete`, token, { method: 'POST', body: JSON.stringify(payload) });
}

export function deleteAccountabilityMeeting(token: string, id: string) {
  return apiFetch<void>(`/accountability/meetings/${id}`, token, { method: 'DELETE' });
}

export function fetchAccountabilityCommitments(token: string) {
  return apiFetch<AccountabilityCommitmentModel[]>('/accountability/commitments', token, { method: 'GET' });
}

export function fetchCommitmentStats(token: string) {
  return apiFetch<{ total: number; open: number; inProgress: number; completed: number; overdue: number; cancelled: number }>('/accountability/commitments/stats', token, { method: 'GET' });
}

export function fetchMyCommitments(token: string) {
  return apiFetch<AccountabilityCommitmentModel[]>('/accountability/commitments/my', token, { method: 'GET' });
}

export function fetchCommitmentsByMeeting(token: string, meetingId: string) {
  return apiFetch<AccountabilityCommitmentModel[]>(`/accountability/commitments/meeting/${meetingId}`, token, { method: 'GET' });
}

export function createAccountabilityCommitment(token: string, payload: {
  title: string;
  description?: string;
  responsibleUser: string;
  dueDate: string;
  priority?: AccountabilityCommitmentPriority;
  meetingId?: string;
}) {
  return apiFetch<AccountabilityCommitmentModel>('/accountability/commitments', token, { method: 'POST', body: JSON.stringify(payload) });
}

export function updateAccountabilityCommitment(token: string, id: string, payload: Record<string, unknown>) {
  return apiFetch<AccountabilityCommitmentModel>(`/accountability/commitments/${id}`, token, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function completeAccountabilityCommitment(token: string, id: string) {
  return apiFetch<AccountabilityCommitmentModel>(`/accountability/commitments/${id}/complete`, token, { method: 'POST' });
}

export function submitCommitmentJustification(token: string, id: string, payload: { reason: string; correctiveAction?: string; newProposedDate?: string }) {
  return apiFetch<AccountabilityCommitmentModel>(`/accountability/commitments/${id}/justify`, token, { method: 'POST', body: JSON.stringify(payload) });
}

export function approveCommitmentJustification(token: string, id: string, payload: { approved: boolean; rejectionReason?: string }) {
  return apiFetch<AccountabilityCommitmentModel>(`/accountability/commitments/${id}/justify/approve`, token, { method: 'POST', body: JSON.stringify(payload) });
}

export function fetchAccountabilityHistory(token: string, limit = 100, skip = 0) {
  return apiFetch<AccountabilityHistoryModel[]>(`/accountability/history?limit=${limit}&skip=${skip}`, token, { method: 'GET' });
}

export function fetchAccountabilityEntityHistory(token: string, entityType: string, entityId: string) {
  return apiFetch<AccountabilityHistoryModel[]>(`/accountability/history/${entityType}/${entityId}`, token, { method: 'GET' });
}

export function checkAccountabilityAlerts(token: string) {
  return apiFetch<string[]>('/accountability/check-alerts', token, { method: 'POST' });
}

export function checkAccountabilityOverdue(token: string) {
  return apiFetch<{ message: string; overdueCount: number }>('/accountability/check-overdue', token, { method: 'POST' });
}


// ==================== DEDICATED ANNUAL WORK PLAN API ====================

export interface AnnualWorkPlanModel {
  _id: string;
  companyId: string;
  year: number;
  status: 'Draft' | 'Active' | 'Completed' | 'Archived';
  compliancePercentage: number;
  createdBy: { _id: string; email?: string } | string;
  approval?: {
    approvedBy: { _id: string; email?: string } | string;
    approvedByEmail: string;
    approvedByName: string;
    approvalDate: string;
    signatureHash?: string;
    signatureUrl?: string;
    comments?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface PlanActivityModel {
  _id: string;
  annualPlanId: string;
  title: string;
  description?: string;
  objectiveId?: string;
  sourceModule?: string;
  startDate: string;
  endDate: string;
  responsibleUser: string;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  estimatedCost: number;
  actualCost: number;
  progress: number;
  status: 'Pending' | 'InProgress' | 'Completed' | 'Delayed' | 'Cancelled';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlanTaskModel {
  _id: string;
  activityId: string;
  title: string;
  description?: string;
  assignedTo: string;
  startDate: string;
  dueDate: string;
  progress: number;
  status: 'Pending' | 'InProgress' | 'Completed' | 'Delayed' | 'Cancelled';
  comments: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PlanSubtaskModel {
  _id: string;
  taskId: string;
  title: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TaskEvidenceModel {
  _id: string;
  taskId: string;
  fileUrl: string;
  fileType: string;
  uploadedBy: string;
  uploadDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskJustificationModel {
  _id: string;
  taskId: string;
  reason: string;
  correctiveAction?: string;
  newDueDate?: string;
  approvedBy?: string;
  approvedByEmail?: string;
  approvalStatus: 'Pending' | 'Approved' | 'Rejected';
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceReportModel {
  overallPercentage: number;
  completedActivities: number;
  totalActivities: number;
  completedTasks: number;
  totalTasks: number;
  overdueTasks: number;
  justifiedOverdueTasks: number;
  tasksWithEvidence: number;
  weights: {
    activityCompletion: number;
    taskCompletion: number;
    evidenceCoverage: number;
    overdueJustification: number;
  };
}

export interface PlanHistoryModel {
  _id: string;
  entityType: string;
  entityId: string;
  userId: string;
  userEmail: string;
  action: string;
  previousValue?: string;
  newValue?: string;
  timestamp: string;
  createdAt: string;
  updatedAt: string;
}

export function fetchAnnualWorkPlans(token: string) {
  return apiFetch<AnnualWorkPlanModel[]>('/annual-work-plan', token, { method: 'GET' });
}

export function fetchAnnualWorkPlanCurrent(token: string) {
  return apiFetch<AnnualWorkPlanModel | null>('/annual-work-plan/current', token, { method: 'GET' });
}

export function fetchAnnualWorkPlanById(token: string, id: string) {
  return apiFetch<AnnualWorkPlanModel>(`/annual-work-plan/${id}`, token, { method: 'GET' });
}

export function createAnnualWorkPlan(token: string, payload: { year: number }) {
  return apiFetch<AnnualWorkPlanModel>('/annual-work-plan', token, { method: 'POST', body: JSON.stringify(payload) });
}

export function ensureCurrentAnnualWorkPlan(token: string) {
  return apiFetch<AnnualWorkPlanModel>('/annual-work-plan/ensure-current', token, { method: 'POST' });
}

export function updateAnnualWorkPlanStatus(token: string, id: string, status: string) {
  return apiFetch<AnnualWorkPlanModel>(`/annual-work-plan/${id}/status`, token, { method: 'PATCH', body: JSON.stringify({ status }) });
}

export function approveAnnualWorkPlan(token: string, id: string, payload: { approvedByName: string; approvedByEmail: string; signatureHash?: string; signatureUrl?: string; comments?: string }) {
  return apiFetch<AnnualWorkPlanModel>(`/annual-work-plan/${id}/approve`, token, { method: 'POST', body: JSON.stringify(payload) });
}

export function deleteAnnualWorkPlan(token: string, id: string) {
  return apiFetch<void>(`/annual-work-plan/${id}`, token, { method: 'DELETE' });
}

export function recalculateCompliance(token: string, id: string) {
  return apiFetch<number>(`/annual-work-plan/${id}/recalculate`, token, { method: 'POST' });
}

export function fetchComplianceReport(token: string, id: string) {
  return apiFetch<ComplianceReportModel>(`/annual-work-plan/${id}/compliance-report`, token, { method: 'GET' });
}

export function fetchPlanActivities(token: string, planId: string) {
  return apiFetch<PlanActivityModel[]>(`/annual-work-plan/${planId}/activities`, token, { method: 'GET' });
}

export function createPlanActivity(token: string, planId: string, payload: {
  title: string;
  description?: string;
  sourceModule?: string;
  startDate: string;
  endDate: string;
  responsibleUser: string;
  priority?: string;
  estimatedCost?: number;
}) {
  return apiFetch<PlanActivityModel>(`/annual-work-plan/${planId}/activities`, token, { method: 'POST', body: JSON.stringify(payload) });
}

export function updatePlanActivity(token: string, planId: string, activityId: string, payload: Record<string, unknown>) {
  return apiFetch<PlanActivityModel>(`/annual-work-plan/${planId}/activities/${activityId}`, token, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function deletePlanActivity(token: string, planId: string, activityId: string) {
  return apiFetch<void>(`/annual-work-plan/${planId}/activities/${activityId}`, token, { method: 'DELETE' });
}

export function fetchPlanTasks(token: string, planId: string, activityId: string) {
  return apiFetch<PlanTaskModel[]>(`/annual-work-plan/${planId}/activities/${activityId}/tasks`, token, { method: 'GET' });
}

export function createPlanTask(token: string, planId: string, activityId: string, payload: {
  title: string;
  description?: string;
  assignedTo: string;
  startDate: string;
  dueDate: string;
  progress?: number;
}) {
  return apiFetch<PlanTaskModel>(`/annual-work-plan/${planId}/activities/${activityId}/tasks`, token, { method: 'POST', body: JSON.stringify(payload) });
}

export function updatePlanTask(token: string, planId: string, activityId: string, taskId: string, payload: Record<string, unknown>) {
  return apiFetch<PlanTaskModel>(`/annual-work-plan/${planId}/activities/${activityId}/tasks/${taskId}`, token, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function deletePlanTask(token: string, planId: string, activityId: string, taskId: string) {
  return apiFetch<void>(`/annual-work-plan/${planId}/activities/${activityId}/tasks/${taskId}`, token, { method: 'DELETE' });
}

export function fetchPlanSubtasks(token: string, planId: string, activityId: string, taskId: string) {
  return apiFetch<PlanSubtaskModel[]>(`/annual-work-plan/${planId}/activities/${activityId}/tasks/${taskId}/subtasks`, token, { method: 'GET' });
}

export function createPlanSubtask(token: string, planId: string, activityId: string, taskId: string, payload: { title: string }) {
  return apiFetch<PlanSubtaskModel>(`/annual-work-plan/${planId}/activities/${activityId}/tasks/${taskId}/subtasks`, token, { method: 'POST', body: JSON.stringify(payload) });
}

export function updatePlanSubtask(token: string, planId: string, activityId: string, taskId: string, subtaskId: string, payload: { title?: string; completed?: boolean }) {
  return apiFetch<PlanSubtaskModel>(`/annual-work-plan/${planId}/activities/${activityId}/tasks/${taskId}/subtasks/${subtaskId}`, token, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function deletePlanSubtask(token: string, planId: string, activityId: string, taskId: string, subtaskId: string) {
  return apiFetch<void>(`/annual-work-plan/${planId}/activities/${activityId}/tasks/${taskId}/subtasks/${subtaskId}`, token, { method: 'DELETE' });
}

export function fetchTaskEvidence(token: string, planId: string, activityId: string, taskId: string) {
  return apiFetch<TaskEvidenceModel[]>(`/annual-work-plan/${planId}/activities/${activityId}/tasks/${taskId}/evidence`, token, { method: 'GET' });
}

export function createTaskEvidence(token: string, planId: string, activityId: string, taskId: string, payload: { fileUrl: string; fileType: string }) {
  return apiFetch<TaskEvidenceModel>(`/annual-work-plan/${planId}/activities/${activityId}/tasks/${taskId}/evidence`, token, { method: 'POST', body: JSON.stringify(payload) });
}

export function deleteTaskEvidence(token: string, planId: string, activityId: string, taskId: string, evidenceId: string) {
  return apiFetch<void>(`/annual-work-plan/${planId}/activities/${activityId}/tasks/${taskId}/evidence/${evidenceId}`, token, { method: 'DELETE' });
}

export function fetchTaskJustifications(token: string, planId: string, activityId: string, taskId: string) {
  return apiFetch<TaskJustificationModel[]>(`/annual-work-plan/${planId}/activities/${activityId}/tasks/${taskId}/justifications`, token, { method: 'GET' });
}

export function createTaskJustification(token: string, planId: string, activityId: string, taskId: string, payload: { reason: string; correctiveAction?: string; newDueDate?: string }) {
  return apiFetch<TaskJustificationModel>(`/annual-work-plan/${planId}/activities/${activityId}/tasks/${taskId}/justifications`, token, { method: 'POST', body: JSON.stringify(payload) });
}

export function approveJustification(token: string, justificationId: string, payload: { approvalStatus: 'Approved' | 'Rejected'; rejectionReason?: string }) {
  return apiFetch<TaskJustificationModel>(`/annual-work-plan/justifications/${justificationId}/approve`, token, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function fetchPlanHistory(token: string, planId: string) {
  return apiFetch<PlanHistoryModel[]>(`/annual-work-plan/${planId}/history`, token, { method: 'GET' });
}

export function processAutoStatus(token: string) {
  return apiFetch<{ message: string }>('/annual-work-plan/process-auto-status', token, { method: 'POST' });
}


export type InitialEvaluationStatus = 'Borrador' | 'En evaluación' | 'Pendiente aprobación' | 'Aprobada' | 'Archivada';
export type InitialEvaluationStandardStatus = 'Cumple' | 'No Cumple' | 'No Aplica';
export type InitialEvaluationSeverity = 'Low' | 'Medium' | 'High' | 'Critical';
export type InitialEvaluationWorkStatus = 'Open' | 'In Progress' | 'Closed';

export interface InitialEvaluationStandardModel {
  code: string;
  chapter: string;
  title: string;
  description: string;
  weight: number;
  status: InitialEvaluationStandardStatus;
  observations: string;
  evidence: string[];
  attachments: string[];
  autoEvaluated: boolean;
  autoSource?: string;
  evaluatedAt?: string;
}

export interface InitialEvaluationGapModel {
  code: string;
  chapter: string;
  title: string;
  status: string;
  recommendedAction: string;
}

export interface InitialEvaluationFindingModel {
  id: string;
  title: string;
  description: string;
  severity: InitialEvaluationSeverity;
  responsible: string;
  dueDate?: string;
  status: InitialEvaluationWorkStatus;
  createdAt: string;
}

export interface InitialEvaluationActionModel {
  id: string;
  source: string;
  title: string;
  description: string;
  responsible: string;
  dueDate?: string;
  manualProgress: number;
  automaticProgress: number;
  activityProgress: number;
  progress: number;
  status: InitialEvaluationWorkStatus;
  evidence: string[];
}

export interface InitialEvaluationSignatureModel {
  signerRole: string;
  signerName: string;
  signerEmail: string;
  signatureHash: string;
  signedAt: string;
  signatureUrl?: string;
}

export interface InitialEvaluationApprovalModel {
  approvedByEmail: string;
  approvedAt: string;
  compliancePercentage: number;
  comments: string;
  signature: InitialEvaluationSignatureModel;
  approvalDocumentUrl: string;
}

export interface InitialEvaluationHistoryModel {
  userEmail?: string;
  date: string;
  entity: string;
  field: string;
  previousValue?: string;
  newValue?: string;
}

export interface InitialEvaluationModel {
  _id: string;
  companyId: string;
  name: string;
  evaluationDate: string;
  responsibleSst: string;
  status: InitialEvaluationStatus;
  overallCompliance: number;
  totalStandardsEvaluated: number;
  standards: InitialEvaluationStandardModel[];
  gaps: InitialEvaluationGapModel[];
  findings: InitialEvaluationFindingModel[];
  actionPlan: InitialEvaluationActionModel[];
  approval?: InitialEvaluationApprovalModel;
  signatures: InitialEvaluationSignatureModel[];
  history: InitialEvaluationHistoryModel[];
  nextReassessmentAt?: string;
}

export interface InitialEvaluationExecutiveDashboardModel {
  overallCompliance: number;
  criticalFindings: number;
  pendingActions: number;
  riskLevel: string;
  status: InitialEvaluationStatus;
}

export const fetchInitialEvaluationAdvanced = (token: string) => apiFetch<InitialEvaluationModel>('/advanced-management/initial-evaluation', token, { method: 'GET' });
export const runInitialEvaluationAutoDiagnostic = (token: string) => apiFetch<InitialEvaluationModel>('/advanced-management/initial-evaluation/auto-diagnostic', token, { method: 'POST' });
export const updateInitialEvaluationStandard = (token: string, code: string, payload: Partial<InitialEvaluationStandardModel>) => apiFetch<InitialEvaluationModel>(`/advanced-management/initial-evaluation/standards/${encodeURIComponent(code)}`, token, { method: 'PATCH', body: JSON.stringify(payload) });
export const upsertInitialEvaluationFinding = (token: string, payload: Partial<InitialEvaluationFindingModel> & { title: string }) => apiFetch<InitialEvaluationModel>('/advanced-management/initial-evaluation/findings', token, { method: 'POST', body: JSON.stringify(payload) });
export const upsertInitialEvaluationAction = (token: string, payload: Partial<InitialEvaluationActionModel> & { title: string }) => apiFetch<InitialEvaluationModel>('/advanced-management/initial-evaluation/actions', token, { method: 'POST', body: JSON.stringify(payload) });
export const generateInitialEvaluationActions = (token: string) => apiFetch<InitialEvaluationModel>('/advanced-management/initial-evaluation/actions/generate', token, { method: 'POST' });
export const submitInitialEvaluationApproval = (token: string, comments?: string) => apiFetch<InitialEvaluationModel>('/advanced-management/initial-evaluation/submit-approval', token, { method: 'POST', body: JSON.stringify({ comments }) });
export const signInitialEvaluationApproval = (token: string, payload: { signerName: string; signerEmail?: string; signatureUrl?: string; comments?: string }) => apiFetch<InitialEvaluationModel>('/advanced-management/initial-evaluation/manager-sign', token, { method: 'POST', body: JSON.stringify(payload) });
export const fetchInitialEvaluationExecutiveDashboard = (token: string) => apiFetch<InitialEvaluationExecutiveDashboardModel>('/advanced-management/initial-evaluation/executive-dashboard', token, { method: 'GET' });

// ==================== LEGAL MATRIX API ====================

export interface LegalMatrixItemModel {
  regulationCode: string;
  regulationName: string;
  description?: string;
  status: 'CUMPLE' | 'NO_CUMPLE' | 'NO_APLICA' | 'PENDIENTE';
  observation?: string;
  evidenceUrl?: string;
  lastUpdatedAt?: string;
}

export interface CompanyLegalMatrixModel {
  _id: string;
  companyId: string;
  economicSector: string;
  items: LegalMatrixItemModel[];
}

export interface LegalMatrixComplianceModel {
  total: number;
  cumplen: number;
  noCumplen: number;
  noAplica: number;
  pendiente: number;
  compliancePercentage: number;
}

export function fetchCompanyLegalMatrix(token: string) {
  return apiFetch<CompanyLegalMatrixModel>('/legal-matrix/company/current', token, { method: 'GET' });
}

export function fetchLegalMatrixCompliance(token: string) {
  return apiFetch<LegalMatrixComplianceModel>('/legal-matrix/company/current/compliance', token, { method: 'GET' });
}

export function updateLegalMatrixItemStatus(token: string, regulationCode: string, status: string, observation?: string) {
  return apiFetch<CompanyLegalMatrixModel>(
    `/legal-matrix/company/current/item/${encodeURIComponent(regulationCode)}`,
    token,
    { method: 'PATCH', body: JSON.stringify({ status, observation }) },
  );
}

export function fetchSectorRegulations(token: string, sector: string) {
  return apiFetch<Array<{ regulationCode: string; regulationName: string; description?: string }>>(
    `/legal-matrix/sectors/${encodeURIComponent(sector)}`,
    token,
    { method: 'GET' },
  );
}

export function addCustomRegulationToCurrent(token: string, regulationCode: string, regulationName: string, description?: string) {
  return apiFetch<CompanyLegalMatrixModel>(`/legal-matrix/company/current/items`, token, { method: 'POST', body: JSON.stringify({ regulationCode, regulationName, description }) });
}

export function removeRegulationFromMatrix(token: string, regulationCode: string) {
  return apiFetch<CompanyLegalMatrixModel>(`/legal-matrix/company/current/item/${encodeURIComponent(regulationCode)}`, token, { method: 'DELETE' });
}

// ==================== ADVANCED LEGAL MATRIX API ====================

export interface LegalDashboardModel {
  totalRequirements: number;
  compliant: number;
  partial: number;
  nonCompliant: number;
  expiringReviews: number;
  pendingEvidence: number;
  regulatoryChanges: number;
  overallCompliancePercentage: number;
}

export interface LegalRequirementModel {
  _id: string;
  companyId: string;
  regulationCode: string;
  regulationName: string;
  article?: string;
  requirement: string;
  responsibleUser?: { _id: string; email?: string; name?: string } | string;
  reviewFrequency: string;
  complianceStatus: 'CUMPLE' | 'PARCIAL' | 'NO_CUMPLE';
  linkedModules: Array<{ module: string; entityId: string; entityName?: string; isCompliant: boolean }>;
  notes?: string;
  lastReviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LegalEvidenceModel {
  _id: string;
  companyId: string;
  requirementId: string;
  documentId?: string;
  documentName?: string;
  documentVersion?: string;
  fileUrl?: string;
  description: string;
  status: string;
  uploadedBy?: string;
  uploadDate?: string;
  createdAt: string;
}

export interface LegalFollowUpModel {
  _id: string;
  companyId: string;
  requirementId: string;
  reviewDate: string;
  reviewer?: { _id: string; email?: string; name?: string } | string;
  reviewerName?: string;
  findings?: string;
  recommendations?: string;
  complianceResult: string;
  isSigned: boolean;
  signedByName?: string;
  signedAt?: string;
  signatureHash?: string;
  nextReviewDate?: string;
  createdAt: string;
}

export interface LegalRegulatoryChangeModel {
  _id: string;
  companyId: string;
  changeType: 'NEW_REGULATION' | 'AMENDMENT' | 'REPEAL' | 'UPDATE';
  regulationCode: string;
  regulationName: string;
  previousRegulationCode?: string;
  description?: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  effectiveDate: string;
  isReviewed: boolean;
  alertGenerated: boolean;
  createdAt: string;
}

export interface LegalActionPlanModel {
  _id: string;
  companyId: string;
  requirementId: string;
  title: string;
  description?: string;
  responsibleUser?: string;
  dueDate?: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  linkedActivityId?: string;
  activityTitle?: string;
  syncedToAnnualPlan: boolean;
  completedAt?: string;
  completionNotes?: string;
  createdAt: string;
}

export interface LegalHistoryModel {
  _id: string;
  companyId: string;
  userId: string;
  userEmail: string;
  userName?: string;
  action: string;
  entityType: string;
  entityId: string;
  requirementId?: string;
  description?: string;
  previousValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  createdAt: string;
}

export interface AutoComplianceResult {
  complies: boolean;
  reasons: string[];
  score: number;
}

export function fetchLegalDashboard(token: string) {
  return apiFetch<LegalDashboardModel>('/legal-matrix/dashboard', token, { method: 'GET' });
}

export function fetchLegalRequirements(token: string, regulationCode?: string) {
  const q = regulationCode ? `?regulationCode=${encodeURIComponent(regulationCode)}` : '';
  return apiFetch<LegalRequirementModel[]>(`/legal-matrix/requirements${q}`, token, { method: 'GET' });
}

export function createLegalRequirement(token: string, payload: {
  regulationCode: string; regulationName: string; article?: string;
  requirement: string; responsibleUser?: string; reviewFrequency?: string;
}) {
  return apiFetch<LegalRequirementModel>('/legal-matrix/requirements', token, { method: 'POST', body: JSON.stringify(payload) });
}

export function updateLegalRequirement(token: string, id: string, payload: Record<string, unknown>) {
  return apiFetch<LegalRequirementModel>(`/legal-matrix/requirements/${id}`, token, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function deleteLegalRequirement(token: string, id: string) {
  return apiFetch<void>(`/legal-matrix/requirements/${id}`, token, { method: 'DELETE' });
}

export function fetchLegalEvidence(token: string) {
  return apiFetch<LegalEvidenceModel[]>('/legal-matrix/evidence', token, { method: 'GET' });
}

export function createLegalEvidence(token: string, payload: {
  requirementId: string; description: string; documentName?: string; fileUrl?: string;
}) {
  return apiFetch<LegalEvidenceModel>('/legal-matrix/evidence', token, { method: 'POST', body: JSON.stringify(payload) });
}

export function deleteLegalEvidence(token: string, id: string) {
  return apiFetch<void>(`/legal-matrix/evidence/${id}`, token, { method: 'DELETE' });
}

export function fetchLegalFollowUps(token: string) {
  return apiFetch<LegalFollowUpModel[]>('/legal-matrix/follow-ups', token, { method: 'GET' });
}

export function createLegalFollowUp(token: string, payload: {
  requirementId: string; reviewDate: string; findings?: string; recommendations?: string;
  complianceResult: string; nextReviewDate?: string;
}) {
  return apiFetch<LegalFollowUpModel>('/legal-matrix/follow-ups', token, { method: 'POST', body: JSON.stringify(payload) });
}

export function signLegalFollowUp(token: string, id: string, payload: { signedByName: string; signatureHash?: string; signatureUrl?: string }) {
  return apiFetch<LegalFollowUpModel>(`/legal-matrix/follow-ups/${id}/sign`, token, { method: 'POST', body: JSON.stringify(payload) });
}

export function fetchLegalRegulatoryChanges(token: string, unreviewedOnly?: boolean) {
  const q = unreviewedOnly ? '?unreviewed=true' : '';
  return apiFetch<LegalRegulatoryChangeModel[]>(`/legal-matrix/regulatory-changes${q}`, token, { method: 'GET' });
}

export function createLegalRegulatoryChange(token: string, payload: {
  changeType: string; regulationCode: string; regulationName: string;
  description?: string; impact: string; effectiveDate: string;
}) {
  return apiFetch<LegalRegulatoryChangeModel>('/legal-matrix/regulatory-changes', token, { method: 'POST', body: JSON.stringify(payload) });
}

export function markRegulatoryChangeReviewed(token: string, id: string) {
  return apiFetch<LegalRegulatoryChangeModel>(`/legal-matrix/regulatory-changes/${id}/review`, token, { method: 'PATCH' });
}

export function fetchLegalActionPlans(token: string, requirementId?: string) {
  const q = requirementId ? `?requirementId=${requirementId}` : '';
  return apiFetch<LegalActionPlanModel[]>(`/legal-matrix/action-plans${q}`, token, { method: 'GET' });
}

export function createLegalActionPlan(token: string, payload: {
  requirementId: string; title: string; description?: string; dueDate?: string;
}) {
  return apiFetch<LegalActionPlanModel>('/legal-matrix/action-plans', token, { method: 'POST', body: JSON.stringify(payload) });
}

export function updateLegalActionPlan(token: string, id: string, payload: Record<string, unknown>) {
  return apiFetch<LegalActionPlanModel>(`/legal-matrix/action-plans/${id}`, token, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function fetchLegalHistory(token: string, limit = 100, skip = 0) {
  return apiFetch<LegalHistoryModel[]>(`/legal-matrix/history?limit=${limit}&skip=${skip}`, token, { method: 'GET' });
}

export function fetchLegalAutoCompliance(token: string) {
  return apiFetch<AutoComplianceResult>('/legal-matrix/auto-compliance', token, { method: 'GET' });
}

export function triggerLegalAlerts(token: string) {
  return apiFetch<string[]>('/legal-matrix/check-alerts', token, { method: 'POST' });
}
