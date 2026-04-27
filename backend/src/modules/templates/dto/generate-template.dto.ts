import { IsNotEmpty, IsObject } from 'class-validator';

export class GenerateTemplateDto {
  @IsObject()
  @IsNotEmpty()
  data!: Record<string, string | number | boolean | null>;
}
