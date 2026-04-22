import { IsEnum, IsMongoId, IsString } from 'class-validator';
import { AlertSeverity } from '../schemas/alert.schema';

export class CreateAlertDto {
  @IsMongoId()
  companyId!: string;

  @IsString()
  type!: string;

  @IsString()
  message!: string;

  @IsEnum(AlertSeverity)
  severity!: AlertSeverity;
}
