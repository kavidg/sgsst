import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  ValidateIf,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  Validate,
} from 'class-validator';
import { FollowUpStatus } from '../enums/follow-up-status.enum';

/**
 * Coherencia de seguimiento (validada a nivel DTO, sin depender de hooks):
 * - requiresFollowUp true → followUpDueDate obligatorio.
 * - followUpStatus CLOSED sin requiresFollowUp true y sin fecha → incoherente.
 */
@ValidatorConstraint({ name: 'followUpCoherence', async: false })
export class FollowUpCoherenceConstraint implements ValidatorConstraintInterface {
  validate(_: unknown, args: ValidationArguments): boolean {
    const dto = args.object as UpdateControlVerificationFollowUpDto;
    if (dto.requiresFollowUp === true && !dto.followUpDueDate) {
      return false;
    }
    if (dto.requiresFollowUp === false && dto.followUpStatus === FollowUpStatus.OPEN) {
      return false;
    }
    return true;
  }

  defaultMessage(): string {
    return 'Seguimiento incoherente: requiresFollowUp=true exige followUpDueDate; requiresFollowUp=false no admite followUpStatus OPEN';
  }
}

/**
 * ETAPA 3 (PHVA 4.2.2) — DTO de actualización de seguimiento.
 *
 * NO permite modificar evidencia histórica: result, verificationDate,
 * verifiedBy, observations, controlId, controlDescriptionSnapshot,
 * companyId ni riskId quedan fuera del whitelist del ValidationPipe
 * (cualquiera de esas propiedades en el body es rechazada con 400).
 */
export class UpdateControlVerificationFollowUpDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  requiresFollowUp?: boolean;

  @IsOptional()
  @IsDateString()
  followUpDueDate?: string;

  @IsOptional()
  @IsEnum(FollowUpStatus)
  followUpStatus?: FollowUpStatus;

  @Validate(FollowUpCoherenceConstraint)
  coherenceGuard?: boolean;
}
