/**
 * Contrato extensible para adapters de evidencia documental.
 *
 * Cada adapter conecta un estándar PHVA con su fuente de evidencia
 * (actualmente DocumentMaster). Permite que el análisis inteligente
 * enriquezca findings con contexto documental real.
 *
 * Arquitectura:
 *   StandardEvidenceAdapter (interfaz)
 *     └── AcquisitionEvidenceAdapter (2.9.1)
 *
 * Principios:
 *   - NO modifica compliance scoring
 *   - NO contiene lógica de cálculo
 *   - Solo consulta y agrega datos de evidencia
 *   - Tenant-safe: companyId siempre de request autenticado
 *   - Sin PII: solo métricas agregadas
 */

import { Types } from 'mongoose';

/** Hallazgo de evidencia documental (agregado, sin PII). */
export interface EvidenceFinding {
  /** ID estable del hallazgo. */
  id: string;
  /** Tipo de hallazgo. */
  type: 'missing_evidence' | 'expired_document' | 'expiring_soon' | 'pending_approval' | 'no_documents';
  /** Descripción cualitativa (sin nombres ni datos personales). */
  description: string;
}

/**
 * Contexto de evidencia documental para un estándar.
 * Contiene únicamente métricas agregadas — sin PII.
 */
export interface StandardEvidenceContext {
  /** Código del estándar evaluado. */
  standardCode: string;
  /** Empresa evaluada (solo para referencia interna, NO en respuesta). */
  companyId: string;

  // ── Métricas documentales ──
  /** Total de documentos con standardCode === estándar. */
  totalDocuments: number;
  /** Documentos con status ACTIVE. */
  activeDocuments: number;
  /** Documentos ACTIVE con expirationDate en el pasado. */
  expiredDocuments: number;
  /** Documentos ACTIVE con expirationDate dentro de 30 días. */
  expiringDocuments: number;
  /** Documentos con status PENDING_APPROVAL. */
  pendingApprovalDocuments: number;

  // ── Cobertura por adquisiciones ──
  /** Adquisiciones de la empresa que tienen al menos 1 documento vinculado. */
  acquisitionsWithDocuments: number;
  /** Adquisiciones de la empresa sin ningún documento vinculado. */
  acquisitionsWithoutDocuments: number;

  // ── Cobertura por proveedores ──
  /** Proveedores de la empresa que tienen al menos 1 documento vinculado. */
  suppliersWithDocuments: number;
  /** Proveedores de la empresa sin ningún documento vinculado. */
  suppliersWithoutDocuments: number;

  // ── Porcentaje ──
  /** Porcentaje de adquisiciones con al menos 1 documento (0–100). */
  documentCoveragePercentage: number;

  // ── Hallazgos ──
  /** Hallazgos de evidencia detectados. */
  evidenceFindings: EvidenceFinding[];

  // ── Métricas de aprobación (opcional) ──
  /** Métricas de aprobación administrativa de adquisiciones. */
  approvalMetrics?: {
    totalPending: number;
    totalApproved: number;
    totalRejected: number;
  };
}

/**
 * Interfaz que todo adapter de evidencia debe implementar.
 *
 * Un adapter conecta un estándar específico con su fuente de evidencia.
 * El StandardAnalysisService registra adapters por standardCode y los
 * consulta cuando analiza un estándar.
 */
export interface StandardEvidenceAdapter {
  /** Código del estándar que soporta este adapter. */
  supports(standardCode: string): boolean;

  /**
   * Obtiene el contexto de evidencia documental para una empresa.
   *
   * @param companyId - ObjectId de la empresa (validado por CompanyAccessGuard)
   * @returns Contexto de evidencia agregado y seguro (sin PII)
   */
  getEvidenceContext(companyId: Types.ObjectId | string): Promise<StandardEvidenceContext>;
}
