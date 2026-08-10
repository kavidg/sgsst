import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Participante COPASST de una sesión de 1.1.7 (Fase 2).
 *
 * El cliente envía únicamente `userId` para sesiones nuevas: el backend valida
 * la pertenencia al COPASST activo y construye el snapshot desde la fuente de
 * verdad (CopasstPeriod.members). Los campos de snapshot (name, committeeRole,
 * representationType) NO son de confianza del cliente: se rellenan desde el
 * miembro maestro. Se declaran opcionales para tolerar sesiones históricas que
 * ya traen su snapshot embebido (inmutable).
 */
export class CopasstTrainingParticipantDto {
  @IsMongoId()
  userId!: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  committeeRole?: string;

  @IsOptional()
  @IsString()
  representationType?: string;
}

/**
 * Sesión de capacitación COPASST (1.1.7). Espejo del sub-schema compartido
 * `Session` + `copasstParticipants`. Permite programar (no ejecutada) y
 * registrar ejecución (status 'Ejecutada' o completionDate).
 */
export class CopasstTrainingSessionDto {
  @IsNotEmpty()
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  responsible?: string;

  @IsOptional()
  @IsDateString()
  scheduledDate?: string;

  @IsOptional()
  @IsDateString()
  expirationDate?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  participants?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidences?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  multimedia?: string[];

  @IsOptional()
  @IsString()
  instructor?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  duration?: string;

  @IsOptional()
  @IsString()
  evaluation?: string;

  @IsOptional()
  @IsDateString()
  completionDate?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CopasstTrainingParticipantDto)
  copasstParticipants?: CopasstTrainingParticipantDto[];
}

/**
 * DTO de actualización de la entidad 1.1.7 (Fase 2).
 *
 * NO incluye companyId, itemCode ni datos maestros del miembro: el backend los
 * resuelve/valida siempre (whitelist + forbidNonWhitelisted del ValidationPipe
 * global rechazan cualquier campo no declarado).
 */
export class UpdateCopasstTrainingDto {
  @IsOptional()
  @IsInt()
  @Min(2000)
  year?: number;

  @IsOptional()
  @IsMongoId()
  periodId?: string;

  @IsOptional()
  @IsArray()
  annualProgram?: unknown[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CopasstTrainingSessionDto)
  sessions?: CopasstTrainingSessionDto[];

  @IsOptional()
  @IsArray()
  checklistTemplate?: unknown[];

  @IsOptional()
  @IsArray()
  evaluationAttempts?: unknown[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  certificates?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidenceFiles?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attendanceEvidence?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  signatureEvidence?: string[];

  @IsOptional()
  @IsArray()
  signatures?: unknown[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  alerts?: string[];
}
