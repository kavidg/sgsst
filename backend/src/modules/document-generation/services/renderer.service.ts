import { Injectable, Logger } from '@nestjs/common';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { DocumentRenderer, RenderableTemplate, RendererFormat } from '../types/renderer.types';
import { StorageService } from './storage.service';
import { PdfRenderer } from './pdf-renderer.service';

/**
 * Renderer DOCX basado en docxtemplater + PizZip.
 *
 * Lee la plantilla .docx (zip), reemplaza los placeholders ({company.name},
 * {responsible.name}, ...) con las variables resueltas y devuelve el buffer
 * del documento renderizado.
 */
export class DocxRenderer implements DocumentRenderer {
  async render(template: Buffer, variables: Record<string, unknown>): Promise<Buffer> {
    const zip = new PizZip(template);
    const document = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      // Los placeholders del motor usan llaves simples ({company.name}) para
      // coincidir con el formato de variables de VariableResolverService.
      delimiters: { start: '{', end: '}' },
      // El parser por defecto de docxtemplater (v3) trata el contenido del
      // placeholder como una clave literal: {company.name} buscaría
      // data['company.name'] y no data.company.name. VariableResolverService
      // entrega un objeto ANIDADO ({ company: { name } }), por lo que se
      // resuelve el path punto por punto contra el scope.
      //
      // NOTA de migración: el generador DOCX existente (templates.controller)
      // usa el parser por defecto y recibe claves planas desde el frontend
      // (GenerateTemplatePayload.data: Record<string, ...>). Al migrarlo al
      // Document Generation Engine habrá que alinear el shape de datos
      // (aplanar el contexto o adaptar la resolución) según este contrato.
      //
      // VariableResolverService devuelve null para variables faltantes: sin
      // nullGetter, docxtemplater insertaría el literal "undefined" en el
      // documento generado. Devolver cadena vacía mantiene la filosofía de la
      // Fase 0 (no lanzar excepción, no bloquear la generación).
      nullGetter: () => '',
      parser: (tag: string) => ({
        get: (scope: unknown): unknown => {
          if (tag === '.') {
            return scope;
          }
          const parts = tag.split('.');
          let value: unknown = scope;
          for (const part of parts) {
            if (value == null || typeof value !== 'object') {
              return undefined;
            }
            value = (value as Record<string, unknown>)[part];
          }
          return value;
        },
      }),
    });

    document.render(variables);

    return document.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });
  }
}

/**
 * RendererService: abstracción Strategy del motor de generación.
 *
 * Selecciona el renderer según el formato de la plantilla:
 * - DOCX → DocxRenderer (docxtemplater + PizZip).
 * - PDF  → preparado en el contrato, sin implementación en esta fase.
 */
@Injectable()
export class RendererService {
  private readonly logger = new Logger(RendererService.name);
  private readonly renderers: Partial<Record<RendererFormat, DocumentRenderer>>;
  private readonly pdfRenderer: PdfRenderer;

  constructor(private readonly storageService: StorageService) {
    this.pdfRenderer = new PdfRenderer();
    this.renderers = {
      [RendererFormat.DOCX]: new DocxRenderer(),
    };

    // FASE 7 — PDF: se registra el renderer solo si LibreOffice está disponible.
    // Si no está instalado, el sistema continúa funcionando con DOCX.
    if (this.pdfRenderer.isAvailable()) {
      this.renderers[RendererFormat.PDF] = this.pdfRenderer;
      this.logger.log('PDF renderer registered (LibreOffice found)');
    } else {
      this.logger.warn('PDF renderer NOT available: LibreOffice not found. Only DOCX generation is supported.');
    }
  }

  /**
   * Indica si el renderer PDF está disponible en el sistema.
   */
  isPdfAvailable(): boolean {
    return this.pdfRenderer.isAvailable();
  }

  /**
   * Renderiza una plantilla aplicando las variables resueltas.
   *
   * @param format - Formato de salida (DOCX / PDF).
   * @param template - Plantilla descargable (contrato RenderableTemplate).
   * @param variables - Variables ya resueltas por VariableResolverService.
   */
  async renderDocument(
    format: RendererFormat,
    template: RenderableTemplate,
    variables: Record<string, unknown>,
  ): Promise<Buffer> {
    const renderer = this.renderers[format];

    if (!renderer) {
      // Formato aún no implementado (PDF llega en fases posteriores).
      throw new Error(`Renderer for format ${format} is not implemented yet`);
    }

    const templateBuffer = await this.storageService.download(template.storageUrl);

    return renderer.render(templateBuffer, variables);
  }
}
