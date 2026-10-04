import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  Incident,
  IncidentDocument,
} from '../../incidents/schemas/incident.schema';
import { Employee, EmployeeDocument } from '../../employees/schemas/employee.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';
import {
  ACCIDENT_STATISTICS_FORMULA,
  ACCIDENT_STATISTICS_MODULE,
  ACCIDENT_STATISTICS_SCORE_WEIGHTS,
  ACCIDENT_STATISTICS_STANDARD_CODE,
  ACCIDENT_STATISTICS_STANDARD_TITLE,
  ACCIDENT_STATISTICS_TARGET,
  AccidentStatisticsInput,
  computeAccidentStatisticsScore,
} from './accident-statistics-scoring';

/**
 * Evaluación automática del estándar 3.2.3
 * "Registro y análisis estadístico de accidentes de trabajo y enfermedades laborales".
 *
 * E2-lite: el provider es ADAPTADOR del scorer puro
 * (`accident-statistics-scoring.ts` — dimensions:v1, reglas EXACTAMENTE
 * equivalentes al scoring inline previo). Identidad en código ejecutable:
 *   module: 'accident-statistics' · standardCode: '3.2.3'
 *   title: 'Registro y análisis estadístico de accidentes y enfermedades laborales'
 *   phase: 'do' · semantic: 'EXACT' · target: 90
 *
 * RESPONSABILIDADES DEL PROVIDER (solo transporte/adaptación):
 * 1. Consultar Incident tenant-scoped (UNA query, sin N+1).
 * 2. Consultar Employee (población de referencia, UNA query countDocuments).
 * 3. Preparar el input serializable del scorer.
 * 4. Ejecutar el scorer puro.
 * 5. Convertir el resultado al contrato del ComplianceEngine
 *    (findings/pending/completed/overdue/phases/metadata).
 *
 * NO_DATA: 0 incidentes → finding 'accident-statistics-no-data'
 * (regla EXACTA preservada; sin condiciones adicionales, sin caps, sin
 * redistribución).
 *
 * FUENTES: Incident (operativa) + Employee (población). PROHIBIDO consultar
 * AccountabilityMeeting/Commitment, AnnualAudit, ManagementReview, indicadores
 * de 6.1.1 u otros estándares para calcular 3.2.3.
 *
 * FRONTERA (E0): 3.2.1 (reporte — absenteeism), 3.2.2 (investigación —
 * disease-investigation) y 6.1.1 (indicadores — accident-frequency/severity/
 * mortality) leen Incident/Employee de forma legítima, cada uno evaluando su
 * propio requisito. Este provider puntúa EXCLUSIVAMENTE el registro y análisis
 * estadístico.
 */
@Injectable()
export class AccidentStatisticsProvider implements ComplianceProvider {
  private static readonly MODULE = ACCIDENT_STATISTICS_MODULE;
  private static readonly COMPLIANCE_TARGET = ACCIDENT_STATISTICS_TARGET;

  constructor(
    @InjectModel(Incident.name)
    private readonly incidentModel: Model<IncidentDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
  ) {}

  /** Metadata oficial del provider (identidad 3.2.3 en código ejecutable). */
  get metadata() {
    return {
      module: ACCIDENT_STATISTICS_MODULE,
      standard: ACCIDENT_STATISTICS_STANDARD_CODE,
      standardCode: ACCIDENT_STATISTICS_STANDARD_CODE,
      title: ACCIDENT_STATISTICS_STANDARD_TITLE,
      phase: 'do' as const,
      semantic: 'EXACT' as const,
      formula: ACCIDENT_STATISTICS_FORMULA,
      target: ACCIDENT_STATISTICS_TARGET,
      weights: { ...ACCIDENT_STATISTICS_SCORE_WEIGHTS },
    };
  }

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const objectId = new Types.ObjectId(companyId);

    // ── 1. Incidentes del tenant (UNA query; sin N+1) ──
    const incidents = await this.incidentModel
      .find({ companyId: objectId })
      .sort({ date: -1 })
      .lean()
      .exec();

    // ── 2. Población trabajadora de referencia (UNA query count) ──
    const workerCount = await this.employeeModel
      .countDocuments({ companyId: objectId })
      .exec();

    // ── 3+4. Input serializable + scorer puro ──
    const input: AccidentStatisticsInput = {
      incidents: incidents.map((i) => ({
        date: i.date,
        description: i.description,
        investigationType: i.investigationType,
        daysLost: i.daysLost,
      })),
      workerCount,
    };
    const breakdown = computeAccidentStatisticsScore(input);

    // ── 5a. NO_DATA (condición exacta preservada: 0 incidentes) ──
    if (breakdown.noData) {
      return {
        module: AccidentStatisticsProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: [
          {
            id: 'accident-statistics-no-data',
            module: AccidentStatisticsProvider.MODULE,
            title: 'Sin registros de accidentalidad para análisis estadístico',
            description:
              'No existen registros de accidentes de trabajo o enfermedades laborales. El estándar 3.2.3 requiere registro y análisis estadístico.',
            priority: FindingPriority.HIGH,
            status: 'OPEN',
            responsible: '',
            dueDate: '',
            createdAt: new Date().toISOString(),
          },
        ],
        pending: 0,
        completed: 0,
        phases: { do: 0 } as Partial<Record<CompliancePhaseKey, number>>,
      };
    }

    // ── 5b. Findings (mismos IDs, títulos y condiciones del provider previo) ──
    const { counters } = breakdown;
    const findings: ProviderComplianceResult['findings'] = [];

    findings.push({
      id: 'accident-statistics-summary',
      module: AccidentStatisticsProvider.MODULE,
      title: `Resumen estadístico: ${counters.totalEvents} eventos (${counters.accidentCount} AT, ${counters.diseaseCount} EL)`,
      description:
        `Registro y análisis estadístico: ${counters.totalEvents} eventos totales, ` +
        `${counters.accidentCount} accidentes de trabajo, ${counters.diseaseCount} enfermedades laborales, ` +
        `${counters.totalDaysLost} días perdidos acumulados en ${counters.distinctMonths} período(s).`,
      priority: FindingPriority.MEDIUM,
      status: 'OPEN',
      responsible: '',
      dueDate: '',
      createdAt: new Date().toISOString(),
    });

    if (counters.unclassifiedCount > 0) {
      findings.push({
        id: 'accident-statistics-unclassified',
        module: AccidentStatisticsProvider.MODULE,
        title: `${counters.unclassifiedCount} evento(s) sin clasificación AT/EL`,
        description:
          `${counters.unclassifiedCount} de ${counters.totalEvents} registros no están clasificados como Accidente de Trabajo o Enfermedad Laboral.`,
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    if (counters.workerCount === 0) {
      findings.push({
        id: 'accident-statistics-no-workers',
        module: AccidentStatisticsProvider.MODULE,
        title: 'Sin datos de trabajadores para cálculo de tasas',
        description:
          'No existen trabajadores registrados. Se requiere la nómina para calcular tasas de frecuencia y severidad.',
        priority: FindingPriority.HIGH,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // ── 5c. Contrato estándar del ComplianceEngine ──
    return {
      module: AccidentStatisticsProvider.MODULE,
      percentage: breakdown.percentage,
      status:
        breakdown.percentage >= AccidentStatisticsProvider.COMPLIANCE_TARGET
          ? 'TARGET_MET'
          : 'TARGET_NOT_MET',
      findings,
      pending: counters.unclassifiedCount,
      completed: counters.totalEvents - counters.unclassifiedCount,
      phases: { do: breakdown.percentage } as Partial<Record<CompliancePhaseKey, number>>,
      metadata: {
        semantic: 'EXACT',
        standardCode: ACCIDENT_STATISTICS_STANDARD_CODE,
        standardTitle: ACCIDENT_STATISTICS_STANDARD_TITLE,
        formula: ACCIDENT_STATISTICS_FORMULA,
        target: ACCIDENT_STATISTICS_TARGET,
        weights: { ...ACCIDENT_STATISTICS_SCORE_WEIGHTS },
        dimensions: breakdown.dimensions,
        counters,
      },
    };
  }
}
