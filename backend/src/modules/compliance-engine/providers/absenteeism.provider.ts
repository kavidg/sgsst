import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Absenteeism,
  AbsenteeismDocument,
  AbsenteeismType,
} from '../../absenteeism/schemas/absenteeism.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';

/**
 * Evaluación automática del estándar 3.2.1 "Registro de ausentismo".
 *
 * Evalúa la trazabilidad administrativa del registro de ausentismo
 * conforme a la Resolución 0312 de 2019.
 *
 * Criterios y pesos (35/30/20/15):
 * - Existencia y volumen de registros:    35%
 * - Clasificación por causa:              30%
 * - Completitud administrativa:           20%
 * - Cobertura temporal:                   15%
 *
 * NO_DATA: sin registros de ausentismo.
 * TARGET_MET: percentage >= 90.
 * TARGET_NOT_MET: percentage < 90.
 */
@Injectable()
export class AbsenteeismProvider implements ComplianceProvider {
  private static readonly COMPLIANCE_TARGET = 90;

  constructor(
    @InjectModel(Absenteeism.name)
    private readonly absenteeismModel: Model<AbsenteeismDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);

    const records = await this.absenteeismModel
      .find({ companyId: companyObjectId })
      .sort({ fechaInicio: -1 })
      .exec();

    // ── NO_DATA ──
    if (records.length === 0) {
      return {
        module: 'absenteeism',
        percentage: 0,
        status: 'NO_DATA',
        findings: [
          {
            id: 'absenteeism-no-data',
            module: 'absenteeism',
            title: 'Sin registros de ausentismo',
            description:
              'No hay registros de ausentismo registrados para evaluar el cumplimiento del estándar 3.2.1. Registrar casos de ausentismo para evaluar la trazabilidad administrativa.',
            priority: FindingPriority.HIGH,
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
        pending: 0,
        completed: 0,
        overdue: 0,
        phases: { do: 0 } as Partial<Record<CompliancePhaseKey, number>>,
      };
    }

    const totalRecords = records.length;

    // ══════════════════════════════════════════════════════════
    // CRITERIO 1 — Existencia y volumen de registros (35%)
    //
    // Evalúa si existen registros y si el volumen es razonable.
    // Si hay al menos 1 registro, se considera que existe trazabilidad.
    // La cobertura se evalúa de forma administrativa: si hay registros
    // recientes (últimos 12 meses), se considera cobertura vigente.
    // ══════════════════════════════════════════════════════════

    const now = new Date();
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

    const recentRecords = records.filter(
      (r) => new Date(r.fechaInicio).getTime() >= twelveMonthsAgo.getTime(),
    );

    // Score: si hay registros recientes → 100%, si solo hay antiguos → 50%
    const volumeScore = recentRecords.length > 0 ? 1 : (totalRecords > 0 ? 0.5 : 0);

    // ══════════════════════════════════════════════════════════
    // CRITERIO 2 — Clasificación por causa (30%)
    //
    // Evalúa que los registros estén clasificados por tipo.
    // El schema actual tiene 3 tipos: ENFERMEDAD, ACCIDENTE, PERMISO.
    // Se evalúa si existen registros de al menos un tipo válido
    // y si la distribución refleja diversidad de causas.
    // ══════════════════════════════════════════════════════════

    const byType = new Map<string, number>();
    for (const record of records) {
      const tipo = record.tipo;
      byType.set(tipo, (byType.get(tipo) ?? 0) + 1);
    }

    const uniqueTypes = byType.size;
    // 3 tipos posibles: ENFERMEDAD, ACCIDENTE, PERMISO
    const classificationScore = Math.min(uniqueTypes / 3, 1);

    // ══════════════════════════════════════════════════════════
    // CRITERIO 3 — Completitud administrativa (20%)
    //
    // Evalúa que los registros tengan la información mínima:
    // - tipo definido
    // - fechaInicio definida
    // - fechaFin definida
    // - días calculado
    // ══════════════════════════════════════════════════════════

    let completeRecords = 0;
    for (const record of records) {
      const hasType = !!record.tipo;
      const hasStart = !!record.fechaInicio;
      const hasEnd = !!record.fechaFin;
      const hasDays = typeof record.dias === 'number' && record.dias > 0;

      if (hasType && hasStart && hasEnd && hasDays) {
        completeRecords++;
      }
    }

    const completenessScore = completeRecords / totalRecords;

    // ══════════════════════════════════════════════════════════
    // CRITERIO 4 — Cobertura temporal (15%)
    //
    // Evalúa si los registros cubren un período razonable.
    // Si hay registros en al menos 2 meses diferentes → cobertura temporal.
    // Si solo hay registros en 1 mes → cobertura parcial.
    // ══════════════════════════════════════════════════════════

    const monthsWithRecords = new Map<string, number>();
    for (const record of records) {
      const date = new Date(record.fechaInicio);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthsWithRecords.set(monthKey, (monthsWithRecords.get(monthKey) ?? 0) + 1);
    }

    const uniqueMonths = monthsWithRecords.size;
    let temporalScore: number;
    if (uniqueMonths >= 3) {
      temporalScore = 1;
    } else if (uniqueMonths === 2) {
      temporalScore = 0.75;
    } else {
      temporalScore = 0.5;
    }

    // ══════════════════════════════════════════════════════════
    // CÁLCULO FINAL (35/30/20/15)
    // Sin redondeos intermedios.
    // ══════════════════════════════════════════════════════════

    const percentage = Math.round(
      volumeScore * 35 +
      classificationScore * 30 +
      completenessScore * 20 +
      temporalScore * 15,
    );

    // ── Status ──
    const status =
      percentage >= AbsenteeismProvider.COMPLIANCE_TARGET
        ? 'TARGET_MET'
        : 'TARGET_NOT_MET';

    // ── Findings ──
    const findings: ProviderComplianceResult['findings'] = [];

    // Finding: registros incompletos
    const incompleteRecords = totalRecords - completeRecords;
    if (incompleteRecords > 0) {
      findings.push({
        id: 'absenteeism-records-incomplete',
        module: 'absenteeism',
        title: `${incompleteRecords} registro(s) de ausentismo con información incompleta`,
        description:
          `${incompleteRecords} de ${totalRecords} registros no tienen toda la información administrativa requerida (tipo, fechaInicio, fechaFin, días). Completar los campos faltantes para mejorar la trazabilidad del estándar 3.2.1.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Finding: solo registros antiguos (sin cobertura reciente)
    if (recentRecords.length === 0 && totalRecords > 0) {
      findings.push({
        id: 'absenteeism-no-recent-records',
        module: 'absenteeism',
        title: 'Sin registros de ausentismo en los últimos 12 meses',
        description:
          'No existen registros de ausentismo en los últimos 12 meses. El estándar 3.2.1 requiere un registro sistemático y actualizado. Verificar que se estén registrando los casos de ausentismo.',
        priority: FindingPriority.HIGH,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Finding: cobertura temporal limitada
    if (uniqueMonths === 1 && totalRecords > 0) {
      findings.push({
        id: 'absenteeism-limited-temporal-coverage',
        module: 'absenteeism',
        title: 'Registros concentrados en un solo período',
        description:
          `Los ${totalRecords} registros de ausentismo están concentrados en un solo mes. El estándar 3.2.1 requiere análisis periódico de tendencias, lo cual requiere datos de múltiples períodos.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Finding: sin diversidad de tipos
    if (uniqueTypes < 2 && totalRecords > 0) {
      findings.push({
        id: 'absenteeism-low-type-diversity',
        module: 'absenteeism',
        title: 'Registros concentrados en un solo tipo de ausentismo',
        description:
          `Los registros de ausentismo están concentrados en un solo tipo (${[...byType.keys()][0]}). El estándar 3.2.1 requiere consolidado por causa médica y no médica. Verificar la clasificación de los registros.`,
        priority: FindingPriority.LOW,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // Finding: sin análisis de tendencias (limitación arquitectónica)
    // El módulo actual no tiene entidad de "análisis periódico formal".
    // Este finding es informativo sobre una limitación conocida.
    if (totalRecords >= 5 && uniqueMonths >= 2) {
      // Si hay suficientes datos, no generar finding de tendencias
      // (los datos son suficientes para un análisis básico)
    } else if (totalRecords > 0) {
      findings.push({
        id: 'absenteeism-insufficient-trend-data',
        module: 'absenteeism',
        title: 'Datos insuficientes para análisis de tendencias',
        description:
          `Con ${totalRecords} registros en ${uniqueMonths} mes(es), no existe suficiente información para un análisis de tendencias confiable. El estándar 3.2.1 requiere análisis periódico de tendencias y variables críticas.`,
        priority: FindingPriority.LOW,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // ── Pending / Completed ──
    // En ausentismo, todos los registros son "completados" (ya ocurrieron).
    // No hay concepto de "pendiente" en el sentido de otros módulos.
    const completedRecords = totalRecords;
    const pendingRecords = 0;

    return {
      module: 'absenteeism',
      percentage,
      status,
      findings,
      pending: pendingRecords,
      completed: completedRecords,
      overdue: 0,
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }
}
