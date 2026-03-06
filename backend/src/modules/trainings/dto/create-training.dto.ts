import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsString } from 'class-validator';

export class CreateTrainingDto {
  @IsString()
  topic!: string;

  @Type(() => Date)
  @IsDate()
  date!: Date;

  @IsString()
  instructor!: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsString()
  evidenceUrl?: string;
}
