import { Injectable } from '@nestjs/common';
import { calculateWeightedImplementation, classifyImplementationLevel } from './implementation-calculator';
import { getImplementationWeights } from './implementation-weights';
import {
  ProviderValidationResult,
  WizardValidationProvider,
} from './interfaces/wizard-validation-provider.interface';
import { AnnualPlanProvider } from './providers/annual-plan.provider';
import { CommunicationProvider } from './providers/communication.provider';
import { CompanyInfoProvider } from './providers/company-info.provider';
import { ConvivenciaProvider } from './providers/convivencia.provider';
import { CopasstProvider } from './providers/copasst.provider';
import { Course50HoursProvider } from './providers/course-50-hours.provider';
import { DocumentManagementProvider } from './providers/document-management.provider';
import { InitialEvaluationProvider } from './providers/initial-evaluation.provider';
import { LegalMatrixProvider } from './providers/legal-matrix.provider';
import { ResponsibleSstProvider } from './providers/responsible-sst.provider';
import { SstObjectivesProvider } from './providers/sst-objectives.provider';
import { SstPolicyProvider } from './providers/sst-policy.provider';
import { TrainingProvider } from './providers/training.provider';
import { UsersRolesProvider } from './providers/users-roles.provider';

/**
 * Resultado global de la validación real del Centro de Implementación.
 */
export interface ImplementationValidationSummary {
  /**
   * Porcentaje ponderado de los pasos cubiertos por providers (0-100),
   * normalizado sobre los pesos de los pasos validados.
   */
  weightedPercentage: number;
  /** Nivel textual derivado del porcentaje ponderado. */
  level: string;
  /** Resultados individuales de cada provider. */
  results: ProviderValidationResult[];
}

/**
 * Implementation Validator Engine — versión completa (FASE 2).
 *
 * Agregador central del Centro de Implementación: consulta los 14 providers
 * en paralelo (Promise.all) y construye un resultado estandarizado con datos
 * reales de los módulos. Sigue el patrón arquitectónico del Compliance Engine.
 *
 * Los 14 pasos del wizard quedan cubiertos:
 * - company_info            (CompanyInfoProvider)
 * - users_roles             (UsersRolesProvider)
 * - responsible_sst         (ResponsibleSstProvider)
 * - course_50_hours         (Course50HoursProvider)
 * - sst_policy              (SstPolicyProvider)
 * - sst_objectives          (SstObjectivesProvider)
 * - initial_evaluation      (InitialEvaluationProvider)
 * - annual_plan             (AnnualPlanProvider)
 * - copasst                 (CopasstProvider)
 * - convivencia_committee   (ConvivenciaProvider)
 * - training                (TrainingProvider)
 * - communication           (CommunicationProvider)
 * - legal_matrix            (LegalMatrixProvider)
 * - document_management     (DocumentManagementProvider)
 */
@Injectable()
export class ImplementationValidatorService {
  private readonly providers: WizardValidationProvider[];

  constructor(
    private readonly companyInfoProvider: CompanyInfoProvider,
    private readonly usersRolesProvider: UsersRolesProvider,
    private readonly responsibleSstProvider: ResponsibleSstProvider,
    private readonly course50HoursProvider: Course50HoursProvider,
    private readonly sstPolicyProvider: SstPolicyProvider,
    private readonly sstObjectivesProvider: SstObjectivesProvider,
    private readonly initialEvaluationProvider: InitialEvaluationProvider,
    private readonly annualPlanProvider: AnnualPlanProvider,
    private readonly copasstProvider: CopasstProvider,
    private readonly convivenciaProvider: ConvivenciaProvider,
    private readonly trainingProvider: TrainingProvider,
    private readonly communicationProvider: CommunicationProvider,
    private readonly legalMatrixProvider: LegalMatrixProvider,
    private readonly documentManagementProvider: DocumentManagementProvider,
  ) {
    this.providers = [
      this.companyInfoProvider,
      this.usersRolesProvider,
      this.responsibleSstProvider,
      this.course50HoursProvider,
      this.sstPolicyProvider,
      this.sstObjectivesProvider,
      this.initialEvaluationProvider,
      this.annualPlanProvider,
      this.copasstProvider,
      this.convivenciaProvider,
      this.trainingProvider,
      this.communicationProvider,
      this.legalMatrixProvider,
      this.documentManagementProvider,
    ];
  }

  /**
   * Ejecuta todos los providers en paralelo y calcula el progreso ponderado
   * real del Centro de Implementación.
   */
  async validate(companyId: string): Promise<ImplementationValidationSummary> {
    const results = await Promise.all(
      this.providers.map((provider) =>
        provider.getValidation(companyId).catch((error: unknown): ProviderValidationResult => {
          console.warn(
            `[ImplementationValidator] Provider ${provider.stepId} falló para la empresa ${companyId}:`,
            error instanceof Error ? error.message : error,
          );
          return {
            stepId: provider.stepId,
            percentage: 0,
            status: 'PENDING',
            details: `Provider ${provider.stepId} no disponible`,
          };
        }),
      ),
    );

    const weightedPercentage = calculateWeightedImplementation(
      results,
      getImplementationWeights(),
    );

    return {
      weightedPercentage,
      level: classifyImplementationLevel(weightedPercentage),
      results,
    };
  }
}
