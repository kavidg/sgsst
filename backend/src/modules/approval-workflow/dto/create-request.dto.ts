import { ArrayUnique, IsArray, IsEnum, IsMongoId, IsOptional, IsString } from 'class-validator';
import { ApprovalEntity } from '../enums/approval-entity.enum';

/**
 * Entrada para crear una solicitud de aprobación.
 */
export class CreateRequestDto {
  @IsEnum(ApprovalEntity)
  module!: ApprovalEntity;

  @IsString()
  entityType!: string;

  @IsMongoId()
  entityId!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayUnique()
  assignedRoles?: string[];

  @IsOptional()
  @IsString()
  comments?: string;
}
