const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';

export type UserRole = 'owner' | 'admin' | 'member';

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
  ownerId: string;
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
}

interface UpdateCompanyPayload {
  name?: string;
  nit?: string;
}

export async function apiFetch<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = data?.message ?? 'Error calling backend endpoint';
    throw new Error(Array.isArray(message) ? message.join(', ') : message);
  }

  return data as T;
}

export function fetchUserByFirebaseUid(uid: string, token: string) {
  return apiFetch<UserModel>(`/users/by-firebase/${uid}`, token, { method: 'GET' });
}

export function fetchAdmins(token: string) {
  return apiFetch<UserModel[]>('/users/admins', token, { method: 'GET' });
}

export function createAdmin(token: string, payload: CreateUserPayload) {
  return apiFetch<UserModel>('/users/admins', token, { method: 'POST', body: JSON.stringify(payload) });
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
