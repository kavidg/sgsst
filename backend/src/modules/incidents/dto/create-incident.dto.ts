import { Type } from 'class-transformer';
import { IsDate, IsMongoId, IsString } from 'class-validator';

export class CreateIncidentDto {
  @IsMongoId()
  employeeId!: string;

  @Type(() => Date)
  @IsDate()
  date!: Date;

  @IsString()
  type!: string;

  @IsString()
  description!: string;

  @IsString()
  severity!: string;

  @IsString()
  status!: string;
}
