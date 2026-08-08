import { Types } from 'mongoose';
import { DocumentSourceModule } from './renderer.types';

/**
 * Tipos compartidos del Document Generation Engine.
 *
 * Fase 1: el motor se convierte en la única ruta de generación interna. La
 * resolución de plantillas legadas (módulo templates) se hace mediante
 * TemplateSourceService, y los documentos generados quedan registrados como
 * DocumentInstance (trazabilidad documental).
 */

// Re-export de los enums compartidos definidos en renderer.types.ts.
export { DocumentRenderer, DocumentSourceModule, DocumentStatus, RenderableTemplate, RendererFormat } from './renderer.types';

/** Tipos de documento SG-SST que el motor podrá generar. */
export enum DocumentTemplateType {
  RESPONSABLE_SST = 'RESPONSABLE_SST',
  RESPONSIBILITIES_MATRIX = 'RESPONSIBILITIES_MATRIX',
  RESOURCE_ASSIGNMENT = 'RESOURCE_ASSIGNMENT',
  TRAINING_PLAN = 'TRAINING_PLAN',
  SST_POLICY = 'SST_POLICY',
  ANNUAL_WORK_PLAN = 'ANNUAL_WORK_PLAN',
  /** Documento formal del Responsable del SG-SST (PHVA 1.1.1, Resolución 0312 de 2019). */
  PHVA_RESPONSIBLE_SG_SST = 'PHVA_RESPONSIBLE_SG_SST',
  /** Documento formal de conformación del COPASST (PHVA, aprobación del periodo). */
  PHVA_COPASST = 'PHVA_COPASST',
  /** Documento formal de la Matriz de Responsabilidades del SG-SST (PHVA 1.1.2). */
  PHVA_RESPONSIBILITIES = 'PHVA_RESPONSIBILITIES',
  /** Documento formal de la Asignación de Recursos para el SG-SST (PHVA 1.1.3). */
  PHVA_RESOURCE_ASSIGNMENT = 'PHVA_RESOURCE_ASSIGNMENT',
  /** Documento formal de la Política de Seguridad y Salud en el Trabajo (PHVA 2.1.1). */
  PHVA_SST_POLICY = 'PHVA_SST_POLICY',
  OTHER = 'OTHER',
}

/**
 * Entidad de origen del documento del Responsable del SG-SST (PHVA 1.1.1).
 * Se usa como sourceEntity de la DocumentInstance y como entityType del
 * ApprovalRequest para el listener de aprobación.
 */
export const PHVA_SOURCE_ENTITY_RESPONSIBLE_SG_SST = 'RESPONSIBLE_SG_SST';

/**
 * Entidad de origen del documento de conformación del COPASST.
 *
 * Fase 3: se usa como sourceEntity de la DocumentInstance. La clave REAL del
 * flujo de aprobación COPASST es module=COPASST + entityType='CopasstPeriod'
 * (ver copasst.controller), por lo que el generador se registra bajo esa clave
 * Y bajo PHVA_ADVANCED:'COPASST' como clave normalizada (ambas apuntan al
 * mismo generador para no duplicar generación).
 */
export const PHVA_SOURCE_ENTITY_COPASST = 'COPASST';

/**
 * Entidad de origen del documento de la Matriz de Responsabilidades del SG-SST
 * (PHVA 1.1.2).
 *
 * Fase 4: se usa como sourceEntity de la DocumentInstance. La clave REAL del
 * flujo de aprobación es module=PHVA_ADVANCED +
 * entityType='PhvaAdvancedResponsibilities' (ver el helper
 * ensurePendingResponsibilitiesRequest del phva-advanced.controller), por lo
 * que el generador se registra bajo esa clave Y bajo
 * PHVA_ADVANCED:'RESPONSIBILITIES' como clave normalizada (ambas apuntan al
 * mismo generador para no duplicar generación).
 */
export const PHVA_SOURCE_ENTITY_RESPONSIBILITIES = 'RESPONSIBILITIES';

/**
 * Entidad de origen del documento de la Asignación de Recursos para el SG-SST
 * (PHVA 1.1.3).
 *
 * Fase 5: se usa como sourceEntity de la DocumentInstance. La clave REAL del
 * flujo de aprobación es module=PHVA_ADVANCED +
 * entityType='PhvaAdvancedResourceAssignment' (ver el
 * submitResourceAssignment del phva-advanced.controller), por lo que el
 * generador se registra bajo esa clave Y bajo
 * PHVA_ADVANCED:'RESOURCE_ASSIGNMENT' como clave normalizada (ambas apuntan
 * al mismo generador para no duplicar generación).
 */
export const PHVA_SOURCE_ENTITY_RESOURCE_ASSIGNMENT = 'RESOURCE_ASSIGNMENT';

/**
 * Entidad de origen del documento de la Política de Seguridad y Salud en el
 * Trabajo (PHVA 2.1.1).
 *
 * Fase 6: se usa como sourceEntity de la DocumentInstance. La clave REAL del
 * flujo de aprobación es module=PHVA_ADVANCED +
 * entityType='PhvaAdvancedSstPolicy' (ver el approveSstPolicy del
 * phva-advanced.controller), por lo que el generador se registra bajo esa
 * clave Y bajo PHVA_ADVANCED:'SST_POLICY' como clave normalizada (ambas
 * apuntan al mismo generador para no duplicar generación).
 */
export const PHVA_SOURCE_ENTITY_SST_POLICY = 'SST_POLICY';

/**
 * Metadatos de aprobación de una instancia documental generada.
 *
 * Fase 2: el documento formal del Responsable del SG-SST se genera DESPUÉS de
 * la aprobación (ApprovalWorkflowService). Estos metadatos quedan persistidos
 * en la DocumentInstance para trazabilidad de la aprobación.
 */
export interface DocumentApprovalMetadata {
  /** Estado de la aprobación (p.ej. 'APPROVED'). */
  status: string;
  /** Usuario aprobador (ObjectId resuelto desde el actor). */
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  approvalEventId?: Types.ObjectId;
  approvalRequestId?: Types.ObjectId;
}

/** Origen de la plantilla: del sistema o subida por la empresa. */
export enum DocumentTemplateSource {
  SYSTEM = 'SYSTEM',
  COMPANY = 'COMPANY',
}

/**
 * Contexto de resolución de variables para una generación.
 *
 * Estructura preparada para que VariableResolverService resuelva variables como
 * "company.name" o "responsible.name". En esta fase el contexto es opcional y no
 * se integra todavía con PHVA ni con otros módulos.
 */
export interface VariableContext {
  company?: Record<string, unknown>;
  user?: Record<string, unknown>;
  responsible?: Record<string, unknown>;
  date?: string | Date;
  approval?: Record<string, unknown>;
}

/**
 * Plantilla resuelta por TemplateSourceService (fuente: módulo templates).
 *
 * Fase 1: TemplateSourceService adapta la plantilla legada (Template schema del
 * módulo templates) al contrato del motor, sin duplicar el schema.
 */
export interface ResolvedTemplate {
  id: string;
  name: string;
  storageUrl: string;
  variables: string[];
  version: number;
  documentType: DocumentTemplateType;
}

/** Solicitud de generación de una instancia documental. */
export interface DocumentGenerationRequest {
  companyId: Types.ObjectId;
  templateId: string;
  /** Módulo de origen; por defecto TEMPLATES (plantillas legadas). */
  sourceModule?: DocumentSourceModule;
  /** Entidad de origen; por defecto el documentType de la plantilla. */
  sourceEntity?: string;
  sourceEntityId?: Types.ObjectId;
  /** Usuario que solicita la generación (opcional en esta fase). */
  generatedBy?: Types.ObjectId;
  /** Contexto de variables (anidado nuevo o plano legado). */
  context?: VariableContext | Record<string, unknown>;
  /** Metadatos de aprobación (documento generado tras aprobación, Fase 2). */
  approval?: DocumentApprovalMetadata;
}

/** Resultado de una generación documental. */
export interface DocumentGenerationResult {
  instanceId: Types.ObjectId;
  fileUrl: string;
  storagePath: string;
  version: number;
}
