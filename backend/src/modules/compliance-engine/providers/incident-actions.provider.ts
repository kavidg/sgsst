export {
  /**
   * E2 (7.1.3) — COMPATIBILIDAD HISTÓRICA: el cálculo existencial de FASE 20
   * (existencia/investigación/acciones/rootCause con estados fantasma
   * 'INVESTIGATED'/'Completado') fue RETIRADO y REEMPLAZADO por el provider
   * oficial `incident-actions-compliance.provider.ts` (scorer puro
   * dimensions:v1, misma query tenant-scoped a Incident, mismo module ID
   * 'incident-actions', misma posición en el ComplianceEngine).
   *
   * Este archivo solo re-exporta el provider oficial para conservar las rutas
   * de import históricas (compliance-engine.service.ts /
   * compliance-engine.module.ts). NO existe una segunda implementación de
   * 7.1.3: cualquier import de './providers/incident-actions.provider'
   * resuelve al MISMO provider oficial — sin doble scoring.
   */
  IncidentActionsProvider as default,
} from './incident-actions-compliance.provider';
export { IncidentActionsProvider } from './incident-actions-compliance.provider';
