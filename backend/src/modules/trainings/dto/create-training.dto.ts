import { Type } from 'class-transformer';
import { IsArray, IsDate, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

class TrainingAttendanceControlDto {
  @IsOptional()
  @IsString()
  initialListUrl?: string;

  @IsOptional()
  @IsString()
  middleListUrl?: string;

  @IsOptional()
  @IsString()
  finalListUrl?: string;
}

class TrainingMediaDto {
  @IsOptional()
  @IsArray()
  videos?: string[];

  @IsOptional()
  @IsArray()
  presentations?: string[];

  @IsOptional()
  @IsArray()
  pdfs?: string[];

  @IsOptional()
  @IsArray()
  images?: string[];

  @IsOptional()
  @IsArray()
  supportMaterials?: string[];
}

class TrainingStructureDto {
  @IsOptional()
  @IsString()
  duration?: string;

  @IsOptional()
  @IsString()
  modality?: string;

  @IsOptional()
  @IsNumber()
  participants?: number;
}

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

  @IsOptional()
  @IsString()
  copasstId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => TrainingAttendanceControlDto)
  attendanceControl?: TrainingAttendanceControlDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => TrainingMediaDto)
  media?: TrainingMediaDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => TrainingStructureDto)
  structure?: TrainingStructureDto;
}
