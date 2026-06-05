import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreatePlanSubtaskDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}

export class UpdatePlanSubtaskDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}
