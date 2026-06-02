---
name: Revert: SST objectives dashboard changes (combined)
---

This PR reverts the changes introduced by the following commits:

- e640a7c32e71a0c922712780a51f510290bed7a4 — fix(api): restore full frontend/src/api.ts and add fetchDashboardSstObjectives
- 39382c698f7b2aefd65cf9337afcd1a114c15b19 — Merge pull request #145 from kavidg/feature/dashboard-sst-objectives-progress
- fa4581da6089417d8caadb8d1179d76fd93cff10 — chore(pr): add PR template for SST objectives dashboard
- 2578fda4d024015974d73495dc327af7bdc658dc — feat(dashboard): add SST Objectives executive dashboard + backend summary endpoint

Reason: rollback for stability; these changes should be reverted while we iterate on the feature.

Notes:
- If there are conflicts they will be flagged in the PR for manual resolution.
