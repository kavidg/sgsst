import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { StepId } from '../../implementation-wizard/schemas/implementation-wizard.schema';
import { CopasstService } from '../../copasst/copasst.service';
import { deriveStepStatus } from '../implementation-calculator';
import {
  ProviderValidationResult,
  WizardValidationProvider,
} from '../interfaces/wizard-validation-provider.interface';

/**
 * Valida el paso `copasst` del Centro de Implementación usando el periodo
 * COPASST real de la empresa:
 *
 * - Periodo activo/vigente (status ACTIVO o PROXIMO_A_VENCER).
 * - Aprobación completa (APPROVED / APPROVED_AND_SIGNED).
 * - Miembros conformados.
 * - O excepción justificada (requiresCopasst === false).
 */
@Injectable()
export class CopasstProvider implements WizardValidationProvider {
  readonly stepId: StepId = 'copasst';

  constructor(private readonly copasstService: CopasstService) {}

  async getValidation(companyId: string): Promise<ProviderValidationResult> {
    try {
      const period = await this.copasstService.findCurrent(
        new Types.ObjectId(companyId),
      );

      // Excepción justificada: la empresa no requiere COPASST.
      if (period.requiresCopasst === false) {
        return {
          stepId: this.stepId,
          percentage: 100,
          status: 'COMPLETED',
          details: 'Empresa exenta de COPASST (justificado)',
          criteria: ['Periodo activo', 'Aprobación completa', 'Miembros conformados'],
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
        details: `COPASST ${period.periodName}: ${period.status} / ${period.approvalStatus} · ${members.length} miembros`,
        criteria: ['Periodo activo', 'Aprobación completa', 'Miembros conformados'],
        pendingCriteria: [
          ...(active ? [] : ['Activar el periodo COPASST']),
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
        details: 'Periodo COPASST no encontrado',
      };
    }
  }
}
