/**
 * DTO de respuesta del endpoint de matriz (GET /epp/applicability/matrix).
 *
 * Los nombres (jobProfileName, eppName, category, standard) son SNAPSHOTS DE
 * RESPUESTA para pintar la UI sin N+1: la fuente de verdad sigue siendo
 * JobProfile + SstEpp.catalog + EppApplicability (nunca se persisten aquí).
 */
export interface EppApplicabilityMatrixJobProfile {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

export interface EppApplicabilityMatrixEppItem {
  /** Identidad lógica del ítem (eppId en SstEpp.catalog[]). */
  id: string;
  name: string;
  category: string;
  standard: string;
  active: boolean;
}

export interface EppApplicabilityMatrixAssignment {
  id: string;
  jobProfileId: string;
  jobProfileName: string;
  eppItemId: string;
  eppName: string;
  category: string;
  standard: string;
  required: boolean;
  reason?: string;
  scope?: string;
  active: boolean;
}

export interface EppApplicabilityMatrixDto {
  jobProfiles: EppApplicabilityMatrixJobProfile[];
  eppItems: EppApplicabilityMatrixEppItem[];
  assignments: EppApplicabilityMatrixAssignment[];
}
