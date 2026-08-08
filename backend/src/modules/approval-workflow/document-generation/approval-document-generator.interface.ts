import { Types } from 'mongoose';
import { ApprovalDecision } from '../enums/approval-decision.enum';
import { ApprovalEntity } from '../enums/approval-entity.enum';
import { ApprovalActor } from '../interfaces/approval-actor.interface';

/**
 * Token de inyección del registro de generadores documentales del Approval
 * Workflow Core (Fase 2.1).
 *
 * Cada generador registrado permite que un documento formal del SG-SST se
 * genere automáticamente cuando su entidad de negocio es aprobada. El
 * registro se construye con el mismo patrón multi-provider de APPROVAL_ADAPTERS:
 * cada módulo aporta sus generadores y el Core los agrega sin conocer su
 * lógica interna.
 */
export const APPROVAL_DOCUMENT_GENERATORS = 'APPROVAL_DOCUMENT_GENERATORS';

/**
 * Contexto de una decisión APPROVED que puede originar la generación de un
 * documento formal. Es construido por el Approval Workflow Core a partir del
 * ApprovalEvent registrado; NO contiene lógica de negocio del módulo.
 */
export interface ApprovalDocumentContext {
  companyId: string;
  module: ApprovalEntity;
  /** Entidad de negocio aprobada (p.ej. RESPONSIBLE_SG_SST). */
  entityType: string;
  entityId: string;
  requestId: string;
  decision: ApprovalDecision;
  actor: ApprovalActor;
  /** Id del ApprovalEvent APPROVED (trazabilidad en la DocumentInstance). */
  approvalEventId?: Types.ObjectId;
  approvedAt?: Date;
}

/**
 * Clave adicional (module + entityType) bajo la que un generador debe quedar
 * registrado además de su clave canónica (module + entityType).
 *
 * Fase 3: el flujo real de aprobación del COPASST usa module=COPASST +
 * entityType='CopasstPeriod' (ver copasst.controller), mientras que la clave
 * normalizada del Document Generation Engine es PHVA_ADVANCED:'COPASST'. El
 * CopasstDocumentGenerator se registra bajo su clave real y declara la clave
 * normalizada como alias: ambas apuntan al mismo generador para no duplicar
 * generación.
 */
export interface ApprovalDocumentRegistryKey {
  module: ApprovalEntity;
  entityType: string;
}

/**
 * Contrato de un generador de documentos post-aprobación.
 *
 * Un generador conecta una entidad aprobada del sistema con el Document
 * Generation Engine SIN conocer el Approval Workflow: recibe el contexto de la
 * decisión y delega en el servicio de negocio del módulo (que a su vez usa
 * DocumentGenerationService, la única ruta de generación).
 *
 * La interfaz es la preparación para futuras entidades del SG-SST:
 *   PHVA_ADVANCED: RESPONSIBLE_SG_SST (Fase 2.1), COPASST (Fase 3, clave
 *   real COPASST:'CopasstPeriod' + alias PHVA_ADVANCED:'COPASST'),
 *   RESPONSIBILITIES (Fase 4, clave real
 *   PHVA_ADVANCED:'PhvaAdvancedResponsibilities' + alias
 *   PHVA_ADVANCED:'RESPONSIBILITIES'), RESOURCE_ASSIGNMENT (Fase 5, clave
 *   real PHVA_ADVANCED:'PhvaAdvancedResourceAssignment' + alias
 *   PHVA_ADVANCED:'RESOURCE_ASSIGNMENT'), SST_POLICY (Fase 6, clave real
 *   PHVA_ADVANCED:'PhvaAdvancedSstPolicy' + alias PHVA_ADVANCED:'SST_POLICY')
 *   y CONVIVENCIA (fases posteriores).
 */
export interface ApprovalDocumentGenerator {
  /** Módulo al que pertenece la entidad aprobada (clave canónica). */
  readonly module: ApprovalEntity;
  /** Entidad de negocio que este generador sabe convertir en documento. */
  readonly entityType: string;

  /**
   * Claves adicionales (module + entityType) bajo las que el mismo generador
   * debe quedar registrado. Permite que un flujo de aprobación cuyo módulo
   * real difiere del módulo normalizado del Document Generation Engine siga
   * resolviendo el generador correcto sin duplicarlo.
   */
  readonly aliases?: ReadonlyArray<ApprovalDocumentRegistryKey>;

  /**
   * Genera (o reutiliza) el documento formal de la entidad aprobada.
   *
   * @param context - Contexto de la decisión APPROVED (datos del evento).
   */
  generate(context: ApprovalDocumentContext): Promise<unknown>;
}
