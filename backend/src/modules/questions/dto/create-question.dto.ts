import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class CreateQuestionDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  question!: string;

  @IsString()
  @IsNotEmpty()
  category!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxScore!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  order!: number;
}
