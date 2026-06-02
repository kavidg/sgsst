*** Begin Patch
*** Update File: frontend/src/api.ts
@@
-// New helper for dashboard SST objectives summary (restore/ensure this exists)
-export function fetchDashboardSstObjectives(token: string) {
-  return apiFetch<{
-    summary: { total: number; active: number; completed: number; delayed: number; expired: number; compliance: number };
-    objectives: any[];
-  }>('/dashboard/sst-objectives', token, { method: 'GET' });
-}
+// fetchDashboardSstObjectives removed as part of SST objectives dashboard revert
*** End Patch