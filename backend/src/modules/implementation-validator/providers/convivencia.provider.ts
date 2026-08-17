import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { StepId } from '../../implementation-wizard/schemas/implementation-wizard.schema';
import { ConvivenciaService } from '../../convivencia/convivencia.service';
import { deriveStepStatus } from '../implementation-calculator';
import {
  ProviderValidationResult,
  WizardValidationProvider,
} from '../interfaces/wizard-validation-provider.interface';

/**
 * Valida el paso `convivencia_committee` del Centro de Implementación usando
 * la FUENTE ÚNICA DE VERDAD del dominio 1.1.8 (Fase 3).
 *
 * Consume ConvivenciaService.getComplianceSnapshot() (que refleja
 * `complianceStatus`/`complianceReason` resueltos por resolveCompliance en el
 * dominio) y lo traduce al contrato del wizard:
 *
 * - COMPLIES          → 100 / COMPLETED.
 * - NON_COMPLIANT     → 0 / PENDING.
 * - PENDING           → 25-75 / IN_PROGRESS (nunca implementado por completo).
 * - requiresConvivencia === false (exención) → 100 / COMPLETED sin criterios
 *   pendientes.
 *
 * NO duplica la regla de cumplimiento: el estado y el progreso provienen del
 * snapshot del dominio (resolveCompliance sigue siendo la única fuente de
 * verdad del estado de cumplimiento).
 */
@Injectable()
export class ConvivenciaProvider implements WizardValidationProvider {
  readonly stepId: StepId = 'convivencia_committee';

  constructor(private readonly convivenciaService: ConvivenciaService) {}

  async getValidation(companyId: string): Promise<ProviderValidationResult> {
    try {
      const snapshot = await this.convivenciaService.getComplianceSnapshot(
        new Types.ObjectId(companyId),
      );

      // Excepción justificada: la empresa no requiere comité de convivencia.
      if (snapshot.exempt) {
        return {
          stepId: this.stepId,
          percentage: 100,
          status: 'COMPLETED',
          details: 'Empresa exenta de Comité de Convivencia (justificado)',
          criteria: [
            'Comité activo',
            'Estado aprobado',
            'Miembros conformados',
            'Reuniones realizadas',
          ],
          pendingCriteria: [],
          data: {
            exempt: true,
            complianceStatus: snapshot.complianceStatus,
            percentage: 100,
          },
        };
      }

      const percentage = snapshot.percentage;
      const status = deriveStepStatus(percentage);

      return {
        stepId: this.stepId,
        percentage,
        status,
        details: `Comité de Convivencia: ${snapshot.complianceStatus} — ${snapshot.complianceReason}`,
        criteria: snapshot.metCriteria,
        pendingCriteria: snapshot.missingCriteria,
        data: {
          complianceStatus: snapshot.complianceStatus,
          exempt: false,
          percentage,
          metCriteria: snapshot.metCriteria,
          missingCriteria: snapshot.missingCriteria,
        },
      };
    } catch {
      return {
        stepId: this.stepId,
        percentage: 0,
        status: 'PENDING',
        details: 'Periodo de Comité de Convivencia no encontrado',
      };
    }
  }
}
