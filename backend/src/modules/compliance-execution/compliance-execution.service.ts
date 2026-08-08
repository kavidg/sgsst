import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AlertsService } from '../alerts/alerts.service';
import { AnnualWorkPlanService } from '../annual-work-plan/services/annual-work-plan.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { DocumentMasterService } from '../document-management/services/document-master.service';
import { InitialEvaluationService } from '../initial-evaluation/initial-evaluation.service';
import { User, UserDocument } from '../users/schemas/user.schema';
import { ExecuteAutomationDto } from './dto/execute-automation.dto';
import { ExecutionResultDto, ExecutionStepDto } from './dto/execution-result.dto';
import { ExecutionResult } from './interfaces/execution-result.interface';
import { ExecutionTask } from './interfaces/execution-task.interface';
import { ExecutionHistory, ExecutionHistoryDocument } from './schemas/execution-history.schema';
import { buildExecutionPlan } from './utils/execution-planner';
import { createStepExecutors, executePlan } from './utils/execution-runner';
import { validateExecutionRequest } from './utils/execution-validator';

/**
 * Servicio del Compliance Execution Engine (Orquestador Central).
 *
 * Recibe un AutomationResult READY y ejecuta las acciones reutilizando
 * EXCLUSIVAMENTE los servicios existentes del sistema:
 * - AnnualWorkPlanService (pasos ACTIVITY)
 * - AlertsService (pasos ALERT)
 * - DocumentMasterService (pasos DOCUMENT)
 * - DashboardService e InitialEvaluationService (contexto/avisos)
 *
 * No modifica módulos existentes, no recalcula cumplimiento y persiste
 * únicamente el historial (ExecutionHistory).
 */
@Injectable()
export class ComplianceExecutionService {
  constructor(
    @InjectModel(ExecutionHistory.name)
    private readonly historyModel: Model<ExecutionHistoryDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly annualWorkPlanService: AnnualWorkPlanService,
    private readonly alertsService: AlertsService,
    private readonly documentMasterService: DocumentMasterService,
    private readonly dashboardService: DashboardService,
    private readonly initialEvaluationService: InitialEvaluationService,
  ) {}

  /**
   * Ejecuta una automatización: validar → planificar → ejecutar paso a paso →
   * guardar historial → retornar resultado.
   *
   * @param dto - Datos de ejecución (companyId, automationResult, executedBy, executionDate).
   */
  async execute(dto: ExecuteAutomationDto): Promise<ExecutionResultDto> {
    const validation = validateExecutionRequest(dto);
    if (!validation.valid) {
      throw new BadRequestException(validation.errors);
    }

    const companyId = new Types.ObjectId(dto.companyId);
    const executionDate = new Date(dto.executionDate);
    const user = await this.resolveUser(dto.executedBy);

    // Contexto enriquecido con servicios existentes (lectura, sin recalcular).
    const [companyStats, initialEvaluation] = await Promise.all([
      this.dashboardService.getCompanyStats(companyId).catch(() => null),
      this.initialEvaluationService.executiveDashboard(companyId).catch(() => null),
    ]);

    const warnings: string[] = [];
    if (companyStats && companyStats.employees === 0) {
      warnings.push('La empresa no registra empleados activos.');
    }
    if (initialEvaluation && initialEvaluation.overallCompliance < 60) {
      warnings.push('La evaluación inicial presenta un cumplimiento bajo (< 60%).');
    }

    const automationId = new Types.ObjectId().toString();
    const startedAt = new Date();

    const plan = buildExecutionPlan(dto.automationResult);
    const executors = createStepExecutors({
      annualWorkPlanService: this.annualWorkPlanService,
      alertsService: this.alertsService,
      documentMasterService: this.documentMasterService,
    });

    const stats = await executePlan(
      plan,
      {
        companyId,
        automationId,
        executedBy: dto.executedBy,
        executionDate,
        user,
        automationResult: dto.automationResult,
        annualWorkPlanService: this.annualWorkPlanService,
        alertsService: this.alertsService,
        documentMasterService: this.documentMasterService,
      },
      executors,
    );

    const finishedAt = new Date();
    const duration = finishedAt.getTime() - startedAt.getTime();

    const result: ExecutionResult = {
      executionId: automationId,
      status: stats.status,
      completedSteps: stats.completedSteps,
      skippedSteps: stats.skippedSteps,
      failedSteps: stats.failedSteps,
      duration,
      summary: stats.summary,
      warnings: [...warnings, ...stats.warnings],
      errors: stats.errors,
    };

    // Persistir únicamente el historial de ejecución.
    await this.historyModel.create({
      companyId,
      automationId,
      executedBy: dto.executedBy,
      startedAt,
      finishedAt,
      status: stats.status,
      steps: plan.steps.map((task) => this.toStepDto(task)),
      summary: stats.summary,
      duration,
      errors: stats.errors,
      createdAutomatically: true,
    });

    return this.toDto(result, plan.steps);
  }

  /** Resuelve el usuario ejecutor por id (ObjectId) o por email. */
  private async resolveUser(executedBy: string): Promise<UserDocument | null> {
    if (!executedBy) {
      return null;
    }

    if (Types.ObjectId.isValid(executedBy)) {
      const byId = await this.userModel.findById(executedBy).exec();
      if (byId) {
        return byId;
      }
    }

    return this.userModel.findOne({ email: executedBy }).exec();
  }

  /** Mapper único de pasos (para historial y respuesta). */
  private toStepDto(task: ExecutionTask): ExecutionStepDto {
    return {
      stepId: task.stepId,
      type: task.type,
      title: task.title,
      status: task.status,
      startedAt: task.startedAt,
      finishedAt: task.finishedAt,
      error: task.error,
      retryable: task.retryable,
      skipReason: task.skipReason,
    };
  }

  private toDto(result: ExecutionResult, steps: ExecutionTask[]): ExecutionResultDto {
    return {
      executionId: result.executionId,
      status: result.status,
      completedSteps: result.completedSteps,
      skippedSteps: result.skippedSteps,
      failedSteps: result.failedSteps,
      duration: result.duration,
      summary: result.summary,
      warnings: result.warnings,
      errors: result.errors,
      steps: steps.map((task) => this.toStepDto(task)),
    };
  }
}
