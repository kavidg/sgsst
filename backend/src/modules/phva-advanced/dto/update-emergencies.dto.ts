import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  ArrayMaxSize,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  EmergencyBrigadeFunction,
  EmergencyContactType,
  EmergencyImpact,
  EmergencyProbability,
  EmergencyResourceStatus,
  EmergencyResourceType,
} from '../schemas/phva-advanced-emergencies.schema';

/**
 * DTOs ESTRICTOS del dominio de Emergencias (5.1.1).
 *
 * SEGURIDAD (Etapa 5.1.1, patrón 4.2.6): sustituyen al antiguo
 * `Record<string, unknown>` de updateEmergencies. Quedan explícitamente fuera
 * del contrato los campos de scoring/identidad/servidor:
 *
 *   companyId, itemCode, complianceStatus, history, _id, threats
 *   (las amenazas se gestionan por endpoints propios, ver amenazas.dto).
 *
 * El ValidationPipe global (whitelist + forbidNonWhitelisted) rechaza cualquier
 * campo adicional enviado por el cliente, por lo que complianceStatus e
 * itemCode ya no son manipulables desde la API.
 */

const PROBABILITY_VALUES = Object.values(EmergencyProbability) as string[];
const IMPACT_VALUES = Object.values(EmergencyImpact) as string[];

export class EmergencyPlanSocializationDto {
  @IsOptional() @IsDateString()
  date?: string;

  @IsOptional() @IsInt() @Min(0) @Max(100)
  coveragePercentage?: number;

  @IsOptional() @IsString() @MaxLength(500)
  participants?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  observations?: string;

  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(20)
  @MaxLength(500, { each: true })
  evidence?: string[];
}

export class EmergencyPlanDto {
  @IsOptional() @IsString() @MaxLength(200)
  planName?: string;

  @IsOptional() @IsString() @MaxLength(50)
  version?: string;

  @IsOptional() @IsDateString()
  effectiveDate?: string;

  @IsOptional() @IsDateString()
  expirationDate?: string;

  @IsOptional() @IsString() @MaxLength(200)
  approvedBy?: string;

  @IsOptional() @IsDateString()
  approvedAt?: string;

  @IsOptional() @IsString() @MaxLength(500)
  documentUrl?: string;

  // ── Contenido estructurado (Etapa 5.1.1) ──
  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(50)
  @MaxLength(500, { each: true })
  objectives?: string[];

  @IsOptional() @IsString() @MaxLength(2000)
  scope?: string;

  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(50)
  @MaxLength(500, { each: true })
  preventiveActions?: string[];

  @IsOptional() @IsString() @MaxLength(5000)
  generalResponseProcedure?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  updateMechanism?: string;

  /** Usuario responsable del plan (debe existir en la misma empresa; se resuelve server-side). */
  @IsOptional() @IsMongoId()
  responsibleUserId?: string;

  /** Usuario aprobador del plan (debe existir en la misma empresa; se resuelve server-side). */
  @IsOptional() @IsMongoId()
  approverUserId?: string;

  @IsOptional() @ValidateNested() @Type(() => EmergencyPlanSocializationDto)
  socialization?: EmergencyPlanSocializationDto;

  /** Documento oficial asociado en DocumentMaster (EMERGENCY_PLAN); vínculo referencial únicamente. */
  @IsOptional() @IsMongoId()
  documentId?: string;
}

/**
 * PATCH /phva-advanced/emergencies — información general del módulo
 * (plan de emergencias + año). NO acepta amenazas: se gestionan con los
 * endpoints dedicados de la matriz (POST/PATCH/DELETE .../threats).
 */
export class UpdateSstEmergenciesDto {
  @IsOptional() @IsInt() @Min(2000) @Max(2100)
  year?: number;

  /** Razón/comentario del estado de cumplimiento (texto informativo; el estado lo decide la aprobación). */
  @IsOptional() @IsString() @MaxLength(500)
  complianceReason?: string;

  @IsOptional() @ValidateNested() @Type(() => EmergencyPlanDto)
  plan?: EmergencyPlanDto;
}

/** POST /phva-advanced/emergencies/threats — nueva amenaza/vulnerabilidad. */
export class CreateEmergencyThreatDto {
  @IsString() @MinLength(1) @MaxLength(200)
  scenario!: string;

  @IsString() @MinLength(1) @MaxLength(200)
  threat!: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  vulnerability?: string;

  @IsOptional() @IsString() @MaxLength(500)
  exposedPeople?: string;

  @IsOptional() @IsString() @MaxLength(500)
  exposedAssets?: string;

  @IsOptional() @IsString() @MaxLength(500)
  exposedProcesses?: string;

  @IsOptional() @IsIn(PROBABILITY_VALUES)
  probability?: EmergencyProbability;

  @IsOptional() @IsIn(IMPACT_VALUES)
  impact?: EmergencyImpact;

  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(20)
  @MaxLength(500, { each: true })
  preventiveMeasures?: string[];

  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(20)
  @MaxLength(500, { each: true })
  responseMeasures?: string[];

  @IsOptional() @IsString() @MaxLength(5000)
  responseProcedure?: string;

  @IsOptional() @IsBoolean()
  active?: boolean;
}

// ═══════════════════════════════════════════════════════════════════
// Etapa 2 (5.1.1) — Subrecursos: contactos, recursos, brigadas, evacuación
// ═══════════════════════════════════════════════════════════════════

const CONTACT_TYPE_VALUES = Object.values(EmergencyContactType) as string[];
const RESOURCE_TYPE_VALUES = Object.values(EmergencyResourceType) as string[];
const RESOURCE_STATUS_VALUES = Object.values(EmergencyResourceStatus) as string[];
const BRIGADE_FUNCTION_VALUES = Object.values(EmergencyBrigadeFunction) as string[];

/** POST /phva-advanced/emergencies/contacts — nuevo contacto de emergencia. */
export class CreateEmergencyContactDto {
  @IsIn(CONTACT_TYPE_VALUES)
  type!: EmergencyContactType;

  @IsString() @MinLength(1) @MaxLength(200)
  name!: string;

  /** Teléfono como string (admite extensión/prefijo); sin formato forzado. */
  @IsString() @MinLength(1) @MaxLength(50)
  phone!: string;

  @IsOptional() @IsString() @MaxLength(50)
  secondaryPhone?: string;

  @IsOptional() @IsString() @MaxLength(300)
  address?: string;

  @IsOptional() @IsString() @MaxLength(1000)
  notes?: string;

  /** Orden en la cadena de llamadas (1 = principal). Número positivo. */
  @IsOptional() @IsInt() @Min(1) @Max(99)
  callOrder?: number;

  @IsOptional() @IsBoolean()
  active?: boolean;
}

/** PATCH /phva-advanced/emergencies/contacts/:contactId — edición parcial. */
export class UpdateEmergencyContactDto {
  @IsOptional() @IsIn(CONTACT_TYPE_VALUES)
  type?: EmergencyContactType;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(200)
  name?: string;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(50)
  phone?: string;

  @IsOptional() @IsString() @MaxLength(50)
  secondaryPhone?: string;

  @IsOptional() @IsString() @MaxLength(300)
  address?: string;

  @IsOptional() @IsString() @MaxLength(1000)
  notes?: string;

  @IsOptional() @IsInt() @Min(1) @Max(99)
  callOrder?: number;

  /** Borrado lógico: active=false desactiva el contacto conservándolo. */
  @IsOptional() @IsBoolean()
  active?: boolean;
}

/** POST /phva-advanced/emergencies/equipment — nuevo recurso de emergencia. */
export class CreateEmergencyResourceDto {
  @IsIn(RESOURCE_TYPE_VALUES)
  resourceType!: EmergencyResourceType;

  @IsString() @MinLength(1) @MaxLength(200)
  name!: string;

  @IsOptional() @IsString() @MaxLength(200)
  location?: string;

  @IsOptional() @IsInt() @Min(1) @Max(10000)
  quantity?: number;

  @IsOptional() @IsIn(RESOURCE_STATUS_VALUES)
  operationalStatus?: EmergencyResourceStatus;

  @IsOptional() @IsDateString()
  lastInspectionDate?: string;

  @IsOptional() @IsDateString()
  nextInspectionDate?: string;

  @IsOptional() @IsString() @MaxLength(500)
  certificateUrl?: string;

  @IsOptional() @IsString() @MaxLength(500)
  evidenceUrl?: string;

  @IsOptional() @IsBoolean()
  active?: boolean;
}

/** PATCH /phva-advanced/emergencies/equipment/:equipmentId — edición parcial. */
export class UpdateEmergencyResourceDto {
  @IsOptional() @IsIn(RESOURCE_TYPE_VALUES)
  resourceType?: EmergencyResourceType;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(200)
  name?: string;

  @IsOptional() @IsString() @MaxLength(200)
  location?: string;

  @IsOptional() @IsInt() @Min(1) @Max(10000)
  quantity?: number;

  @IsOptional() @IsIn(RESOURCE_STATUS_VALUES)
  operationalStatus?: EmergencyResourceStatus;

  @IsOptional() @IsDateString()
  lastInspectionDate?: string;

  @IsOptional() @IsDateString()
  nextInspectionDate?: string;

  @IsOptional() @IsString() @MaxLength(500)
  certificateUrl?: string;

  @IsOptional() @IsString() @MaxLength(500)
  evidenceUrl?: string;

  @IsOptional() @IsBoolean()
  active?: boolean;
}

/** POST /phva-advanced/emergencies/brigades/:brigadeId/members — nuevo brigadista. */
export class CreateBrigadeMemberDto {
  /** Empleado de la MISMA empresa (validado server-side; el snapshot lo genera el servidor). */
  @IsMongoId()
  employeeId!: string;

  @IsIn(BRIGADE_FUNCTION_VALUES)
  function!: EmergencyBrigadeFunction;

  /** true = suplente; false = titular. */
  @IsOptional() @IsBoolean()
  isAlternate?: boolean;

  @IsOptional() @IsDateString()
  trainingDate?: string;

  @IsOptional() @IsString() @MaxLength(200)
  trainingType?: string;

  @IsOptional() @IsString() @MaxLength(500)
  trainingEvidence?: string;

  @IsOptional() @IsString() @MaxLength(1000)
  observations?: string;

  @IsOptional() @IsBoolean()
  active?: boolean;
}

/** PATCH /phva-advanced/emergencies/brigades/:brigadeId/members/:memberId — edición parcial. */
export class UpdateBrigadeMemberDto {
  @IsOptional() @IsMongoId()
  employeeId?: string;

  /** NOTA: el nombre snapshot NUNCA se acepta del frontend: se genera server-side. */
  @IsOptional() @IsIn(BRIGADE_FUNCTION_VALUES)
  function?: EmergencyBrigadeFunction;

  @IsOptional() @IsBoolean()
  isAlternate?: boolean;

  @IsOptional() @IsBoolean()
  active?: boolean;

  @IsOptional() @IsDateString()
  trainingDate?: string;

  @IsOptional() @IsString() @MaxLength(200)
  trainingType?: string;

  @IsOptional() @IsString() @MaxLength(500)
  trainingEvidence?: string;

  @IsOptional() @IsString() @MaxLength(1000)
  observations?: string;
}

/** PATCH /phva-advanced/emergencies/evacuation-routes/:routeId — edición parcial de ruta. */
export class UpdateEvacuationRouteDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200)
  name?: string;

  @IsOptional() @IsString() @MaxLength(500)
  description?: string;

  @IsOptional() @IsString() @MaxLength(100)
  floor?: string;

  @IsOptional() @IsString() @MaxLength(500)
  diagramUrl?: string;

  @IsOptional() @IsInt() @Min(1) @Max(600)
  estimatedTimeMinutes?: number;

  @IsOptional() @IsString() @MaxLength(200)
  responsible?: string;

  @IsOptional() @IsInt() @Min(0) @Max(100000)
  estimatedCapacity?: number;

  @IsOptional() @IsString() @MaxLength(200)
  associatedExit?: string;

  @IsOptional() @IsBoolean()
  signageVerified?: boolean;

  @IsOptional() @IsBoolean()
  active?: boolean;
}

/** PATCH /phva-advanced/emergencies/meeting-points/:pointId — edición parcial de punto. */
export class UpdateMeetingPointDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200)
  name?: string;

  @IsOptional() @IsString() @MaxLength(300)
  location?: string;

  @IsOptional() @IsInt() @Min(0) @Max(100000)
  capacity?: number;

  /** Coordenadas [lat, lng] (números finitos). */
  @IsOptional() @IsArray() @ArrayMaxSize(2)
  @IsNumber({}, { each: true })
  coordinates?: number[];

  @IsOptional() @IsString() @MaxLength(200)
  responsible?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  countProcedure?: string;

  @IsOptional() @IsInt() @Min(0) @Max(100000)
  expectedCount?: number;

  @IsOptional() @IsBoolean()
  active?: boolean;
}

/** POST /phva-advanced/emergencies/meeting-points/:pointId/counts — registrar conteo de evacuación. */
export class AddEvacuationCountDto {
  @IsDateString()
  date!: string;

  @IsInt() @Min(0) @Max(100000)
  expectedCount!: number;

  @IsInt() @Min(0) @Max(100000)
  actualCount!: number;

  /** Personas faltantes: si no se envía, el servidor la calcula como max(0, esperado − realizado). */
  @IsOptional() @IsInt() @Min(0) @Max(100000)
  missingCount?: number;

  @IsOptional() @IsString() @MaxLength(200)
  responsible?: string;

  @IsOptional() @IsString() @MaxLength(1000)
  observations?: string;
}

/**
 * Etapa 3 (5.1.1) — Brechas de captura: brigadas, rutas, puntos y simulacros
 * completan su CRUD. Los IDs (brigadeId/routeId/pointId/drillId) y el
 * historial son SIEMPRE server-side: estos DTOs no los declaran y el
 * ValidationPipe global (whitelist + forbidNonWhitelisted) rechaza cualquier
 * intento de enviarlos.
 */

const DRILL_STATUS_VALUES = ['Planificado', 'Programado', 'Ejecutado', 'Completado', 'Cancelado'] as string[];

/** POST /phva-advanced/emergencies/brigades — nueva brigada. */
export class CreateEmergencyBrigadeDto {
  @IsString() @MinLength(1) @MaxLength(200)
  name!: string;

  /** Tipo de brigada (texto: Evacuación, Contra incendio, Primeros auxilios…). */
  @IsOptional() @IsString() @MaxLength(100)
  type?: string;

  /** Líder de la brigada (texto). */
  @IsOptional() @IsString() @MaxLength(200)
  leader?: string;

  /** Frecuencia de reuniones (texto: Mensual, Trimestral…). */
  @IsOptional() @IsString() @MaxLength(100)
  meetingFrequency?: string;

  @IsOptional() @IsDateString()
  lastMeetingDate?: string;
}

/** PATCH /phva-advanced/emergencies/brigades/:brigadeId — edición parcial. */
export class UpdateEmergencyBrigadeDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200)
  name?: string;

  @IsOptional() @IsString() @MaxLength(100)
  type?: string;

  @IsOptional() @IsString() @MaxLength(200)
  leader?: string;

  @IsOptional() @IsString() @MaxLength(100)
  meetingFrequency?: string;

  @IsOptional() @IsDateString()
  lastMeetingDate?: string;

  /** Borrado lógico: active=false desactiva la brigada conservando miembros e historial. */
  @IsOptional() @IsBoolean()
  active?: boolean;
}

/** POST /phva-advanced/emergencies/evacuation-routes — nueva ruta de evacuación. */
export class CreateEvacuationRouteDto {
  @IsString() @MinLength(1) @MaxLength(200)
  name!: string;

  @IsOptional() @IsString() @MaxLength(500)
  description?: string;

  @IsOptional() @IsString() @MaxLength(100)
  floor?: string;

  @IsOptional() @IsString() @MaxLength(500)
  diagramUrl?: string;

  @IsOptional() @IsInt() @Min(1) @Max(600)
  estimatedTimeMinutes?: number;

  @IsOptional() @IsString() @MaxLength(200)
  responsible?: string;

  @IsOptional() @IsInt() @Min(0) @Max(100000)
  estimatedCapacity?: number;

  @IsOptional() @IsString() @MaxLength(200)
  associatedExit?: string;

  @IsOptional() @IsBoolean()
  signageVerified?: boolean;

  @IsOptional() @IsBoolean()
  active?: boolean;
}

/** POST /phva-advanced/emergencies/meeting-points — nuevo punto de encuentro. */
export class CreateMeetingPointDto {
  @IsString() @MinLength(1) @MaxLength(200)
  name!: string;

  @IsOptional() @IsString() @MaxLength(300)
  location?: string;

  @IsOptional() @IsInt() @Min(0) @Max(100000)
  capacity?: number;

  /** Coordenadas [lat, lng] (números finitos). */
  @IsOptional() @IsArray() @ArrayMaxSize(2)
  @IsNumber({}, { each: true })
  coordinates?: number[];

  @IsOptional() @IsString() @MaxLength(200)
  responsible?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  countProcedure?: string;

  @IsOptional() @IsInt() @Min(0) @Max(100000)
  expectedCount?: number;

  @IsOptional() @IsBoolean()
  active?: boolean;
}

/** POST /phva-advanced/emergencies/drills — nuevo simulacro. */
export class CreateEmergencyDrillDto {
  @IsString() @MinLength(1) @MaxLength(200)
  name!: string;

  @IsOptional() @IsString() @MaxLength(100)
  type?: string;

  @IsDateString()
  date!: string;

  @IsOptional() @IsInt() @Min(0) @Max(100000)
  participants?: number;

  @IsOptional() @IsInt() @Min(0) @Max(100000)
  expectedParticipants?: number;

  @IsOptional() @IsInt() @Min(0) @Max(1440)
  durationMinutes?: number;

  @IsOptional() @IsString() @MaxLength(2000)
  results?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  findings?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  improvements?: string;

  /** Evidencias (URLs de soporte). */
  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(20)
  @MaxLength(500, { each: true })
  evidence?: string[];

  @IsOptional() @IsIn(DRILL_STATUS_VALUES)
  status?: string;

  /**
   * Vínculo OPCIONAL con la actividad del Plan Anual (PlanActivity) de la
   * MISMA empresa; validado server-side. Omitir = "Sin actividad vinculada".
   */
  @IsOptional() @IsMongoId()
  planActivityId?: string;
}

/** PATCH /phva-advanced/emergencies/drills/:drillId — edición parcial. */
export class UpdateEmergencyDrillDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200)
  name?: string;

  @IsOptional() @IsString() @MaxLength(100)
  type?: string;

  @IsOptional() @IsDateString()
  date?: string;

  @IsOptional() @IsInt() @Min(0) @Max(100000)
  participants?: number;

  @IsOptional() @IsInt() @Min(0) @Max(100000)
  expectedParticipants?: number;

  @IsOptional() @IsInt() @Min(0) @Max(1440)
  durationMinutes?: number;

  @IsOptional() @IsString() @MaxLength(2000)
  results?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  findings?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  improvements?: string;

  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(20)
  @MaxLength(500, { each: true })
  evidence?: string[];

  @IsOptional() @IsIn(DRILL_STATUS_VALUES)
  status?: string;

  /**
   * Vínculo OPCIONAL con PlanActivity de la misma empresa (validado
   * server-side). Envíe `null` para desvincular ("Sin actividad").
   */
  @IsOptional() @IsMongoId()
  planActivityId?: string | null;

  /** Borrado lógico: active=false desactiva el simulacro conservándolo. */
  @IsOptional() @IsBoolean()
  active?: boolean;
}

/** PATCH /phva-advanced/emergencies/threats/:threatId — edición parcial. */
export class UpdateEmergencyThreatDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200)
  scenario?: string;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(200)
  threat?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  vulnerability?: string;

  @IsOptional() @IsString() @MaxLength(500)
  exposedPeople?: string;

  @IsOptional() @IsString() @MaxLength(500)
  exposedAssets?: string;

  @IsOptional() @IsString() @MaxLength(500)
  exposedProcesses?: string;

  @IsOptional() @IsIn(PROBABILITY_VALUES)
  probability?: EmergencyProbability;

  @IsOptional() @IsIn(IMPACT_VALUES)
  impact?: EmergencyImpact;

  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(20)
  @MaxLength(500, { each: true })
  preventiveMeasures?: string[];

  @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(20)
  @MaxLength(500, { each: true })
  responseMeasures?: string[];

  @IsOptional() @IsString() @MaxLength(5000)
  responseProcedure?: string;

  /** Borrado lógico: active=false desactiva la amenaza conservándola en historial. */
  @IsOptional() @IsBoolean()
  active?: boolean;
}
