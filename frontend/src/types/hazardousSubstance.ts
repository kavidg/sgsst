/**
 * Tipos TypeScript para el módulo Hazardous Substance (4.1.3).
 * Coinciden exactamente con el schema del backend.
 */

export enum SubstanceType {
  CHEMICAL = 'CHEMICAL',
  BIOLOGICAL = 'BIOLOGICAL',
  FLAMMABLE = 'FLAMMABLE',
  CORROSIVE = 'CORROSIVE',
  TOXIC = 'TOXIC',
  EXPLOSIVE = 'EXPLOSIVE',
  OXIDIZER = 'OXIDIZER',
  COMPRESSED_GAS = 'COMPRESSED_GAS',
  OTHER = 'OTHER',
}

export enum SdsStatus {
  NOT_AVAILABLE = 'NOT_AVAILABLE',
  PENDING = 'PENDING',
  CURRENT = 'CURRENT',
  EXPIRED = 'EXPIRED',
}

export enum HazardousSubstanceStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export interface HazardousSubstance {
  _id: string;
  companyId: string;
  name: string;
  casNumber?: string;
  hazardClassification?: string;
  substanceType: SubstanceType;
  supplier?: string;
  storageLocation?: string;
  sdsStatus: SdsStatus;
  sdsUrl?: string;
  sdsIssueDate?: string;
  sdsReviewDate?: string;
  controlsImplemented?: string;
  riskId?: string;
  notes?: string;
  status: HazardousSubstanceStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateHazardousSubstancePayload {
  name: string;
  casNumber?: string;
  hazardClassification?: string;
  substanceType: SubstanceType;
  supplier?: string;
  storageLocation?: string;
  sdsStatus: SdsStatus;
  sdsUrl?: string;
  sdsIssueDate?: string;
  sdsReviewDate?: string;
  controlsImplemented?: string;
  riskId?: string;
  notes?: string;
  status?: HazardousSubstanceStatus;
}

export interface UpdateHazardousSubstancePayload {
  name?: string;
  casNumber?: string;
  hazardClassification?: string;
  substanceType?: SubstanceType;
  supplier?: string;
  storageLocation?: string;
  sdsStatus?: SdsStatus;
  sdsUrl?: string;
  sdsIssueDate?: string;
  sdsReviewDate?: string;
  controlsImplemented?: string;
  riskId?: string;
  notes?: string;
  status?: HazardousSubstanceStatus;
}

/** Labels para substanceType */
export const SUBSTANCE_TYPE_LABELS: Record<SubstanceType, string> = {
  [SubstanceType.CHEMICAL]: 'Químico',
  [SubstanceType.BIOLOGICAL]: 'Biológico',
  [SubstanceType.FLAMMABLE]: 'Inflamable',
  [SubstanceType.CORROSIVE]: 'Corrosivo',
  [SubstanceType.TOXIC]: 'Tóxico',
  [SubstanceType.EXPLOSIVE]: 'Explosivo',
  [SubstanceType.OXIDIZER]: 'Oxidante',
  [SubstanceType.COMPRESSED_GAS]: 'Gas comprimido',
  [SubstanceType.OTHER]: 'Otro',
};

/** Labels para sdsStatus */
export const SDS_STATUS_LABELS: Record<SdsStatus, string> = {
  [SdsStatus.NOT_AVAILABLE]: 'Sin SDS',
  [SdsStatus.PENDING]: 'SDS pendiente',
  [SdsStatus.CURRENT]: 'SDS vigente',
  [SdsStatus.EXPIRED]: 'SDS vencida',
};

/** Clases CSS para badges de SDS */
export const SDS_STATUS_CLASSES: Record<SdsStatus, string> = {
  [SdsStatus.NOT_AVAILABLE]: 'badge--muted',
  [SdsStatus.PENDING]: 'badge--warning',
  [SdsStatus.CURRENT]: 'badge--success',
  [SdsStatus.EXPIRED]: 'badge--danger',
};

/** Labels para status */
export const STATUS_LABELS: Record<HazardousSubstanceStatus, string> = {
  [HazardousSubstanceStatus.ACTIVE]: 'Activo',
  [HazardousSubstanceStatus.INACTIVE]: 'Inactivo',
};

/** Clases CSS para badges de estado */
export const STATUS_CLASSES: Record<HazardousSubstanceStatus, string> = {
  [HazardousSubstanceStatus.ACTIVE]: 'badge--success',
  [HazardousSubstanceStatus.INACTIVE]: 'badge--muted',
};
