import { Type } from 'class-transformer';
import { IsDate, IsMongoId, IsOptional, IsString } from 'class-validator';

export class UpdateIncidentDto {
  @IsOptional()
  @IsMongoId()
  employeeId?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  severity?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
