import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { calculateWeightedImplementation } from '../implementation-validator/implementation-calculator';
import { ImplementationValidatorService } from '../implementation-validator/implementation-validator.service';
import { getImplementationWeights } from '../implementation-validator/implementation-weights';
import { ProviderValidationResult } from '../implementation-validator/interfaces/wizard-validation-provider.interface';
import { WizardOverviewDto } from './dto/wizard-overview.dto';
import {
  ALL_STEPS,
  STEP_DESCRIPTIONS,
  STEP_LABELS,
  STEP_MODULE_ROUTES,
} from './implementation-wizard.constants';
import {
  ImplementationWizard,
  ImplementationWizardDoc,
  StepId,
  StepStatus,
  StepValidation,
} from './schemas/implementation-wizard.schema';
import {
  buildWizardOverview,
  shouldRunAutoValidation,
} from './wizard-overview.utils';

@Injectable()
export class ImplementationWizardService {
  constructor(
    @InjectModel(ImplementationWizard.name)
    private readonly wizardModel: Model<ImplementationWizardDoc>,
    private readonly implementationValidatorService: ImplementationValidatorService,
  ) {}

  async findOrCreate(companyId: Types.ObjectId): Promise<ImplementationWizardDoc> {
    let wizard = await this.wizardModel.findOne({ companyId }).exec();
    if (wizard) return wizard;

    const steps: StepValidation[] = ALL_STEPS.map((stepId) => ({
      stepId,
      status: 'PENDING' as StepStatus,
      score: 0,
    }));

    wizard = await this.wizardModel.create({
      companyId,
      steps,
      overallScore: 0,
      completionPercentage: 0,
    });
    return wizard;
  }

  /**
   * Devuelve el wizard de implementación de la empresa.
   *
   * Integra la validación automática real: si la última ejecución supera el
   * TTL de 5 minutos (o nunca se ejecutó), corre el Implementation Validator
   * Engine y devuelve el wizard actualizado. Si la validación falla, es
   * tolerante y devuelve los datos almacenados sin romper el endpoint.
   */
  async getWizard(companyId: Types.ObjectId) {
    const wizard = await this.findOrCreate(companyId);
    if (shouldRunAutoValidation(wizard.lastAutoValidationAt)) {
      try {
        return await this.validateImplementation(companyId);
      } catch {
        return wizard;
      }
    }
    return wizard;
  }

  /** Core validation logic for each step */
  async validateStep(
    companyId: Types.ObjectId,
    stepId: StepId,
    data: { score: number; status: StepStatus; details?: string },
    userId: string,
    userEmail?: string,
  ): Promise<ImplementationWizardDoc> {
    const wizard = await this.findOrCreate(companyId);
    const idx = wizard.steps.findIndex((s) => s.stepId === stepId);
    if (idx < 0) throw new NotFoundException(`Step ${stepId} not found`);

    const prev = wizard.steps[idx].status;
    wizard.steps[idx] = {
      stepId,
      status: data.status,
      score: data.score,
      validatedAt: new Date().toISOString(),
      details: data.details,
    };

    wizard.history.push({
      userId,
      userEmail,
      action: 'STEP_VALIDATED',
      stepId,
      previousStatus: prev,
      newStatus: data.status,
      description: `Step "${STEP_LABELS[stepId]}" validated as ${data.status} (${data.score}%)`,
      timestamp: new Date().toISOString(),
    } as never);

    await this.recalculateScores(wizard);
    return wizard.save();
  }

  /** Manual step status update (admin can mark steps) */
  async updateStepStatus(
    companyId: Types.ObjectId,
    stepId: StepId,
    status: StepStatus,
    userId: string,
    userEmail?: string,
  ): Promise<ImplementationWizardDoc> {
    const wizard = await this.findOrCreate(companyId);
    const idx = wizard.steps.findIndex((s) => s.stepId === stepId);
    if (idx < 0) throw new NotFoundException(`Step ${stepId} not found`);

    const prev = wizard.steps[idx].status;
    wizard.steps[idx].status = status;
    if (status === 'COMPLETED') {
      wizard.steps[idx].score = 100;
      wizard.steps[idx].validatedAt = new Date().toISOString();
    }

    wizard.history.push({
      userId,
      userEmail,
      action: 'STEP_STATUS_CHANGED',
      stepId,
      previousStatus: prev,
      newStatus: status,
      description: `Step "${STEP_LABELS[stepId]}" changed to ${status}`,
      timestamp: new Date().toISOString(),
    } as never);

    await this.recalculateScores(wizard);
    return wizard.save();
  }

  /** Recalculate overall scores */
  private async recalculateScores(wizard: ImplementationWizardDoc): Promise<void> {
    const total = wizard.steps.length;
    const completed = wizard.steps.filter((s) => s.status === 'COMPLETED').length;
    const scoreSum = wizard.steps.reduce((sum, s) => sum + s.score, 0);

    wizard.completionPercentage = Math.round((completed / total) * 100);
    wizard.overallScore = Math.round(scoreSum / total);

    wizard.isImplementationComplete = wizard.steps.every((s) => s.status === 'COMPLETED');
  }

  /**
   * Auto-validación real — ejecuta el Implementation Validator Engine
   * (providers con datos reales de los módulos) y actualiza el wizard.
   *
   * Los pasos cubiertos por un provider se sobreescriben con el porcentaje
   * real y sus criterios (cumplidos / pendientes); los pasos restantes
   * conservan su estado previo. El progreso ponderado se calcula con los
   * pesos de implementation-weights.ts.
   */
  async validateImplementation(companyId: Types.ObjectId): Promise<ImplementationWizardDoc> {
    const wizard = await this.findOrCreate(companyId);
    const summary = await this.implementationValidatorService.validate(companyId.toString());

    // Aplicar resultados reales de los providers a los pasos del wizard.
    for (const result of summary.results) {
      const idx = wizard.steps.findIndex((s) => s.stepId === result.stepId);
      if (idx >= 0) {
        wizard.steps[idx] = {
          stepId: result.stepId,
          status: result.status,
          score: result.percentage,
          validatedAt: new Date().toISOString(),
          details: result.details,
          criteria: result.criteria ?? [],
          pendingCriteria: result.pendingCriteria ?? [],
        };
      } else {
        // FASE 6 (aditivo): pasos cubiertos por un provider que aún no existen
        // en un wizard persistido (p. ej. `copasst_training` 1.1.7, creado
        // después de que la empresa inicializara el wizard con 14 pasos) se
        // AGREGAN. Convergencia aditiva: nunca borra ni reordena pasos
        // existentes; la siguiente auto-validación deja el wizard en 15 pasos.
        wizard.steps.push({
          stepId: result.stepId,
          status: result.status,
          score: result.percentage,
          validatedAt: new Date().toISOString(),
          details: result.details,
          criteria: result.criteria ?? [],
          pendingCriteria: result.pendingCriteria ?? [],
        });
      }
    }

    // Progreso ponderado real: combina los resultados validados con los pasos
    // restantes (conservan su score previo) usando los pesos del motor.
    const weights = getImplementationWeights();
    const stepResults: ProviderValidationResult[] = wizard.steps.map((step) => ({
      stepId: step.stepId,
      percentage: step.score ?? 0,
      status: step.status,
      details: step.details ?? '',
    }));
    const weightedPercentage = calculateWeightedImplementation(stepResults, weights);

    // KPI 1 — completionPercentage: progreso ponderado por la importancia
    // de cada paso (pesos de implementation-weights.ts).
    wizard.completionPercentage = weightedPercentage;
    // KPI 2 — overallScore: promedio simple de los porcentajes de los pasos
    // (sin pesos). Distinto propósito: mide el avance promedio real.
    wizard.overallScore = Math.round(
      wizard.steps.reduce((sum, step) => sum + (step.score ?? 0), 0) /
        Math.max(1, wizard.steps.length),
    );
    wizard.isImplementationComplete = wizard.steps.every((s) => s.status === 'COMPLETED');

    wizard.history.push({
      userId: 'system',
      action: 'AUTO_VALIDATION_RUN',
      description: `Auto-validación real ejecutada: ${summary.weightedPercentage}% en pasos validados, ${weightedPercentage}% ponderado · ${wizard.overallScore}% promedio (${summary.results.length} providers)`,
      timestamp: new Date().toISOString(),
    } as never);

    wizard.lastAutoValidationAt = new Date().toISOString();
    return wizard.save();
  }

  /**
   * Overview del Centro de Implementación (DTO propio).
   *
   * Ejecuta la auto-validación real si supera el TTL de 5 minutos y responde
   * siempre con el overview construido del wizard actualizado. Tolerante:
   * nunca lanza por fallos internos de validación.
   */
  async getOverview(companyId: Types.ObjectId): Promise<WizardOverviewDto> {
    const wizard = await this.findOrCreate(companyId);
    if (shouldRunAutoValidation(wizard.lastAutoValidationAt)) {
      try {
        return buildWizardOverview(await this.validateImplementation(companyId));
      } catch {
        return buildWizardOverview(wizard);
      }
    }
    return buildWizardOverview(wizard);
  }

  /** Generate implementation certificate */
  async generateCertificate(companyId: Types.ObjectId, userId: Types.ObjectId): Promise<ImplementationWizardDoc> {
    const wizard = await this.findOrCreate(companyId);
    if (!wizard.isImplementationComplete) {
      throw new Error('Cannot generate certificate: implementation is not 100% complete');
    }

    const code = `CERT-${companyId.toString().slice(-6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    wizard.certificateGeneratedBy = userId;
    wizard.certificateGeneratedAt = new Date().toISOString();
    wizard.certificateVerificationCode = code;

    wizard.history.push({
      userId: userId.toString(),
      action: 'CERTIFICATE_GENERATED',
      description: `Certificate generated with code ${code}`,
      timestamp: new Date().toISOString(),
    } as never);

    return wizard.save();
  }

  /** Mark onboarding as complete */
  async completeOnboarding(companyId: Types.ObjectId): Promise<ImplementationWizardDoc> {
    const wizard = await this.findOrCreate(companyId);
    wizard.isOnboardingComplete = true;
    wizard.history.push({
      userId: 'system',
      action: 'ONBOARDING_COMPLETED',
      description: 'Onboarding welcome completed',
      timestamp: new Date().toISOString(),
    } as never);
    return wizard.save();
  }

  /**
   * Métricas del wizard para el dashboard.
   *
   * Igual que getWizard: refresca con la auto-validación real si supera el
   * TTL, de modo que el porcentaje mostrado en el dashboard proviene siempre
   * de completionPercentage del wizard validado (una sola fuente de verdad).
   */
  async getDashboardMetrics(companyId: Types.ObjectId) {
    const wizard = await this.findOrCreate(companyId);
    if (shouldRunAutoValidation(wizard.lastAutoValidationAt)) {
      try {
        return this.toDashboardMetrics(await this.validateImplementation(companyId));
      } catch {
        return this.toDashboardMetrics(wizard);
      }
    }
    return this.toDashboardMetrics(wizard);
  }

  /** Construye las métricas del dashboard a partir de un wizard persistido. */
  private toDashboardMetrics(wizard: ImplementationWizardDoc) {
    return {
      overallScore: wizard.overallScore,
      completionPercentage: wizard.completionPercentage,
      completedSteps: wizard.steps.filter((s) => s.status === 'COMPLETED').length,
      totalSteps: wizard.steps.length,
      pendingSteps: wizard.steps.filter((s) => s.status === 'PENDING').length,
      inProgressSteps: wizard.steps.filter((s) => s.status === 'IN_PROGRESS').length,
      blockedSteps: wizard.steps.filter((s) => s.status === 'BLOCKED').length,
      isOnboardingComplete: wizard.isOnboardingComplete,
      isImplementationComplete: wizard.isImplementationComplete,
      certificateGenerated: !!wizard.certificateGeneratedAt,
      certificateVerificationCode: wizard.certificateVerificationCode,
      lastValidatedAt: wizard.lastAutoValidationAt ?? null,
      steps: wizard.steps.map((s) => ({
        ...s,
        label: STEP_LABELS[s.stepId],
        description: STEP_DESCRIPTIONS[s.stepId],
        title: STEP_LABELS[s.stepId],
        moduleRoute: STEP_MODULE_ROUTES[s.stepId] ?? '',
        percentage: s.score ?? 0,
        status: s.status,
        pendingCriteria: s.pendingCriteria ?? [],
      })),
      history: wizard.history.slice(-20).reverse(),
    };
  }

  /** Helper to get module route for quick access */
  getStepModuleRoute(stepId: StepId): string {
    return STEP_MODULE_ROUTES[stepId] ?? '';
  }
}
