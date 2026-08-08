import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { TemplatesService } from '../../templates/templates.service';
import { DocumentTemplateType, ResolvedTemplate } from '../types/document-generation.types';

/**
 * TemplateSourceService: integración del motor con las plantillas existentes.
 *
 * Fase 1 — Resuelve las plantillas legadas del módulo templates (Template schema)
 * y las adapta al contrato del Document Generation Engine sin duplicar el schema:
 *
 *   { id, name, storageUrl, variables, version }
 *
 * storageUrl se mapea desde storagePath (ubicación real en Firebase Storage).
 * Como la plantilla legada no declara documentType ni version, se usa
 * DocumentTemplateType.OTHER y version 1 como valores canónicos.
 */
@Injectable()
export class TemplateSourceService {
  constructor(private readonly templatesService: TemplatesService) {}

  /**
   * Resuelve una plantilla existente del módulo templates validando pertenencia
   * por empresa (delegado en TemplatesService.findByIdForCompany).
   *
   * @param templateId - Id de la plantilla legada.
   * @param companyId - Empresa propietaria (evita acceso cruzado).
   */
  async getTemplate(templateId: string, companyId: Types.ObjectId): Promise<ResolvedTemplate> {
    const template = await this.templatesService.findByIdForCompany(templateId, companyId);

    return {
      id: template._id.toString(),
      name: template.name,
      storageUrl: template.storagePath,
      variables: template.variables,
      version: 1,
      documentType: DocumentTemplateType.OTHER,
    };
  }
}
