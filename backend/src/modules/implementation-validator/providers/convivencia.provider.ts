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
 * el periodo del Comité de Convivencia real de la empresa:
 *
 * - Comité activo/vigente (status ACTIVO o PROXIMO_A_VENCER).
 * - Estado aprobado (APPROVED / APPROVED_AND_SIGNED).
 * - Miembros conformados.
 * - O excepción justificada (requiresConvivencia === false).
 */
@Injectable()
export class ConvivenciaProvider implements WizardValidationProvider {
  readonly stepId: StepId = 'convivencia_committee';

  constructor(private readonly convivenciaService: ConvivenciaService) {}

  async getValidation(companyId: string): Promise<ProviderValidationResult> {
    try {
      const period = await this.convivenciaService.findCurrent(
        new Types.ObjectId(companyId),
      );

      // Excepción justificada: la empresa no requiere comité de convivencia.
      if (period.requiresConvivencia === false) {
        return {
          stepId: this.stepId,
          percentage: 100,
          status: 'COMPLETED',
          details: 'Empresa exenta de Comité de Convivencia (justificado)',
          criteria: ['Comité activo', 'Estado aprobado', 'Miembros conformados'],
          pendingCriteria: [],
          data: { exempt: true },
        };
      }

      let percentage = 0;
      const active =
        period.status === 'ACTIVO' || period.status === 'PROXIMO_A_VENCER';
      if (active) percentage += 40;

      const approved =
        period.approvalStatus === 'APPROVED' ||
        period.approvalStatus === 'APPROVED_AND_SIGNED';
      if (approved) percentage += 30;

      const members = period.members ?? [];
      if (members.length > 0) percentage += 30;

      percentage = Math.max(0, Math.min(100, percentage));

      return {
        stepId: this.stepId,
        percentage,
        status: deriveStepStatus(percentage),
        details: `Comité de Convivencia ${period.periodName}: ${period.status} / ${period.approvalStatus} · ${members.length} miembros`,
        criteria: ['Comité activo', 'Estado aprobado', 'Miembros conformados'],
        pendingCriteria: [
          ...(active ? [] : ['Activar el periodo del comité']),
          ...(approved ? [] : ['Completar aprobación del periodo']),
          ...(members.length > 0 ? [] : ['Conformar miembros del comité']),
        ],
        data: {
          active,
          approved,
          members: members.length,
          status: period.status,
          approvalStatus: period.approvalStatus,
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
