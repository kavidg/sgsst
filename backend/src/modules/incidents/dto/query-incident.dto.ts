import { IsEnum, IsOptional } from 'class-validator';
import { InvestigationType } from '../schemas/incident.schema';

/**
 * DTO para filtros de consulta de GET /incidents.
 *
 * FASE 6 — H-02: Permite filtrar por investigationType desde el query string.
 * investigationType es el ÚNICO filtro permitido; companyId siempre proviene
 * del contexto autenticado/JWT.
 */
export class QueryIncidentDto {
  @IsOptional()
  @IsEnum(InvestigationType)
  investigationType?: InvestigationType;
}
