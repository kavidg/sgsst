import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApprovalDecision } from '../../approval-workflow/enums/approval-decision.enum';

/**
 * Solicitud de decisión sobre la aprobación de la Capacitación COPASST
 * (1.1.7, Fase 5).
 *
 * Reutiliza el ApprovalDecision canónico del Approval Workflow Core (mismo
 * contrato que el endpoint genérico /decide). NUNCA incluye `companyId`: el
 * backend lo resuelve desde el contexto autenticado (x-company-id).
 */
export class DecideCopasstTrainingApprovalDto {
  @IsEnum(ApprovalDecision)
  decision!: ApprovalDecision;

  /** Motivo de rechazo (obligatorio para REJECTED — validado en el controller). */
  @IsOptional()
  @IsString()
  reason?: string;

  /** Comentario opcional para aprobación o solicitud de ajustes. */
  @IsOptional()
  @IsString()
  comments?: string;
}
