/**
 * Servicio de generación documental del DocumentGenerationEngine (SPRINT FRONT-6).
 *
 * Encapsula el acceso a plantillas y la generación de instancias documentales.
 *
 * Las plantillas provienen de:
 *   GET /templates/company/:companyId     (módulo templates)
 *
 * La generación utiliza:
 *   POST /templates/generate/:templateId
 *
 * El endpoint de generación delega internamente al DocumentGenerationEngine
 * (DocumentGenerationService.generateDocument), que renderiza el DOCX, persiste
 * la instancia (DocumentInstance) y registra la trazabilidad.
 *
 * No duplica autenticación (apiFetch / api.ts maneja el header x-company-id
 * mediante withCompanyHeader).
 */
import {
  fetchTemplatesByCompany,
  generateTemplate,
} from '../api';
import type { TemplateModel, GenerateTemplatePayload } from '../api';

/** Adaptador de plantilla para UI del modal de generación. */
export interface AvailableTemplate {
  id: string;
  name: string;
  variables: string[];
}

/**
 * Devuelve las plantillas disponibles de la empresa activa para que el usuario
 * seleccione cuál usar en la generación manual.
 *
 * Consume GET /templates/company/:companyId (módulo templates).
 */
export async function getAvailableTemplates(
  token: string,
  companyId: string,
): Promise<AvailableTemplate[]> {
  const templates: TemplateModel[] = await fetchTemplatesByCompany(token, companyId);
  return templates.map((tpl) => ({
    id: tpl._id,
    name: tpl.name,
    variables: tpl.variables ?? [],
  }));
}

/**
 * Genera un documento usando el DocumentGenerationEngine.
 *
 * El frontend recibe el resultado como blob (el endpoint actual de templates
 * devuelve el archivo binario para descarga directa). Tras la generación, el
 * motor también persiste una DocumentInstance, por lo que el catálogo se
 * actualiza automáticamente al recargar.
 *
 * @returns Blob descargable del documento generado.
 */
export async function generateDocument(
  token: string,
  templateId: string,
  variables: Record<string, string | number | boolean | null>,
): Promise<{ blob: Blob; fileName: string }> {
  const payload: GenerateTemplatePayload = { data: variables };
  return generateTemplate(token, templateId, payload);
}