import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  MedicalRecommendation,
  MedicalRecommendationDocument,
  RecommendationStatus,
  ActionStatus,
} from './schemas/medical-recommendation.schema';
import { CreateMedicalRecommendationDto } from './dto/create-medical-recommendation.dto';
import { UpdateMedicalRecommendationDto } from './dto/update-medical-recommendation.dto';
import { Employee, EmployeeDocument } from '../employees/schemas/employee.schema';
import {
  OccupationalExam,
  OccupationalExamDocument,
} from '../occupational-exam/schemas/occupational-exam.schema';

// ── Tipos para estadísticas agregadas ──

interface DistributionEntry {
  label: string;
  count: number;
}

export interface MedicalRecommendationStats {
  totalRecommendations: number;
  pendingRecommendations: number;
  inProgressRecommendations: number;
  completedRecommendations: number;
  cancelledRecommendations: number;
  overdueRecommendations: number;
  dueSoonRecommendations: number;
  effectivenessVerified: number;
  effectivenessPending: number;
  totalActions: number;
  pendingActions: number;
  completedActions: number;
  recommendationTypeDistribution: DistributionEntry[];
  statusDistribution: DistributionEntry[];
  actionStatusDistribution: DistributionEntry[];
}

@Injectable()
export class MedicalRecommendationService {
  constructor(
    @InjectModel(MedicalRecommendation.name)
    private readonly recommendationModel: Model<MedicalRecommendationDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
    @InjectModel(OccupationalExam.name)
    private readonly examModel: Model<OccupationalExamDocument>,
  ) {}

  /**
   * Crea una nueva recomendación médica ocupacional.
   * Valida que el empleado exista y pertenezca a la empresa autenticada.
   * Si se proporciona examId, valida que el examen exista, pertenezca a la empresa
   * y esté relacionado con el employeeId.
   */
  async create(
    companyId: Types.ObjectId,
    dto: CreateMedicalRecommendationDto,
  ): Promise<MedicalRecommendation> {
    // Validar que el empleado existe y pertenece a la empresa
    const employee = await this.employeeModel.findOne({
      _id: dto.employeeId,
      companyId,
    }).exec();

    if (!employee) {
      throw new BadRequestException(
        'El empleado especificado no existe o no pertenece a esta empresa',
      );
    }

    // Validar examId si se proporciona
    if (dto.examId) {
      const exam = await this.examModel.findOne({
        _id: dto.examId,
        companyId,
      }).exec();

      if (!exam) {
        throw new BadRequestException(
          'El examen especificado no existe o no pertenece a esta empresa',
        );
      }

      if (String(exam.employeeId) !== dto.employeeId) {
        throw new BadRequestException(
          'El examen especificado no pertenece al empleado indicado',
        );
      }
    }

    const created = new this.recommendationModel({
      ...dto,
      companyId,
      employeeId: new Types.ObjectId(dto.employeeId),
      examId: dto.examId ? new Types.ObjectId(dto.examId) : undefined,
      assignedDate: new Date(dto.assignedDate),
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      completedDate: dto.completedDate ? new Date(dto.completedDate) : undefined,
      effectivenessVerifiedDate: dto.effectivenessVerifiedDate
        ? new Date(dto.effectivenessVerifiedDate)
        : undefined,
      actions: (dto.actions ?? []).map((action) => ({
        ...action,
        date: new Date(action.date),
        dueDate: action.dueDate ? new Date(action.dueDate) : undefined,
        completedDate: action.completedDate
          ? new Date(action.completedDate)
          : undefined,
      })),
    });

    return created.save();
  }

  /**
   * Lista todas las recomendaciones de la empresa autenticada.
   * Soporta filtros opcionales por employeeId, examId, recommendationType, status.
   */
  async findAll(
    companyId: Types.ObjectId,
    filters?: {
      employeeId?: string;
      examId?: string;
      recommendationType?: string;
      status?: string;
    },
  ): Promise<MedicalRecommendation[]> {
    const query: Record<string, unknown> = { companyId };

    if (filters?.employeeId) {
      query.employeeId = new Types.ObjectId(filters.employeeId);
    }
    if (filters?.examId) {
      query.examId = new Types.ObjectId(filters.examId);
    }
    if (filters?.recommendationType) {
      query.recommendationType = filters.recommendationType;
    }
    if (filters?.status) {
      query.status = filters.status;
    }

    return this.recommendationModel
      .find(query)
      .sort({ assignedDate: -1 })
      .exec();
  }

  /**
   * Obtiene una recomendación por ID verificando tenant isolation.
   */
  async findOne(
    id: string,
    companyId: Types.ObjectId,
  ): Promise<MedicalRecommendation> {
    const recommendation = await this.recommendationModel
      .findOne({ _id: id, companyId })
      .exec();

    if (!recommendation) {
      throw new NotFoundException(
        `Recomendación con id ${id} no encontrada`,
      );
    }

    return recommendation;
  }

  /**
   * Actualiza una recomendación verificando tenant isolation.
   */
  async update(
    id: string,
    companyId: Types.ObjectId,
    dto: UpdateMedicalRecommendationDto,
  ): Promise<MedicalRecommendation> {
    // Si se cambia el employeeId, validar que exista y pertenezca a la empresa
    if (dto.employeeId) {
      const employee = await this.employeeModel.findOne({
        _id: dto.employeeId,
        companyId,
      }).exec();

      if (!employee) {
        throw new BadRequestException(
          'El empleado especificado no existe o no pertenece a esta empresa',
        );
      }
    }

    // Si se cambia el examId, validar
    if (dto.examId) {
      const targetEmployeeId = dto.employeeId;
      const exam = await this.examModel.findOne({
        _id: dto.examId,
        companyId,
      }).exec();

      if (!exam) {
        throw new BadRequestException(
          'El examen especificado no existe o no pertenece a esta empresa',
        );
      }

      if (targetEmployeeId && String(exam.employeeId) !== targetEmployeeId) {
        throw new BadRequestException(
          'El examen especificado no pertenece al empleado indicado',
        );
      }
    }

    // Preparar datos de actualización con conversión de fechas
    const updateData: Record<string, unknown> = { ...dto };
    if (dto.assignedDate) updateData.assignedDate = new Date(dto.assignedDate);
    if (dto.dueDate) updateData.dueDate = new Date(dto.dueDate);
    if (dto.completedDate) updateData.completedDate = new Date(dto.completedDate);
    if (dto.effectivenessVerifiedDate) {
      updateData.effectivenessVerifiedDate = new Date(dto.effectivenessVerifiedDate);
    }
    if (dto.actions) {
      updateData.actions = dto.actions.map((action) => ({
        ...action,
        date: action.date ? new Date(action.date) : undefined,
        dueDate: action.dueDate ? new Date(action.dueDate) : undefined,
        completedDate: action.completedDate
          ? new Date(action.completedDate)
          : undefined,
      }));
    }

    const recommendation = await this.recommendationModel
      .findOneAndUpdate({ _id: id, companyId }, updateData, {
        new: true,
        runValidators: true,
      })
      .exec();

    if (!recommendation) {
      throw new NotFoundException(
        `Recomendación con id ${id} no encontrada`,
      );
    }

    return recommendation;
  }

  /**
   * Elimina una recomendación verificando tenant isolation.
   */
  async remove(id: string, companyId: Types.ObjectId): Promise<void> {
    const result = await this.recommendationModel
      .findOneAndDelete({ _id: id, companyId })
      .exec();

    if (!result) {
      throw new NotFoundException(
        `Recomendación con id ${id} no encontrada`,
      );
    }
  }

  // ==================== ESTADÍSTICAS AGREGADAS (3.1.3) ====================

  /**
   * Devuelve estadísticas agregadas de recomendaciones médicas ocupacionales.
   *
   * Privacidad: solo retorna datos agregados. Nunca retorna:
   * - employeeId individual
   * - examId individual
   * - nombre
   * - documento
   * - descripción individual
   * - información clínica
   */
  async getStats(
    companyId: Types.ObjectId,
  ): Promise<MedicalRecommendationStats> {
    const recommendations = await this.recommendationModel
      .find({ companyId })
      .exec();

    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    // Conteos por estado
    const pendingRecommendations = recommendations.filter(
      (r) => r.status === RecommendationStatus.PENDING,
    ).length;
    const inProgressRecommendations = recommendations.filter(
      (r) => r.status === RecommendationStatus.IN_PROGRESS,
    ).length;
    const completedRecommendations = recommendations.filter(
      (r) => r.status === RecommendationStatus.COMPLETED,
    ).length;
    const cancelledRecommendations = recommendations.filter(
      (r) => r.status === RecommendationStatus.CANCELLED,
    ).length;

    // Recomendaciones vencidas: status != COMPLETED AND status != CANCELLED AND dueDate < hoy
    const overdueRecommendations = recommendations.filter(
      (r) =>
        r.status !== RecommendationStatus.COMPLETED &&
        r.status !== RecommendationStatus.CANCELLED &&
        r.dueDate &&
        new Date(r.dueDate).getTime() < now.getTime(),
    ).length;

    // Recomendaciones próximas a vencer: status != COMPLETED AND status != CANCELLED
    // AND dueDate >= hoy AND dueDate <= hoy + 30 días
    const dueSoonRecommendations = recommendations.filter(
      (r) =>
        r.status !== RecommendationStatus.COMPLETED &&
        r.status !== RecommendationStatus.CANCELLED &&
        r.dueDate &&
        new Date(r.dueDate).getTime() >= now.getTime() &&
        new Date(r.dueDate).getTime() <= thirtyDaysFromNow.getTime(),
    ).length;

    // Efectividad
    const effectivenessVerified = recommendations.filter(
      (r) => r.effectivenessVerified,
    ).length;
    const effectivenessPending = recommendations.filter(
      (r) => !r.effectivenessVerified && r.status !== RecommendationStatus.CANCELLED,
    ).length;

    // Acciones agregadas
    const allActions = recommendations.flatMap((r) => r.actions ?? []);
    const totalActions = allActions.length;
    const pendingActions = allActions.filter(
      (a) => a.status === ActionStatus.PENDING,
    ).length;
    const completedActions = allActions.filter(
      (a) => a.status === ActionStatus.COMPLETED,
    ).length;

    // Distribuciones
    const recommendationTypeDistribution = this.buildDistribution(
      recommendations,
      (r) => r.recommendationType,
    );
    const statusDistribution = this.buildDistribution(
      recommendations,
      (r) => r.status,
    );
    const actionStatusDistribution = this.buildDistribution(
      allActions,
      (a) => a.status,
    );

    return {
      totalRecommendations: recommendations.length,
      pendingRecommendations,
      inProgressRecommendations,
      completedRecommendations,
      cancelledRecommendations,
      overdueRecommendations,
      dueSoonRecommendations,
      effectivenessVerified,
      effectivenessPending,
      totalActions,
      pendingActions,
      completedActions,
      recommendationTypeDistribution,
      statusDistribution,
      actionStatusDistribution,
    };
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
