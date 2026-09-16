import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { RestrictionStatus, RestrictionType } from '../schemas/work-restriction.schema';

/**
 * Creación de una restricción/recomendación médico-laboral (3.1.6 — FASE 33).
 *
 * La empresa (companyId) SIEMPRE se deriva de la sesión autenticada en el
 * controller; nunca se acepta del cuerpo de la petición.
 *
 * METADATA-ONLY: este DTO NO acepta diagnóstico, código CIE, historia clínica,
 * resultados clínicos, medicamentos, tratamientos ni síntomas. Solo gestiona
 * el hecho administrativo/operacional de la restricción/recomendación laboral.
 */
export class CreateWorkRestrictionDto {
  // employeeId: trabajador asociado; debe pertenecer al mismo tenant (service).
  @IsMongoId()
  employeeId!: string;

  // restrictionType: clasificación administrativa tipada (enum, no texto libre).
  @IsEnum(RestrictionType)
  restrictionType!: RestrictionType;

  // status: opcional (default ACTIVE en schema). FOLLOW_UP exige followUpDate.
  @IsOptional()
  @IsEnum(RestrictionStatus)
  status?: RestrictionStatus;

  // receivedAt: fecha de recepción del concepto por la empresa (obligatoria).
  @IsDateString()
  receivedAt!: string;

  // effectiveFrom: inicio de vigencia de la medida laboral (opcional).
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  // effectiveUntil: fin de vigencia; >= effectiveFrom (validado en service).
  @IsOptional()
  @IsDateString()
  effectiveUntil?: string;

  // responsibleUserId: responsable de la gestión; mismo tenant (service).
  @IsOptional()
  @IsMongoId()
  responsibleUserId?: string;

  // actions: acciones laborales registradas (gestión laboral, NO tratamiento médico).
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  actions?: string;

  // followUpDate: próximo seguimiento administrativo (obligatorio si FOLLOW_UP).
  @IsOptional()
  @IsDateString()
  followUpDate?: string;

  // followUpStatus: resultado del último seguimiento (administrativo, no clínico).
  @IsOptional()
  @IsString()
  @MaxLength(500)
  followUpStatus?: string;

  // evidence: referencia documental administrativa (NO documento clínico completo).
  @IsOptional()
  @IsString()
  @MaxLength(300)
  evidence?: string;

  // active: opcional (por defecto true).
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
