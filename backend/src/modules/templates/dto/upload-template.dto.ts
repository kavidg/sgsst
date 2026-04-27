import { IsArray, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UploadTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(180)
  name!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variables?: string[];
}
