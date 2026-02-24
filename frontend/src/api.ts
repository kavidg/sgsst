const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';

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
  return apiFetch(`/users/by-firebase/${uid}`, token, { method: 'GET' });
}
