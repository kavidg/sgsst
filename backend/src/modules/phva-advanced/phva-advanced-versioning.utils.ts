import { Types } from 'mongoose';
import {
  PhvaAdvancedResponsableSstDocument,
  ResponsableSstDocumentType,
  ResponsableSstVersion,
  ResponsableSstVersionSnapshot,
} from './schemas/phva-advanced-responsable-sst.schema';

/**
 * Helpers puros del versionado estructurado del Responsable del SG-SST
 * (PHVA 1.1.1).
 *
 * Fase B — la lógica de snapshots/versiones vive aquí (fuera del servicio)
 * para poder probarse de forma unitaria sin levantar dependencias. El patrón
 * de bump (0.1 por ciclo) es el mismo que usan Responsibilities (1.1.2) y
 * Resource Assignment (1.1.3).
 */

/** Incrementa la versión actual siguiendo el patrón del módulo (0.1 por ciclo). */
export function bumpResponsableSstVersion(current?: string): string {
  const currentVer = parseFloat(current || '1.0');
  return (currentVer + 0.1).toFixed(1);
}

/** Clona una fecha (o la descarta si es inválida) para no compartir referencias. */
function cloneDate(value?: Date | string | null): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Clona una entrada OCR sin compartir referencias con el registro vivo. */
function cloneOcrEntry(entry: Record<string, unknown>) {
  return {
    detectedLicenseNumber: entry.detectedLicenseNumber !== undefined && entry.detectedLicenseNumber !== null ? String(entry.detectedLicenseNumber) : undefined,
    detectedIssueDate: cloneDate(entry.detectedIssueDate as Date | undefined),
    detectedExpirationDate: cloneDate(entry.detectedExpirationDate as Date | undefined),
    detectedIssuingAuthority: entry.detectedIssuingAuthority !== undefined && entry.detectedIssuingAuthority !== null ? String(entry.detectedIssuingAuthority) : undefined,
    detectedLicenseHolder: entry.detectedLicenseHolder !== undefined && entry.detectedLicenseHolder !== null ? String(entry.detectedLicenseHolder) : undefined,
    modifiedLicenseNumber: entry.modifiedLicenseNumber !== undefined && entry.modifiedLicenseNumber !== null ? String(entry.modifiedLicenseNumber) : undefined,
    modifiedIssueDate: cloneDate(entry.modifiedIssueDate as Date | undefined),
    modifiedExpirationDate: cloneDate(entry.modifiedExpirationDate as Date | undefined),
    modifiedIssuingAuthority: entry.modifiedIssuingAuthority !== undefined && entry.modifiedIssuingAuthority !== null ? String(entry.modifiedIssuingAuthority) : undefined,
    modifiedBy: entry.modifiedBy instanceof Types.ObjectId ? entry.modifiedBy : undefined,
    modifiedAt: cloneDate(entry.modifiedAt as Date | undefined),
    hasManualModification: Boolean(entry.hasManualModification),
    documentId: entry.documentId !== undefined && entry.documentId !== null ? String(entry.documentId) : undefined,
    sourceFileName: entry.sourceFileName !== undefined && entry.sourceFileName !== null ? String(entry.sourceFileName) : undefined,
    rawOcrText: entry.rawOcrText !== undefined && entry.rawOcrText !== null ? String(entry.rawOcrText) : undefined,
    confidence: Number(entry.confidence ?? 0),
  };
}

/**
 * Construye un snapshot profundo e independiente del registro (inmutable).
 *
 * Se copian explícitamente los campos y fechas para que mutaciones posteriores
 * del registro vivo NO alteren las versiones históricas.
 */
export function buildResponsableSstVersionSnapshot(
  record: PhvaAdvancedResponsableSstDocument | Record<string, unknown>,
): ResponsableSstVersionSnapshot {
  const r = record as unknown as Record<string, unknown>;
  return {
    fullName: String(r.fullName ?? ''),
    documentNumber: String(r.documentNumber ?? ''),
    position: String(r.position ?? ''),
    profession: String(r.profession ?? ''),
    sstProfessionalType: String(r.sstProfessionalType ?? ''),
    sstLicenseNumber: String(r.sstLicenseNumber ?? ''),
    licenseType: String(r.licenseType ?? ''),
    issuingAuthority: String(r.issuingAuthority ?? ''),
    department: String(r.department ?? ''),
    observations: String(r.observations ?? ''),
    licenseIssueDate: cloneDate(r.licenseIssueDate as Date | undefined),
    licenseExpiresAt: cloneDate(r.licenseExpiresAt as Date | undefined),
    licenseStatus: String(r.licenseStatus ?? ''),
    course50HoursDate: cloneDate(r.course50HoursDate as Date | undefined),
    course50HoursDetectedDate: cloneDate(r.course50HoursDetectedDate as Date | undefined),
    course20HoursDate: cloneDate(r.course20HoursDate as Date | undefined),
    requires20HourUpdate: Boolean(r.requires20HourUpdate),
    // Fase 8.3.C — datos de designación (la evidencia DESIGNATION vive en
    // documents[] y queda cubierta por el snapshot de documentos).
    designationDate: cloneDate(r.designationDate as Date | undefined),
    designationNumber: String(r.designationNumber ?? ''),
    designationIssuerName: String(r.designationIssuerName ?? ''),
    designationIssuerPosition: String(r.designationIssuerPosition ?? ''),
    documents: ((r.documents as Array<Record<string, unknown>>) ?? []).map((doc) => ({
      type: (String(doc.type ?? '') as ResponsableSstDocumentType),
      fileName: String(doc.fileName ?? ''),
      fileUrl: String(doc.fileUrl ?? ''),
      detectedDate: cloneDate(doc.detectedDate as Date | undefined),
      uploadedAt: cloneDate(doc.uploadedAt as Date | undefined),
    })),
    licenseOcrEntries: ((r.licenseOcrEntries as Array<Record<string, unknown>>) ?? []).map((entry) => cloneOcrEntry(entry)),
  };
}

/** Razones del ciclo de aprobación para una versión. */
export type ResponsableSstVersionReason = 'SUBMIT' | 'RESUBMIT';

/**
 * Construye una entrada de versión con su snapshot inmutable.
 *
 * @param params.record - Registro del cual se toma el snapshot (sin compartir
 *   referencias).
 */
export function buildResponsableSstVersion(params: {
  record: PhvaAdvancedResponsableSstDocument | Record<string, unknown>;
  version: string;
  reason: ResponsableSstVersionReason;
  action: string;
  createdBy?: Types.ObjectId;
  createdByEmail?: string;
  approvalStatus: string;
  submittedAt?: Date;
  approvedAt?: Date;
  rejectionReason?: string;
}): ResponsableSstVersion {
  return {
    version: params.version,
    createdAt: new Date(),
    createdBy: params.createdBy,
    createdByEmail: params.createdByEmail,
    reason: params.reason,
    action: params.action,
    snapshot: buildResponsableSstVersionSnapshot(params.record),
    approvalStatus: params.approvalStatus,
    submittedAt: params.submittedAt,
    approvedAt: params.approvedAt,
    rejectionReason: params.rejectionReason,
  };
}
