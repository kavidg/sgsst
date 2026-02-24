const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:3000';

export async function fetchUserByFirebaseUid(uid: string, idToken: string) {
  const response = await fetch(`${BACKEND_URL}/users/by-firebase/${uid}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = data?.message ?? 'Error calling backend endpoint';
    throw new Error(Array.isArray(message) ? message.join(', ') : message);
  }

  return data;
}
