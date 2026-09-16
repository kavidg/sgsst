import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { OccupationalExam, OccupationalExamDocument, ExamStatus } from './schemas/occupational-exam.schema';
import { CreateOccupationalExamDto } from './dto/create-occupational-exam.dto';
import { UpdateOccupationalExamDto } from './dto/update-occupational-exam.dto';
import { ExamOccupationalContextDto } from './dto/exam-occupational-context.dto';
import { Employee, EmployeeDocument } from '../employees/schemas/employee.schema';
import { JobProfile, JobProfileDocument } from '../job-profile/schemas/job-profile.schema';
import { Risk, RiskDocument } from '../risks/schemas/risk.schema';

// ── Tipos para estadísticas agregadas ──

interface DistributionEntry {
  label: string;
  count: number;
}

export interface OccupationalExamStats {
  totalWorkers: number;
  totalExams: number;
  entryExams: number;
  periodicExams: number;
  exitExams: number;
  completedExams: number;
  scheduledExams: number;
  expiredExams: number;
  followUpsRequired: number;
  upcomingExams: number;
  fitnessDistribution: DistributionEntry[];
  examTypeDistribution: DistributionEntry[];
  statusDistribution: DistributionEntry[];
  areaDistribution: DistributionEntry[];
  contractTypeDistribution: DistributionEntry[];
  // ── Métricas 3.1.4 ──
  communicationAcknowledged: number;
  communicationPending: number;
  periodicityDefined: number;
  periodicityPending: number;
  hazardCoverage: number;
  hazardCoveragePending: number;
}

@Injectable()
export class OccupationalExamService {
  constructor(
    @InjectModel(OccupationalExam.name)
    private readonly examModel: Model<OccupationalExamDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    // FASE 30D-2 (3.1.3): modelos para validar el contexto PRE-examen.
    @InjectModel(JobProfile.name)
    private readonly jobProfileModel: Model<JobProfileDocument>,
    @InjectModel(Risk.name)
    private readonly riskModel: Model<RiskDocument>,
  ) {}

  /**
   * Crea un nuevo registro de examen médico ocupacional.
   * Valida que el empleado exista y pertenezca a la empresa autenticada.
   */
  async create(companyId: Types.ObjectId, dto: CreateOccupationalExamDto): Promise<OccupationalExam> {
    // Validar que el empleado existe y pertenece a la empresa
    const employee = await this.employeeModel.findOne({
      _id: dto.employeeId,
      companyId,
    }).exec();

    if (!employee) {
      throw new BadRequestException('El empleado especificado no existe o no pertenece a esta empresa');
    }

    const payload: Record<string, unknown> = { ...dto, companyId };
    if (dto.occupationalContext) {
      payload.occupationalContext = await this.validateOccupationalContext(
        companyId,
        dto.occupationalContext,
        dto.examDate,
      );
    }

    const created = new this.examModel({
      ...payload,
      employeeId: new Types.ObjectId(dto.employeeId),
    });
    return created.save();
  }

  /**
   * Lista todos los exámenes de la empresa autenticada.
   * Soporta filtros opcionales por employeeId, examType, status.
   */
  async findAll(
    companyId: Types.ObjectId,
    filters?: {
      employeeId?: string;
      examType?: string;
      status?: string;
    },
  ): Promise<OccupationalExam[]> {
    const query: Record<string, unknown> = { companyId };

    if (filters?.employeeId) {
      query.employeeId = new Types.ObjectId(filters.employeeId);
    }
    if (filters?.examType) {
      query.examType = filters.examType;
    }
    if (filters?.status) {
      query.status = filters.status;
    }

    return this.examModel.find(query).sort({ examDate: -1 }).exec();
  }

  /**
   * Obtiene un examen por ID verificando tenant isolation.
   */
  async findOne(id: string, companyId: Types.ObjectId): Promise<OccupationalExam> {
    const exam = await this.examModel.findOne({ _id: id, companyId }).exec();
    if (!exam) {
      throw new NotFoundException(`Examen con id ${id} no encontrado`);
    }
    return exam;
  }

  /**
   * Actualiza un examen verificando tenant isolation.
   */
  async update(id: string, companyId: Types.ObjectId, dto: UpdateOccupationalExamDto): Promise<OccupationalExam> {
    // Si se cambia el employeeId, validar que exista y pertenezca a la empresa
    if (dto.employeeId) {
      const employee = await this.employeeModel.findOne({
        _id: dto.employeeId,
        companyId,
      }).exec();

      if (!employee) {
        throw new BadRequestException('El empleado especificado no existe o no pertenece a esta empresa');
      }
    }

    const payload: Record<string, unknown> = { ...dto };
    if (dto.occupationalContext) {
      payload.occupationalContext = await this.validateOccupationalContext(
        companyId,
        dto.occupationalContext,
        dto.examDate,
      );
    }

    const exam = await this.examModel
      .findOneAndUpdate({ _id: id, companyId }, payload, { new: true, runValidators: true })
      .exec();

    if (!exam) {
      throw new NotFoundException(`Examen con id ${id} no encontrado`);
    }
    return exam;
  }

  /**
   * Elimina un examen verificando tenant isolation.
   */
  async remove(id: string, companyId: Types.ObjectId): Promise<void> {
    const result = await this.examModel.findOneAndDelete({ _id: id, companyId }).exec();
    if (!result) {
      throw new NotFoundException(`Examen con id ${id} no encontrado`);
    }
  }

  // ==================== ESTADÍSTICAS AGREGADAS (3.1.2) ====================

  /**
   * Devuelve estadísticas agregadas de exámenes médicos ocupacionales.
   *
   * Privacidad: solo retorna datos agregados. Nunca retorna:
   * - employeeId individual
   * - nombre
   * - documento
   * - diagnóstico
   * - restricciones
   * - información clínica
   */
  async getStats(companyId: Types.ObjectId): Promise<OccupationalExamStats> {
    const employees = await this.employeeModel.find({ companyId }).exec();
    const exams = await this.examModel.find({ companyId }).exec();

    const totalWorkers = employees.length;
    const totalExams = exams.length;

    // Conteos por tipo
    const entryExams = exams.filter((e) => e.examType === 'ENTRY').length;
    const periodicExams = exams.filter((e) => e.examType === 'PERIODIC').length;
    const exitExams = exams.filter((e) => e.examType === 'EXIT').length;

    // Conteos por estado
    const completedExams = exams.filter((e) => e.status === ExamStatus.COMPLETED).length;
    const scheduledExams = exams.filter((e) => e.status === ExamStatus.SCHEDULED).length;

    // Exámenes vencidos: nextDueDate < hoy y status no es CANCELLED
    const now = new Date();
    const expiredExams = exams.filter((e) =>
      e.nextDueDate &&
      new Date(e.nextDueDate).getTime() < now.getTime() &&
      e.status !== ExamStatus.CANCELLED,
    ).length;

    // Seguimientos requeridos
    const followUpsRequired = exams.filter((e) => e.followUpRequired).length;

    // Próximos exámenes: nextDueDate entre hoy y hoy + 30 días
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const upcomingExams = exams.filter((e) =>
      e.nextDueDate &&
      new Date(e.nextDueDate).getTime() >= now.getTime() &&
      new Date(e.nextDueDate).getTime() <= thirtyDaysFromNow.getTime(),
    ).length;

    // Distribuciones
    const fitnessDistribution = this.buildDistribution(
      exams,
      (e) => e.fitnessStatus ?? undefined,
    );

    const examTypeDistribution = this.buildDistribution(
      exams,
      (e) => e.examType,
    );

    const statusDistribution = this.buildDistribution(
      exams,
      (e) => e.status,
    );

    // Distribución por área (requiere JOIN con Employee)
    const employeeMap = new Map<string, EmployeeDocument>();
    for (const emp of employees) {
      employeeMap.set(String(emp._id), emp);
    }

    const areaCounts = new Map<string, number>();
    const contractTypeCounts = new Map<string, number>();
    for (const exam of exams) {
      const emp = employeeMap.get(String(exam.employeeId));
      if (emp) {
        areaCounts.set(emp.area, (areaCounts.get(emp.area) ?? 0) + 1);
        contractTypeCounts.set(emp.contractType, (contractTypeCounts.get(emp.contractType) ?? 0) + 1);
      }
    }

    const areaDistribution = Array.from(areaCounts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

    const contractTypeDistribution = Array.from(contractTypeCounts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);

    // ── Métricas 3.1.4 ──
    // Comunicación al trabajador
    const communicationAcknowledged = exams.filter((e) => e.workerAcknowledged === true).length;
    const communicationPending = exams.filter((e) =>
      e.status !== ExamStatus.CANCELLED && e.workerAcknowledged !== true,
    ).length;

    // Periodicidad
    const periodicityDefined = exams.filter((e) =>
      e.periodicityMonths !== undefined && e.periodicityMonths !== null && e.periodicityMonths > 0,
    ).length;
    const periodicityPending = exams.filter((e) =>
      e.examType === 'PERIODIC' &&
      (e.periodicityMonths === undefined || e.periodicityMonths === null || e.periodicityMonths <= 0),
    ).length;

    // Cobertura de peligros
    const hazardCoverage = exams.filter((e) =>
      e.relatedHazards !== undefined && e.relatedHazards !== null && e.relatedHazards.length > 0,
    ).length;
    const hazardCoveragePending = exams.filter((e) =>
      e.relatedHazards === undefined || e.relatedHazards === null || e.relatedHazards.length === 0,
    ).length;

    return {
      totalWorkers,
      totalExams,
      entryExams,
      periodicExams,
      exitExams,
      completedExams,
      scheduledExams,
      expiredExams,
      followUpsRequired,
      upcomingExams,
      fitnessDistribution,
      examTypeDistribution,
      statusDistribution,
      areaDistribution,
      contractTypeDistribution,
      communicationAcknowledged,
      communicationPending,
      periodicityDefined,
      periodicityPending,
      hazardCoverage,
      hazardCoveragePending,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // FASE 30D-2 — Contexto PRE-examen (3.1.3)
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Valida y normaliza el contexto PRE-examen de un examen:
   * - jobProfileId debe referenciar un JobProfile del MISMO tenant;
   * - riskIds deben referenciar riesgos (Risk) del MISMO tenant;
   * - coherencia temporal: providedAt <= examDate cuando ambas fechas existen.
   *
   * Devuelve el objeto normalizado con ObjectIds y Date (para persistir).
   */
  private async validateOccupationalContext(
    companyId: Types.ObjectId,
    context: ExamOccupationalContextDto,
    examDate?: string,
  ): Promise<Record<string, unknown>> {
    const normalized: Record<string, unknown> = {
      providedToEvaluator: context.providedToEvaluator ?? false,
      providedBy: context.providedBy ?? '',
    };

    if (context.jobProfileId) {
      const profile = await this.jobProfileModel
        .findOne({ _id: new Types.ObjectId(context.jobProfileId), companyId })
        .select('_id')
        .lean()
        .exec();
      if (!profile) {
        throw new BadRequestException(
          'El JobProfile del contexto no existe o no pertenece a esta empresa',
        );
      }
      normalized.jobProfileId = new Types.ObjectId(context.jobProfileId);
    }

    const riskIds = context.riskIds ?? [];
    if (riskIds.length > 0) {
      const uniqueIds = [...new Set(riskIds)];
      const found = await this.riskModel
        .find({ _id: { $in: uniqueIds.map((id) => new Types.ObjectId(id)) }, companyId })
        .select('_id')
        .lean()
        .exec();
      if (found.length !== uniqueIds.length) {
        throw new BadRequestException(
          'Uno o más riesgos del contexto no existen o no pertenecen a esta empresa',
        );
      }
      normalized.riskIds = uniqueIds.map((id) => new Types.ObjectId(id));
    }

    if (context.providedAt) {
      const providedAt = new Date(context.providedAt);
      if (Number.isNaN(providedAt.getTime())) {
        throw new BadRequestException('providedAt no es una fecha válida');
      }
      if (examDate) {
        const exam = new Date(examDate);
        if (!Number.isNaN(exam.getTime()) && providedAt.getTime() > exam.getTime()) {
          throw new BadRequestException(
            'La evidencia PRE-examen no puede ser posterior al examen (providedAt <= examDate)',
          );
        }
      }
      normalized.providedAt = providedAt;
    }

    return normalized;
  }

  private buildDistribution<T>(
    items: T[],
    extractor: (item: T) => string | undefined,
  ): DistributionEntry[] {
    const counts = new Map<string, number>();
    for (const item of items) {
      const value = extractor(item);
      if (value === undefined || value === null || value === '') continue;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }
}
