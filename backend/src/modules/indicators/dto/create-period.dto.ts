import { IsString, MaxLength } from 'class-validator';

export class CreatePeriodDto {
  @IsString()
  @MaxLength(20)
  period!: string;
}
