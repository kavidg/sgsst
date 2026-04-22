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
  topic: string;
  date: string;
  instructor: string;
  description: string;
  evidenceUrl?: string;
}

export interface CreateTrainingPayload {
  topic: string;
  date: string;
  instructor: string;
  description: string;
  evidenceUrl?: string;
}

export interface UpdateTrainingPayload {
  topic?: string;
  date?: string;
  instructor?: string;
  description?: string;
  evidenceUrl?: string;
}

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
}

interface UpdateCompanyPayload {
  name?: string;
  nit?: string;
  standardsType?: string;
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
