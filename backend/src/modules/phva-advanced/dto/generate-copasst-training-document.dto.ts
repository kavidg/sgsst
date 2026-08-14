import { Type } from 'class-transformer';
import { IsInt, IsMongoId, Min } from 'class-validator';

/**
 * Solicitud de generación del Certificado de capacitación COPASST (1.1.7).
 *
 * El certificado se genera para un participante CONCRETO de una sesión
 * EJECUTADA. `participantUserId` es el userId del snapshot histórico de la
 * sesión (nunca se re-resuelve el miembro actual del periodo).
 *
 * NUNCA incluye `companyId`: el backend lo resuelve desde el contexto
 * autenticado.
 */
export class GenerateCopasstTrainingCertificateDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sessionIndex!: number;

  @IsMongoId()
  participantUserId!: string;
}

/**
 * Solicitud de generación de la Lista de asistencia por sesión (1.1.7).
 *
 * La lista usa EXCLUSIVAMENTE el snapshot histórico de participantes de la
 * sesión. Se permite para sesiones ejecutadas y programadas (la UI deja el
 * criterio al usuario; el backend solo valida que la sesión exista).
 */
export class GenerateCopasstTrainingAttendanceDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sessionIndex!: number;
}
