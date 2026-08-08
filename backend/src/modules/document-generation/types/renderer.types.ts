/**
 * Tipos compartidos del Renderer del Document Generation Engine.
 *
 * Fase 0: solo el renderer DOCX está implementado (docxtemplater + PizZip).
 * El renderer PDF queda preparado como formato soportado por el contrato pero
 * sin implementación todavía.
 */

/** Formatos de documento soportados por el motor de generación. */
export enum RendererFormat {
  DOCX = 'DOCX',
  PDF = 'PDF',
}

/** Módulo del sistema que solicita la generación de una instancia. */
export enum DocumentSourceModule {
  PHVA_ADVANCED = 'PHVA_ADVANCED',
  DOCUMENT_MANAGEMENT = 'DOCUMENT_MANAGEMENT',
  TEMPLATES = 'TEMPLATES',
  OTHER = 'OTHER',
}

/**
 * Plantilla mínima que el renderer necesita para generar un documento.
 *
 * Define solo el contrato estructural (storageUrl) para que tanto las plantillas
 * del motor (DocumentTemplate) como las legadas del módulo templates (resueltas
 * por TemplateSourceService) puedan renderizarse sin acoplarse al schema.
 */
export interface RenderableTemplate {
  storageUrl: string;
}

/** Estado del ciclo de vida de una instancia documental generada. */
export enum DocumentStatus {
  GENERATED = 'GENERATED',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  APPROVED = 'APPROVED',
  SIGNED = 'SIGNED',
  ARCHIVED = 'ARCHIVED',
}

/**
 * Contrato de un renderer (patrón Strategy).
 *
 * Cada formato implementa render() con su librería específica. El RendererService
 * selecciona el renderer según el formato de la plantilla.
 */
export interface DocumentRenderer {
  /**
   * Renderiza una plantilla aplicando las variables resueltas.
   *
   * @param template - Buffer de la plantilla descargada desde Storage.
   * @param variables - Variables ya resueltas por VariableResolverService.
   * @returns Buffer del documento renderizado.
   */
  render(template: Buffer, variables: Record<string, unknown>): Promise<Buffer>;
}
