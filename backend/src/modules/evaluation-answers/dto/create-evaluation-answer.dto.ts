import { IsBoolean, IsMongoId, IsOptional, IsString } from 'class-validator';

export class CreateEvaluationAnswerDto {
  @IsMongoId()
  evaluationId!: string;

  @IsMongoId()
  questionId!: string;

  @IsBoolean()
  answer!: boolean;

  @IsOptional()
  @IsString()
  observation?: string;
}
