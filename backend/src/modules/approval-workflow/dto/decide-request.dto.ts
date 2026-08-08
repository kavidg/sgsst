import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { ApprovalDecision } from '../enums/approval-decision.enum';

/**
 * Entrada para decidir sobre una solicitud de aprobación.
 */
export class DecideRequestDto {
  @IsEnum(ApprovalDecision)
  decision!: ApprovalDecision;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  comments?: string;

  /**
   * Metadatos específicos del módulo (p.ej. evidencia de firma digital) que
   * el adapter puede consumir al aplicar la decisión sobre la entidad real.
   */
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
