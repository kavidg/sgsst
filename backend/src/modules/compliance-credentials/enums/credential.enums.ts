export enum CredentialCourseType {
  COURSE_50_HOURS = 'COURSE_50_HOURS',
  COURSE_20_HOURS = 'COURSE_20_HOURS',
}

export enum CredentialStatus {
  VIGENTE = 'Vigente',
  PROXIMO_A_VENCER = 'Próximo a vencer',
  VENCIDO = 'Vencido',
}

export enum ResponsibleType {
  COORDINADOR_SST = 'Coordinador SST',
  LIDER_SST = 'Líder SST',
  PROFESIONAL_SST = 'Profesional SST',
  TECNOLOGO_SST = 'Tecnólogo SST',
  RESPONSABLE_SG_SST = 'Responsable SG-SST',
}

export enum ResponsibleStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum CredentialAlertType {
  EXPIRATION = 'expiration',
  MISSING_DOCUMENTS = 'missing_documents',
  MISSING_20H_COURSE = 'missing_20h_course',
  MANUAL_OCR_MODIFICATION = 'manual_ocr_modification',
}

export enum CredentialHistoryAction {
  UPLOAD = 'upload',
  EDIT = 'edit',
  OCR_CHANGE = 'ocr_change',
  EXPIRATION_UPDATE = 'expiration_update',
  RESPONSIBLE_CHANGE = 'responsible_change',
  VALIDATION_CHANGE = 'validation_change',
}

export enum CredentialValidationStatus {
  VALID = 'VALID',
  PENDING_20H = 'PENDING_20H',
  MISSING_DOCUMENTS = 'MISSING_DOCUMENTS',
  INVALID = 'INVALID',
}

export enum PhvaComplianceStatus {
  COMPLIES = 'COMPLIES',
  PENDING = 'PENDING',
  NON_COMPLIANT = 'NON_COMPLIANT',
}
