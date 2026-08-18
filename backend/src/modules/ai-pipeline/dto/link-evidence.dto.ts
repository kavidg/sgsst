/**
 * DTO de vinculación de evidencia a una tarea del plan anual.
 *
 * Solo datos de archivo; NO acepta companyId (el tenant proviene siempre del
 * contexto autenticado en el controller).
 */
export class LinkEvidenceDto {
  fileUrl!: string;
  fileType!: string;
}
