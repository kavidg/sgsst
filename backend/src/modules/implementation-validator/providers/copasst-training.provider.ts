import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { StepId } from '../../implementation-wizard/schemas/implementation-wizard.schema';
import { PhvaAdvancedCopasstTrainingService } from '../../phva-advanced/phva-advanced-copasst-training.service';
import { deriveStepStatus } from '../implementation-calculator';
import {
  ProviderValidationResult,
  WizardValidationProvider,
} from '../interfaces/wizard-validation-provider.interface';

/**
 * Valida el paso `copasst_training` del Centro de Implementación usando la
 * implementación REAL del estándar 1.1.7 — Capacitación COPASST (Fase 6).
 *
 * Criterios (todos basados en datos reales del dominio, nunca en la mera
 * existencia de un documento):
 *
 * - Entidad 1.1.7 registrada (programa anual de capacitación COPASST).
 * - Periodo COPASST vigente con miembros activos (denominador real).
 * - Programa anual definido (planificación).
 * - Sesiones de capacitación registradas.
 * - Participantes con snapshot en las sesiones.
 * - Evidencia de ejecución: al menos una sesión EJECUTADA
 *   (status === 'Ejecutada' OR completionDate).
 *
 * SEPARACIÓN DE CONCEPTOS (obligatoria): este provider determina si existe una
 * IMPLEMENTACIÓN FUNCIONAL de 1.1.7. El nivel de CUMPLIMIENTO de esa
 * implementación (cobertura, umbrales) es responsabilidad del Compliance
 * Engine (CopasstTrainingProvider), NO de este provider.
 *
 * Multi-tenancy: toda consulta pasa por PhvaAdvancedCopasstTrainingService,
 * que filtra SIEMPRE por companyId; un companyId de otra empresa se comporta
 * como entidad inexistente (0%, sin fuga de datos).
 */
@Injectable()
export class CopasstTrainingProvider implements WizardValidationProvider {
  readonly stepId: StepId = 'copasst_training';

  constructor(
    private readonly copasstTrainingService: PhvaAdvancedCopasstTrainingService,
  ) {}

  async getValidation(companyId: string): Promise<ProviderValidationResult> {
    try {
      const objectId = new Types.ObjectId(companyId);
      const [record, members] = await Promise.all([
        this.copasstTrainingService.findByCompany(objectId),
        this.copasstTrainingService.getActiveCopasstMembers(objectId),
      ]);

      const sessions = record?.sessions ?? [];
      const annualProgram = record?.annualProgram ?? [];
      const hasParticipants = sessions.some(
        (session) => (session.copasstParticipants ?? []).length > 0,
      );
      const hasExecuted = sessions.some((session) =>
        this.copasstTrainingService.isSessionExecuted(session),
      );

      let percentage = 0;
      if (record) percentage += 15;
      if (members.length > 0) percentage += 15;
      if (annualProgram.length > 0) percentage += 20;
      if (sessions.length > 0) percentage += 20;
      if (hasParticipants) percentage += 15;
      if (hasExecuted) percentage += 15;
      percentage = Math.max(0, Math.min(100, percentage));

      const criteria = [
        'Entidad 1.1.7 registrada',
        'Periodo COPASST con miembros activos',
        'Programa anual de capacitación definido',
        'Sesiones de capacitación registradas',
        'Participantes con snapshot histórico',
        'Sesión ejecutada con evidencia',
      ];

      return {
        stepId: this.stepId,
        percentage,
        status: deriveStepStatus(percentage),
        details: record
          ? `${annualProgram.length} tema(s) en programa anual · ${sessions.length} sesión(es) · ${hasExecuted ? 'ejecución registrada' : 'sin sesiones ejecutadas'}`
          : 'Capacitación COPASST (1.1.7) no implementada',
        criteria: [
          ...(record ? ['Entidad 1.1.7 registrada'] : []),
          ...(members.length > 0 ? ['Periodo COPASST con miembros activos'] : []),
          ...(annualProgram.length > 0 ? ['Programa anual de capacitación definido'] : []),
          ...(sessions.length > 0 ? ['Sesiones de capacitación registradas'] : []),
          ...(hasParticipants ? ['Participantes con snapshot histórico'] : []),
          ...(hasExecuted ? ['Sesión ejecutada con evidencia'] : []),
        ],
        pendingCriteria: [
          ...(record ? [] : ['Registrar la capacitación COPASST en gestión avanzada (1.1.7)']),
          ...(members.length > 0 ? [] : ['Activar el periodo COPASST con miembros']),
          ...(annualProgram.length > 0 ? [] : ['Definir el programa anual de capacitación COPASST']),
          ...(sessions.length > 0 ? [] : ['Programar sesiones de capacitación']),
          ...(hasParticipants ? [] : ['Registrar participantes en las sesiones']),
          ...(hasExecuted ? [] : ['Ejecutar al menos una sesión de capacitación']),
        ],
        data: {
          hasEntity: Boolean(record),
          activeMembers: members.length,
          annualProgram: annualProgram.length,
          sessions: sessions.length,
          hasParticipants,
          hasExecuted,
        },
      };
    } catch {
      return {
        stepId: this.stepId,
        percentage: 0,
        status: 'PENDING',
        details: 'Capacitación COPASST no disponible',
      };
    }
  }
}
