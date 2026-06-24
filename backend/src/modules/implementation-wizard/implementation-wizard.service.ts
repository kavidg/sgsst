import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ImplementationWizard,
  ImplementationWizardDoc,
  StepId,
  StepStatus,
  StepValidation,
} from './schemas/implementation-wizard.schema';

const ALL_STEPS: StepId[] = [
  'company_info', 'users_roles', 'responsible_sst', 'course_50_hours',
  'sst_policy', 'sst_objectives', 'initial_evaluation', 'annual_plan',
  'copasst', 'convivencia_committee', 'training', 'communication',
  'legal_matrix', 'document_management',
];

const STEP_LABELS: Record<StepId, string> = {
  company_info: 'Información Empresa',
  users_roles: 'Usuarios y Roles',
  responsible_sst: 'Responsable SG-SST',
  course_50_hours: 'Curso 50 Horas',
  sst_policy: 'Política SST',
  sst_objectives: 'Objetivos SST',
  initial_evaluation: 'Evaluación Inicial',
  annual_plan: 'Plan Anual',
  copasst: 'COPASST',
  convivencia_committee: 'Comité de Convivencia',
  training: 'Capacitación',
  communication: 'Comunicación',
  legal_matrix: 'Matriz Legal',
  document_management: 'Gestión Documental',
};

const STEP_DESCRIPTIONS: Record<StepId, string> = {
  company_info: 'Complete los datos generales de la empresa: nombre, NIT, sector económico, nivel de riesgo, ARL y total de empleados.',
  users_roles: 'Configure al menos un administrador y un miembro en el sistema para la gestión del SG-SST.',
  responsible_sst: 'Asigne un responsable del SG-SST con su cargo y datos de contacto.',
  course_50_hours: 'Valide que el responsable SST cuenta con el certificado del curso de 50 horas vigente.',
  sst_policy: 'Cree, apruebe y firme la Política de Seguridad y Salud en el Trabajo.',
  sst_objectives: 'Defina al menos un objetivo SST medible con indicadores.',
  initial_evaluation: 'Complete la evaluación inicial del SG-SST según la normativa aplicable.',
  annual_plan: 'Cree el Plan Anual de Trabajo con al menos una actividad asignada.',
  copasst: 'Configure el COPASST o registre una justificación de exención.',
  convivencia_committee: 'Configure el Comité de Convivencia o registre una justificación de exención.',
  training: 'Defina el plan anual de capacitaciones en SST.',
  communication: 'Genere al menos una comunicación interna sobre temas SST.',
  legal_matrix: 'Genere la Matriz Legal de requisitos aplicables a la empresa.',
  document_management: 'Active el repositorio maestro de documentos del SG-SST.',
};

@Injectable()
export class ImplementationWizardService {
  constructor(
    @InjectModel(ImplementationWizard.name)
    private readonly wizardModel: Model<ImplementationWizardDoc>,
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

  async getWizard(companyId: Types.ObjectId) {
    return this.findOrCreate(companyId);
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

  /** Auto-validation — called by cron or on-demand */
  async runAutoValidation(companyId: Types.ObjectId, payload: Record<StepId, { score: number; status: StepStatus }>): Promise<ImplementationWizardDoc> {
    const wizard = await this.findOrCreate(companyId);

    for (const [stepId, data] of Object.entries(payload)) {
      const idx = wizard.steps.findIndex((s) => s.stepId === stepId);
      if (idx >= 0) {
        wizard.steps[idx].status = data.status;
        wizard.steps[idx].score = data.score;
        wizard.steps[idx].validatedAt = new Date().toISOString();
      }
    }

    wizard.history.push({
      userId: 'system',
      action: 'AUTO_VALIDATION_RUN',
      description: 'Scheduled auto-validation completed',
      timestamp: new Date().toISOString(),
    } as never);

    wizard.lastAutoValidationAt = new Date().toISOString();
    await this.recalculateScores(wizard);
    return wizard.save();
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

  /** Get implementation metrics for dashboard */
  async getDashboardMetrics(companyId: Types.ObjectId) {
    const wizard = await this.findOrCreate(companyId);
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
      steps: wizard.steps.map((s) => ({
        ...s,
        label: STEP_LABELS[s.stepId],
        description: STEP_DESCRIPTIONS[s.stepId],
      })),
      history: wizard.history.slice(-20).reverse(),
    };
  }

  /** Helper to get module route for quick access */
  getStepModuleRoute(stepId: StepId): string {
    const routes: Record<StepId, string> = {
      company_info: '/company-configuration',
      users_roles: '/users',
      responsible_sst: '/company-configuration',
      course_50_hours: '/company-configuration',
      sst_policy: '/documents/plan',
      sst_objectives: '/documents/plan',
      initial_evaluation: '/evaluations',
      annual_plan: '/annual-work-plan',
      copasst: '/documents/do',
      convivencia_committee: '/documents/do',
      training: '/trainings',
      communication: '/documents/do',
      legal_matrix: '/legal-matrix',
      document_management: '/document-management',
    };
    return routes[stepId];
  }
}
