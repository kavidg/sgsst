import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { ApprovalEntity } from '../enums/approval-entity.enum';

/**
 * Filtros de la bandeja de solicitudes pendientes.
 */
export class PendingRequestsDto {
  @IsOptional()
  @IsEnum(ApprovalEntity)
  module?: ApprovalEntity;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
