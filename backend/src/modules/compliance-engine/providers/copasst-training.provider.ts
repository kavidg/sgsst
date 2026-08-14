import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { PhvaAdvancedCopasstTrainingService } from '../../phva-advanced/phva-advanced-copasst-training.service';
import { FindingPriority } from '../enums/finding-priority.enum';
import { classifyComplianceLevel } from '../utils/compliance-score';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Umbral de cobertura aceptable de la capacitación COPASST (1.1.7).
 *
 * Reutiliza la misma constante del módulo de capacitaciones (70%) porque el
 * motor no define un umbral global específico de 1.1.7: la regla queda
 * encapsulada en este provider y NO altera el umbral global del motor.
 */
export const COPASST_TRAINING_THRESHOLD = 70;

/**
 * Cumplimiento del estándar 1.1.7 — Capacitación de los integrantes del
 * COPASST (Fase 6).
 *
 * Fuente de datos REAL:
 * - Entidad `phva_advanced_copasst_training` vía PhvaAdvancedCopasstTrainingService
 *   (nunca acceso directo a la colección).
 * - Denominador: miembros ACTIVOS del periodo COPASST vigente, resuelto a
 *   través de CopasstService.findCurrent (reutilizado por el service de dominio,
 *   no se duplica la consulta del periodo).
 * - Numerador: miembros activos con al menos una sesión EJECUTADA
 *   (status === 'Ejecutada' OR completionDate). Cada miembro cuenta UNA sola
 *   vez. Las sesiones solo programadas NO cuentan.
 *
 * La cobertura la calcula el propio dominio (calculateCoverage): este provider
 * NO reimplementa la regla de sesión ejecutada ni la deduplicación.
 *
 * Multi-tenancy: TODA consulta se hace a través del service de dominio, que
 * filtra SIEMPRE por companyId. Un companyId de otra empresa simplemente no
 * encuentra entidad ni periodo (coverage 0, sin fuga de datos).
 */
@Injectable()
export class CopasstTrainingProvider implements ComplianceProvider {
  constructor(
    private readonly copasstTrainingService: PhvaAdvancedCopasstTrainingService,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    // El provider NUNCA lanza (contrato): cualquier estado sin datos produce
    // un resultado de cumplimiento 0 con hallazgos descriptivos.
    try {
      const objectId = new Types.ObjectId(companyId);
      const record = await this.copasstTrainingService.findByCompany(objectId);
      const coverage = await this.copasstTrainingService.calculateCoverage(
        objectId,
        record ?? undefined,
      );
      const period = await this.copasstTrainingService.getCurrentCopasstPeriod(objectId);

      const findings = this.buildFindings({
        hasEntity: Boolean(record),
        hasPeriod: Boolean(period),
        coverage,
      });

      return {
        module: 'copasst-training',
        percentage: coverage.coveragePercentage,
        status: classifyComplianceLevel(coverage.coveragePercentage),
        findings,
        pending: coverage.totalMembers - coverage.trainedMembers,
        completed: coverage.trainedMembers,
      };
    } catch (error) {
      // Error de infraestructura (conexión, timeout): devolver 0 controlado con
      // un hallazgo que lo deje explícito, sin romper el overview agregado.
      const message = error instanceof Error ? error.message : String(error);
      return {
        module: 'copasst-training',
        percentage: 0,
        status: classifyComplianceLevel(0),
        findings: [
          {
            id: 'copasst-training-error',
            module: 'copasst-training',
            title: 'No se pudo calcular la capacitación COPASST',
            description: `El módulo 1.1.7 no pudo resolverse para la empresa: ${message}`,
            priority: FindingPriority.HIGH,
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
        pending: 1,
        completed: 0,
      };
    }
  }

  private buildFindings(context: {
    hasEntity: boolean;
    hasPeriod: boolean;
    coverage: {
      totalMembers: number;
      trainedMembers: number;
      coveragePercentage: number;
      executedSessions: number;
    };
  }): ProviderComplianceResult['findings'] {
    const findings: ProviderComplianceResult['findings'] = [];
    const { hasEntity, hasPeriod, coverage } = context;

    if (!hasPeriod) {
      findings.push({
        id: 'copasst-training-no-period',
        module: 'copasst-training',
        title: 'Periodo COPASST no encontrado',
        description:
          'No existe un periodo COPASST vigente para la empresa, por lo que no puede determinarse la cobertura de capacitación de sus integrantes (1.1.7).',
        priority: FindingPriority.HIGH,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    if (!hasEntity) {
      findings.push({
        id: 'copasst-training-no-program',
        module: 'copasst-training',
        title: 'Programa de capacitación COPASST no registrado',
        description:
          'No existe programa anual de capacitación de los integrantes del COPASST registrado en gestión avanzada (1.1.7).',
        priority: FindingPriority.HIGH,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    if (hasEntity && coverage.executedSessions === 0) {
      findings.push({
        id: 'copasst-training-no-executed-sessions',
        module: 'copasst-training',
        title: 'Sin sesiones de capacitación COPASST ejecutadas',
        description:
          'Existen sesiones programadas pero ninguna sesión ejecutada de capacitación de los integrantes del COPASST (1.1.7). Las sesiones solo programadas no cuentan como capacitación.',
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    if (coverage.totalMembers > 0 && coverage.coveragePercentage < 100) {
      findings.push({
        id: 'copasst-training-partial-coverage',
        module: 'copasst-training',
        title: 'Capacitación COPASST incompleta',
        description: `${coverage.trainedMembers} de ${coverage.totalMembers} integrantes activos del COPASST capacitados (${coverage.coveragePercentage}%). Completar la formación de los integrantes pendientes (1.1.7).`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    return findings;
  }
}
