// Fetch SST objectives summary for dashboard
export function fetchDashboardSstObjectives(token: string) {
  return apiFetch<{ summary: { total: number; active: number; completed: number; delayed: number; expired: number; compliance: number }; objectives: any[] }>('/dashboard/sst-objectives', token, { method: 'GET' });
}
