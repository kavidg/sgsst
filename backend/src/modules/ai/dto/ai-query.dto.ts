import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Entrada del endpoint POST /ai/orchestrator/query.
 */
export class AiQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  question!: string;
}
