import {
  IsDateString,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  HazardousSubstanceStatus,
  SdsStatus,
  SubstanceType,
} from '../schemas/hazardous-substance.schema';

export class CreateHazardousSubstanceDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  casNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  hazardClassification?: string;

  @IsEnum(SubstanceType)
  substanceType!: SubstanceType;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  supplier?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  storageLocation?: string;

  @IsEnum(SdsStatus)
  sdsStatus!: SdsStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  sdsUrl?: string;

  @IsOptional()
  @IsDateString()
  sdsIssueDate?: string;

  @IsOptional()
  @IsDateString()
  sdsReviewDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  controlsImplemented?: string;

  @IsOptional()
  @IsMongoId()
  riskId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsEnum(HazardousSubstanceStatus)
  status?: HazardousSubstanceStatus;
}
