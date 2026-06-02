---
name: "SST Objectives executive dashboard"
about: "Add backend endpoint and frontend widget to display SST objectives summary in the main dashboard"
labels:
  - enhancement
assignees:
  - kavidg
---

Implemented SST Objectives summary endpoint and frontend widget.

- Backend:
  - Added SstObjectives schema to DashboardModule
  - Implemented getSstObjectivesSummary in DashboardService
  - Exposed GET /dashboard/sst-objectives in DashboardController

- Frontend:
  - Added fetchDashboardSstObjectives API helper
  - Added SstObjectivesProgressCard component
  - Integrate component into DashboardPage

