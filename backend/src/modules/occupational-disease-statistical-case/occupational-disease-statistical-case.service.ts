import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Employee, EmployeeDocument } from '../employees/schemas/employee.schema';
import {
  Incident,
  IncidentDocument,
} from '../incidents/schemas/incident.schema';
import {
  OccupationalDiseaseCaseStatus,
  OccupationalDiseaseQualification,
  OccupationalDiseaseStatisticalCase,
  OccupationalDiseaseStatisticalCaseDocument,
} from './schemas/occupational-disease-statistical-case.schema';
import { CreateOccupationalDiseaseStatisticalCaseDto } from './dto/create-occupational-disease-statistical-case.dto';
import { UpdateOccupationalDiseaseStatisticalCaseDto } from './dto/update-occupational-disease-statistical-case.dto';

/**
 * Servicio de casos estadísticos de enfermedad laboral (FASE 35B).
 *
 * Infraestructura base tenant-scoped para la futura medición epidemiológica
 * (35C: prevalencia 3.3.4; 35D: incidencia 3.3.5). Esta fase NO implementa
 * scoring, providers, indicadores ni Applicability Engine.
 *
 * Reglas implementadas:
 * 1. Tenant isolation: todas las operaciones se filtran por companyId.
 * 2. companyId se deriva de la sesión (controller); nunca del body.
 * 3. Regla A: la referencia a Employee (si existe) debe pertenecer al MISMO
 *    tenant (se valida contra la colección Employee).
 * 4. Regla B: QUALIFIED exige statisticalCaseId + recognitionDate (+ period,
 *    derivado). UNDER_REVIEW nunca se trata como caso confirmado.
 * 5. Reglas C/D: UNDER_REVIEW/NOT_QUALIFIED/DISCARDED no son casos válidos
 *    para métricas futuras (el modelado de métricas pertenece a 35C/35D;
 *    aquí se registra la calificación y se expone helper isValidStatisticalCase).
 * 6. Regla E: recognitionDate no puede ser futura para un caso reconocido.
 * 7. Regla F: el período estadístico (period = 'YYYY-MM', periodYear,
 *    periodMonth) se DERIVA de recognitionDate (o de hoy si no existe) —
 *    nunca se acepta del frontend, evitando incoherencias fecha/período.
 * 8. Gate 9 (no-reconteo): statisticalCaseId es único por tenant (índice
 *    único) y firstOccurrence = true se rechaza si el statisticalCaseId ya
 *    existió en el tenant (incluidos registros desactivados). Un caso
 *    CLOSED reabierto conserva su statisticalCaseId y no se convierte en
 *    caso nuevo.
 * 9. Borrado lógico exclusivamente (active = false). No hay delete físico.
 * 10. METADATA-ONLY: sin información clínica (diagnóstico, CIE, historia,
 *     síntomas, tratamientos, medicamentos, resultados clínicos).
 */
@Injectable()
export class OccupationalDiseaseStatisticalCaseService {
  constructor(
    @InjectModel(OccupationalDiseaseStatisticalCase.name)
    private readonly caseModel: Model<OccupationalDiseaseStatisticalCaseDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    /** Solo para validar la referencia administrativa opcional (no conversión). */
    @InjectModel(Incident.name)
    private readonly incidentModel: Model<IncidentDocument>,
  ) {}

  // ───────────────────────────────────────────────────────────────────────
  // Helpers de reglas de negocio (reutilizable por futuras fases 35C/35D)
  // ───────────────────────────────────────────────────────────────────────

  /**
   * ¿Es el caso válido para métricas epidemiológicas futuras?
   * Únicamente QUALIFIED + ACTIVE + reconocimiento con fecha. UNDER_REVIEW
   * NO es caso confirmado (Regla C); NOT_QUALIFIED/DISCARDED nunca cuentan
   * (Regla D).
   */
  isValidStatisticalCase(
    c: Pick<
      OccupationalDiseaseStatisticalCase,
      'occupationalQualification' | 'active' | 'recognitionDate'
    >,
  ): boolean {
    return (
      c.occupationalQualification === OccupationalDiseaseQualification.QUALIFIED &&
      c.active === true &&
      c.recognitionDate !== undefined &&
      c.recognitionDate !== null
    );
  }

  /**
   * ¿Corresponde a un caso NUEVO (primera ocurrencia) para métricas de
   * incidencia futuras? Un caso CLOSED/reabierto no se vuelve a contar:
   * firstOccurrence se fija al crear y es inmutable (Gate 9).
   */
  isNewCaseOccurrence(c: {
    firstOccurrence: boolean;
  } & Pick<
    OccupationalDiseaseStatisticalCase,
    'occupationalQualification' | 'active' | 'recognitionDate'
  >): boolean {
    return this.isValidStatisticalCase(c) && c.firstOccurrence === true;
  }

  /**
   * Deriva el período estadístico 'YYYY-MM' desde una fecha (Regla F).
   * Exportado como utilidad determinista (reutilizable en 35C/35D).
   */
  static derivePeriod(date: Date): {
    period: string;
    periodYear: number;
    periodMonth: number;
  } {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    return {
      period: `${year}-${String(month).padStart(2, '0')}`,
      periodYear: year,
      periodMonth: month,
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // CRUD
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Crea un caso estadístico.
   *
   * Validaciones: Regla A (employee same-tenant), Regla B (QUALIFIED exige
   * recognitionDate), Regla E (no fechas futuras), Gate 9 (no-reconteo via
   * historial + índice único).
   */
  async create(
    companyId: string,
    dto: CreateOccupationalDiseaseStatisticalCaseDto,
    createdBy?: string,
  ): Promise<OccupationalDiseaseStatisticalCaseDocument> {
    // Regla E: recognitionDate no puede ser futura (caso reconocido).
    if (dto.recognitionDate) {
      this.validateNotFutureDate(dto.recognitionDate, 'recognitionDate');
    }

    // Regla B: QUALIFIED exige recognitionDate (statisticalCaseId/period ya
    // cubiertos: statisticalCaseId es required en DTO; period se deriva).
    if (
      dto.occupationalQualification === OccupationalDiseaseQualification.QUALIFIED &&
      !dto.recognitionDate
    ) {
      throw new BadRequestException(
        'Un caso QUALIFIED exige recognitionDate (fecha de reconocimiento administrativo)',
      );
    }

    // Gate 9: un statisticalCaseId que ya existió en el tenant (activo o no)
    // nunca puede registrarse de nuevo como primera ocurrencia.
    const firstOccurrence = dto.firstOccurrence ?? true;
    if (firstOccurrence) {
      await this.assertNoPriorOccurrence(companyId, dto.statisticalCaseId.trim());
    }

    // Regla A: employee opcional debe pertenecer al MISMO tenant.
    const employeeId = await this.validateEmployeeInTenant(
      companyId,
      dto.employeeId,
    );

    // Regla F: período derivado de recognitionDate (o de hoy).
    const effectiveDate = dto.recognitionDate
      ? new Date(dto.recognitionDate)
      : new Date();
    const periodInfo = OccupationalDiseaseStatisticalCaseService.derivePeriod(effectiveDate);

    const investigationRef = await this.validateInvestigationRefInTenant(
      companyId,
      dto.investigationRef,
    );

    try {
      const created = await this.caseModel.create({
        companyId: new Types.ObjectId(companyId),
        statisticalCaseId: dto.statisticalCaseId.trim(),
        employeeId,
        occupationalQualification: dto.occupationalQualification,
        recognitionDate: dto.recognitionDate ? new Date(dto.recognitionDate) : undefined,
        caseStatus: OccupationalDiseaseCaseStatus.OPEN,
        ...periodInfo,
        firstOccurrence,
        investigationRef,
        active: true,
        createdBy: createdBy ?? '',
        updatedBy: createdBy ?? '',
      });
      return created.toObject() as OccupationalDiseaseStatisticalCaseDocument;
    } catch (error) {
      // Índice único { companyId, statisticalCaseId }: deduplicación dura.
      if (this.isDuplicateKeyError(error)) {
        throw new BadRequestException(
          `Ya existe un caso estadístico con statisticalCaseId "${dto.statisticalCaseId.trim()}" en esta empresa`,
        );
      }
      throw error;
    }
  }

  /**
   * Lista casos del tenant, activos por defecto.
   * Filtros: active, caseStatus, occupationalQualification, period, year,
   * statisticalCaseId, limit, skip.
   */
  async findAll(
    companyId: string,
    options: {
      active?: boolean;
      caseStatus?: string;
      occupationalQualification?: string;
      period?: string;
      year?: string;
      statisticalCaseId?: string;
      limit?: number;
      skip?: number;
    } = {},
  ): Promise<OccupationalDiseaseStatisticalCaseDocument[]> {
    const filter: Record<string, unknown> = {
      companyId: new Types.ObjectId(companyId),
    };

    if (options.active !== undefined) {
      filter.active = options.active;
    }
    if (options.caseStatus) {
      filter.caseStatus = options.caseStatus;
    }
    if (options.occupationalQualification) {
      filter.occupationalQualification = options.occupationalQualification;
    }
    if (options.period) {
      filter.period = options.period;
    }
    if (options.year) {
      const year = parseInt(options.year, 10);
      if (!Number.isNaN(year)) {
        filter.periodYear = year;
        // Índice { companyId, periodYear } + rango sobre periodMonth para
        // orden estable por mes.
      }
    }
    if (options.statisticalCaseId) {
      filter.statisticalCaseId = options.statisticalCaseId;
    }

    const limit = options.limit ?? 100;
    const skip = options.skip ?? 0;

    const results = await this.caseModel
      .find(filter)
      .sort({ periodYear: -1, periodMonth: -1, createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();
    return results as unknown as OccupationalDiseaseStatisticalCaseDocument[];
  }

  /**
   * Busca un caso por ID, validando que pertenece al tenant.
   */
  async findOne(
    companyId: string,
    id: string,
  ): Promise<OccupationalDiseaseStatisticalCaseDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    const record = await this.caseModel
      .findOne({
        _id: new Types.ObjectId(id),
        companyId: new Types.ObjectId(companyId),
      })
      .lean();

    return record as (OccupationalDiseaseStatisticalCaseDocument | null);
  }

  /**
   * Actualiza parcialmente un caso.
   *
   * statisticalCaseId/firstOccurrence son inmutables (Gate 9); caseStatus
   * solo cambia por transiciones explícitas (close/reopen); el período se
   * re-deriva si cambia recognitionDate (Regla F).
   */
  async update(
    companyId: string,
    id: string,
    dto: UpdateOccupationalDiseaseStatisticalCaseDto,
    updatedBy?: string,
  ): Promise<OccupationalDiseaseStatisticalCaseDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    const existing = await this.caseModel.findOne({
      _id: new Types.ObjectId(id),
      companyId: new Types.ObjectId(companyId),
    });

    if (!existing) {
      throw new NotFoundException(
        `Caso estadístico ${id} no existe o no pertenece a la empresa ${companyId}`,
      );
    }

    // Regla E sobre la fecha final (nueva o previa).
    const finalRecognitionDate = dto.recognitionDate ?? (existing.recognitionDate?.toISOString() ?? undefined);
    if (finalRecognitionDate) {
      this.validateNotFutureDate(finalRecognitionDate, 'recognitionDate');
    }

    // Regla B sobre la calificación/fecha finales.
    if (
      (dto.occupationalQualification ?? existing.occupationalQualification) ===
        OccupationalDiseaseQualification.QUALIFIED &&
      !finalRecognitionDate
    ) {
      throw new BadRequestException(
        'Un caso QUALIFIED exige recognitionDate (fecha de reconocimiento administrativo)',
      );
    }

    // Regla A: employee final (nuevo o previo) debe pertenecer al tenant.
    let employeeId: Types.ObjectId | undefined = existing.employeeId;
    if (dto.employeeId !== undefined) {
      employeeId = await this.validateEmployeeInTenant(companyId, dto.employeeId);
    }

    let investigationRef: Types.ObjectId | undefined = existing.investigationRef;
    if (dto.investigationRef !== undefined) {
      investigationRef = await this.validateInvestigationRefInTenant(
        companyId,
        dto.investigationRef,
      );
    }

    const update: Record<string, unknown> = {};

    if (dto.occupationalQualification !== undefined) {
      // Ciclo de vida de calificación (§CICLO DE VIDA): CLOSED es estado
      // administrativo, no calificación; cualquier transición de
      // calificación debe respetar el flujo UNDER_REVIEW → QUALIFIED /
      // NOT_QUALIFIED / DISCARDED.
      this.validateQualificationTransition(existing.occupationalQualification, dto.occupationalQualification);
      update.occupationalQualification = dto.occupationalQualification;
    }
    if (dto.recognitionDate !== undefined) {
      update.recognitionDate = new Date(dto.recognitionDate);
      // Regla F: re-derivar el período con la nueva fecha.
      const periodInfo = OccupationalDiseaseStatisticalCaseService.derivePeriod(
        new Date(dto.recognitionDate),
      );
      update.period = periodInfo.period;
      update.periodYear = periodInfo.periodYear;
      update.periodMonth = periodInfo.periodMonth;
    }
    if (dto.employeeId !== undefined) {
      update.employeeId = employeeId;
    }
    if (dto.investigationRef !== undefined) {
      update.investigationRef = investigationRef;
    }
    if (dto.active !== undefined) {
      update.active = dto.active;
    }

    update.updatedBy = updatedBy ?? '';

    const updated = await this.caseModel
      .findByIdAndUpdate(id, update, { new: true })
      .lean();

    return updated as (OccupationalDiseaseStatisticalCaseDocument | null);
  }

  /**
   * Transición explícita: cierra un caso (OPEN → CLOSED).
   * El cierre NO elimina el caso ni habilita un nuevo caso con el mismo
   * statisticalCaseId (Gate 9).
   */
  async close(
    companyId: string,
    id: string,
    updatedBy?: string,
  ): Promise<OccupationalDiseaseStatisticalCaseDocument | null> {
    return this.transitionCaseStatus(companyId, id, OccupationalDiseaseCaseStatus.CLOSED, updatedBy);
  }

  /**
   * Transición explícita: reabre un caso (CLOSED → OPEN).
   * Reabrir NO convierte el caso en un caso nuevo: firstOccurrence es
   * inmutable y el statisticalCaseId se conserva (Gate 9).
   */
  async reopen(
    companyId: string,
    id: string,
    updatedBy?: string,
  ): Promise<OccupationalDiseaseStatisticalCaseDocument | null> {
    return this.transitionCaseStatus(companyId, id, OccupationalDiseaseCaseStatus.OPEN, updatedBy);
  }

  /**
   * Desactiva (borrado lógico). No existe delete físico.
   */
  async deactivate(
    companyId: string,
    id: string,
    updatedBy?: string,
  ): Promise<OccupationalDiseaseStatisticalCaseDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    const updated = await this.caseModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(id),
          companyId: new Types.ObjectId(companyId),
        },
        {
          active: false,
          updatedBy: updatedBy ?? '',
        },
        { new: true },
      )
      .lean();

    return updated as (OccupationalDiseaseStatisticalCaseDocument | null);
  }

  /**
   * Reactiva un caso desactivado.
   */
  async reactivate(
    companyId: string,
    id: string,
    updatedBy?: string,
  ): Promise<OccupationalDiseaseStatisticalCaseDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    const updated = await this.caseModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(id),
          companyId: new Types.ObjectId(companyId),
        },
        {
          active: true,
          updatedBy: updatedBy ?? '',
        },
        { new: true },
      )
      .lean();

    return updated as (OccupationalDiseaseStatisticalCaseDocument | null);
  }

  // ───────────────────────────────────────────────────────────────────────
  // Validaciones privadas
  // ───────────────────────────────────────────────────────────────────────

  /** Regla E: no fechas futuras para un reconocimiento. */
  private validateNotFutureDate(value: string, fieldName: string): void {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Fecha inválida en ${fieldName}: ${value}`);
    }
    const today = new Date();
    // Compare a day granularity: a recognition "today" is valid.
    const dateDay = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    const todayDay = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    if (dateDay > todayDay) {
      throw new BadRequestException(
        `${fieldName} no puede ser futura (recibido: ${value})`,
      );
    }
  }

  /** Regla A: el Employee (si se referencia) debe pertenecer al MISMO tenant. */
  private async validateEmployeeInTenant(
    companyId: string,
    employeeId: string | undefined,
  ): Promise<Types.ObjectId | undefined> {
    if (!employeeId) {
      return undefined;
    }
    if (!Types.ObjectId.isValid(employeeId)) {
      throw new BadRequestException(`employeeId inválido: ${employeeId}`);
    }
    const employee = await this.employeeModel
      .findOne({
        _id: new Types.ObjectId(employeeId),
        companyId: new Types.ObjectId(companyId),
      })
      .lean();
    if (!employee) {
      throw new BadRequestException(
        `El empleado ${employeeId} no existe o no pertenece a la empresa ${companyId}`,
      );
    }
    return new Types.ObjectId(employeeId);
  }

  /**
   * Validación administrativa de la referencia opcional a investigación.
   * La referencia es UN VÍNCULO MANUAL: NO convierte Incident en caso y no
   * exige que Incident sea de tipo DISEASE (solo que exista y sea del mismo
   * tenant) — la conversión automática está prohibida (Gate 4).
   */
  private async validateInvestigationRefInTenant(
    companyId: string,
    investigationRef: string | undefined,
  ): Promise<Types.ObjectId | undefined> {
    if (!investigationRef) {
      return undefined;
    }
    if (!Types.ObjectId.isValid(investigationRef)) {
      throw new BadRequestException(`investigationRef inválido: ${investigationRef}`);
    }
    const investigation = await this.incidentModel
      .findOne({
        _id: new Types.ObjectId(investigationRef),
        companyId: new Types.ObjectId(companyId),
      })
      .lean();
    if (!investigation) {
      throw new BadRequestException(
        `La investigación ${investigationRef} no existe o no pertenece a la empresa ${companyId}`,
      );
    }
    return new Types.ObjectId(investigationRef);
  }

  /**
   * Gate 9: impide registrar como primera ocurrencia un statisticalCaseId
   * que ya existió en el tenant (activos Y desactivados — historial completo).
   */
  private async assertNoPriorOccurrence(
    companyId: string,
    statisticalCaseId: string,
  ): Promise<void> {
    const prior = await this.caseModel
      .findOne({
        companyId: new Types.ObjectId(companyId),
        statisticalCaseId,
      })
      .lean();
    if (prior) {
      throw new BadRequestException(
        `El statisticalCaseId "${statisticalCaseId}" ya fue registrado previamente en esta empresa; no puede registrarse de nuevo como primera ocurrencia (no-reconteo)`,
      );
    }
  }

  /**
   * Ciclo de vida de la calificación (§CICLO DE VIDA):
   * UNDER_REVIEW → QUALIFIED | NOT_QUALIFIED | DISCARDED.
   * Se permiten ajustes dentro de estados no confirmados (p. ej.
   * NOT_QUALIFIED → UNDER_REVIEW) pero se impide revivir un caso
   * NOT_QUALIFIED/DISCARDED a QUALIFIED (debe crearse un caso nuevo).
   */
  private validateQualificationTransition(
    from: OccupationalDiseaseQualification,
    to: OccupationalDiseaseQualification,
  ): void {
    if (from === to) {
      return;
    }
    if (
      (from === OccupationalDiseaseQualification.NOT_QUALIFIED ||
        from === OccupationalDiseaseQualification.DISCARDED) &&
      to === OccupationalDiseaseQualification.QUALIFIED
    ) {
      throw new BadRequestException(
        'Un caso NOT_QUALIFIED o DISCARDED no puede pasar a QUALIFIED; registre un nuevo caso con nuevo statisticalCaseId',
      );
    }
    if (
      from === OccupationalDiseaseQualification.QUALIFIED &&
      (to === OccupationalDiseaseQualification.UNDER_REVIEW ||
        to === OccupationalDiseaseQualification.NOT_QUALIFIED ||
        to === OccupationalDiseaseQualification.DISCARDED)
    ) {
      throw new BadRequestException(
        'Un caso QUALIFIED no puede retroceder a UNDER_REVIEW; use las transiciones administrativas de cierre o registre un caso nuevo si la calificación cambia',
      );
    }
  }

  /** Transición de caseStatus con verificación de existencia + tenant. */
  private async transitionCaseStatus(
    companyId: string,
    id: string,
    target: OccupationalDiseaseCaseStatus,
    updatedBy?: string,
  ): Promise<OccupationalDiseaseStatisticalCaseDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    const existing = await this.caseModel.findOne({
      _id: new Types.ObjectId(id),
      companyId: new Types.ObjectId(companyId),
    });

    if (!existing) {
      throw new NotFoundException(
        `Caso estadístico ${id} no existe o no pertenece a la empresa ${companyId}`,
      );
    }

    if (existing.caseStatus === target) {
      throw new BadRequestException(
        `El caso ya está en estado ${target}`,
      );
    }

    const updated = await this.caseModel
      .findByIdAndUpdate(
        id,
        {
          caseStatus: target,
          updatedBy: updatedBy ?? '',
        },
        { new: true },
      )
      .lean();

    return updated as (OccupationalDiseaseStatisticalCaseDocument | null);
  }

  /** Detección de violación de índice único (deduplicación dura). */
  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: number }).code === 11000
    );
  }
}
