import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  ParticipationActivityType,
  ParticipationStatus,
} from '../schemas/worker-participation.schema';

export class CreateWorkerParticipationDto {
  @IsEnum(ParticipationActivityType)
  activityType!: ParticipationActivityType;

  @IsDateString()
  participationDate!: string;

  @IsArray()
  @IsMongoId({ each: true })
  participants!: string[];

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observations?: string;

  @IsOptional()
  @IsMongoId()
  riskId?: string;

  @IsOptional()
  @IsString()
  process?: string;

  @IsOptional()
  @IsString()
  area?: string;

  @IsOptional()
  @IsString()
  activity?: string;

  @IsOptional()
  @IsEnum(ParticipationStatus)
  status?: ParticipationStatus;
}
