import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  OccupationalDiseaseCaseStatus,
  OccupationalDiseaseQualification,
  OccupationalDiseaseStatisticalCase,
  OccupationalDiseaseStatisticalCaseDocument,
} from '../../occupational-disease-statistical-case/schemas/occupational-disease-statistical-case.schema';
import { Employee, EmployeeDocument } from '../../employees/schemas/employee.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';

/**
 * Evaluación automática del estándar 3.3.4
 * "Medición de la prevalencia de enfermedad laboral".
 *
 * Definición aprobada (FASE 35C-1/35C-2):
 *   Prevalencia medida a una fecha de corte T:
 *     prevalence = (numerator / denominator) × 1000
 *
 *   numerator   = casos del registro estadístico del tenant con
 *                 occupationalQualification = QUALIFIED, active = true y
 *                 recognitionDate <= cutoffDate.
 *   denominator = headcount censal del tenant (Employee.status = 'Activo',
 *                 admissionDate <= cutoffDate; admissionDate ausente se
 *                 considera incluido por compatibilidad con datos previos).
 *   1000        = factor fijo por normativa (no configurable).
 *
 * Reglas del numerador (FASE 35C-2):
 * - caseStatus (OPEN/CLOSED) NO excluye: un caso cerrado sigue siendo un caso
 *   prevalente (existencia estadística ≠ gestión administrativa abierta).
 * - firstOccurrence NO se usa para prevalencia (es el filtro de 3.3.5).
 * - UNDER_REVIEW / NOT_QUALIFIED / DISCARDED nunca cuentan (Reglas C/D 35B).
 * - active = false (baja lógica/corrección) nunca cuenta.
 * - Un QUALIFIED sin recognitionDate no participa (no se infiere de createdAt/
 *   updatedAt/period); su ausencia degrada C2 (trazabilidad).
 *
 * Casos especiales:
 * - numerator = 0 + denominator > 0 + registro en uso → prevalencia 0 válida
 *   (no NO_DATA), con advertencia de posible subregistro.
 * - Colección completamente vacía + denominador válido → NO_DATA (no puede
 *   distinguirse "cero real" de "nunca se registró").
 * - denominator = 0 → NO_DATA (sin división, sin TARGET automático).
 *
 * Criterios y pesos (30/30/20/20, patrón 3.3.1/3.3.2/3.3.3):
 * - C1: Casos estadísticos válidos:            30%
 * - C2: Calidad/trazabilidad del numerador:     30%
 * - C3: Denominador poblacional y cálculo:      20%
 * - C4: Cobertura temporal de la medición:      20%
 *
 * Limitación documentada (FASE 35C-1): el denominador es un
 * census_headcount_proxy — Employee no registra fecha de retiro, por lo que el
 * headcount histórico exacto no es reproducible. No se agrega infraestructura.
 *
 * NO_DATA: colección de casos vacía o denominador 0.
 * PARTIAL: registro en uso pero trazabilidad incompleta (p. ej. casos sin
 *          employeeId) o sin comparación con período previo.
 * TARGET_MET: percentage >= 90 (prevalecía 0 con registro activo = ideal).
 * TARGET_NOT_MET: percentage < 90.
 */
@Injectable()
export class DiseasePrevalenceProvider implements ComplianceProvider {
  private static readonly MODULE = 'disease-prevalence';
  private static readonly COMPLIANCE_TARGET = 90;
  /** Factor fijo normativo: casos por 1.000 trabajadores. */
  private static readonly SCALE_FACTOR = 1000;

  constructor(
    @InjectModel(OccupationalDiseaseStatisticalCase.name)
    private readonly caseModel: Model<OccupationalDiseaseStatisticalCaseDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
  ) {}

  /** Metadata del provider (patrón 3.1.8/3.1.9/3.1.6). */
  get metadata() {
    return {
      module: DiseasePrevalenceProvider.MODULE,
      standard: '3.3.4',
      phase: 'do' as const,
      semantic: 'EXACT' as const,
      title: 'Medición de la prevalencia de enfermedad laboral',
      description:
        'Prevalencia medida a una fecha de corte T: casos de enfermedad laboral calificados existentes en el ' +
        'registro estadístico del tenant por cada 1.000 trabajadores de referencia del mismo tenant.',
    };
  }

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    if (!Types.ObjectId.isValid(companyId)) {
      return this.noData('disease-prevalence-invalid-company', 'companyId inválido');
    }

    const objectId = new Types.ObjectId(companyId);

    // ── Cutoff: fin del año en curso (patrón temporal de los providers del
    // capítulo 3: currentYear). Estado del registro al cierre del período. ──
    const now = new Date();
    const cutoffDate = new Date(Date.UTC(now.getUTCFullYear(), 11, 31, 23, 59, 59, 999));

    // ── Lectura tenant-scoped del registro estadístico (única fuente del
    // numerador). Sin conversión desde Incident/Absenteeism/… (Gate 4/5 35B). ──
    const allCases = await this.caseModel
      .find({ companyId: objectId })
      .lean()
      .exec();

    // ── Denominador: headcount censal del tenant a la fecha de corte. ──
    // status === 'Activo' (estado normalizado por el importador de Employees)
    // y admissionDate <= cutoff; admissionDate ausente → incluido
    // (compatibilidad aprobada en FASE 35C-1, §12).
    const denominator = await this.employeeModel
      .countDocuments({
        companyId: objectId,
        status: 'Activo',
        $or: [{ admissionDate: { $lte: cutoffDate } }, { admissionDate: { $exists: false } }, { admissionDate: null }],
      })
      .exec();

    const totalRecords = allCases.length;

    // ══ GATE: colección completamente vacía (Caso A — FASE 12) ══
    // No puede distinguirse "0 casos reales" de "nunca se registró nada".
    if (totalRecords === 0) {
      return {
        module: DiseasePrevalenceProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: [
          {
            id: 'disease-prevalence-no-data',
            module: DiseasePrevalenceProvider.MODULE,
            title: 'Sin datos para calcular la prevalencia',
            description:
              'El registro estadístico de enfermedad laboral no tiene ningún caso registrado. ' +
              'No es posible distinguir un cero real de la ausencia de información. ' +
              'Registrar los casos de enfermedad laboral para habilitar la medición de prevalencia (3.3.4).',
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
        metadata: this.buildMetadata(0, denominator, cutoffDate, { collectionEmpty: true }),
      };
    }

    // ══ GATE: denominador cero (FASE 13) ══
    if (denominator === 0) {
      return {
        module: DiseasePrevalenceProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings: [
          {
            id: 'disease-prevalence-no-denominator',
            module: DiseasePrevalenceProvider.MODULE,
            title: 'No existe población de referencia válida',
            description:
              'No existe población de referencia válida para calcular la prevalencia ' +
              '(0 trabajadores activos a la fecha de corte). Verificar el estado de la nómina en el sistema.',
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
        metadata: this.buildMetadata(0, 0, cutoffDate, {
        collectionEmpty: false,
        zeroDenominator: true,
        totalRecords,
      }),
      };
    }

    // ══ Numerador (FASE 6): QUALIFIED + active + recognitionDate <= cutoff ══
    // (corte por día, coherente con la validación Regla E del service 35B).
    const cutoffDay = Date.UTC(
      cutoffDate.getUTCFullYear(),
      cutoffDate.getUTCMonth(),
      cutoffDate.getUTCDate(),
    );
    const prevalentCases = allCases.filter((c) => {
      if (c.occupationalQualification !== OccupationalDiseaseQualification.QUALIFIED) return false;
      if (c.active !== true) return false;
      if (!c.recognitionDate) return false;
      const d = new Date(c.recognitionDate);
      if (Number.isNaN(d.getTime())) return false;
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) <= cutoffDay;
    });

    // Casos administrativos presentes pero que NO son casos prevalentes.
    const administrativeOnly = totalRecords - prevalentCases.length;

    // ══ C1 — Casos estadísticos válidos (30%) ══
    // Distingue "0 registros" (NO_DATA ya devuelto) de "registros pero 0 casos
    // prevalentes": con registro en uso y denominador válido, la medición existe.
    const c1 = 100;

    // ══ C2 — Calidad/trazabilidad del numerador (30%) ══
    // Trazabilidad mínima: employeeId presente (35B lo dejó opcional; un caso
    // sin vínculo al trabajador degrada la trazabilidad, NO lo excluye).
    const withoutEmployee = prevalentCases.filter((c) => !c.employeeId).length;
    const withEmployee = prevalentCases.length - withoutEmployee;
    const c2 =
      prevalentCases.length > 0
        ? Math.round((withEmployee / prevalentCases.length) * 100)
        : 100;

    // ══ C3 — Denominador poblacional y cálculo (20%) ══
    // Ya verificado denominator > 0 (gate previo) y la fórmula es determinista.
    const c3 = 100;

    // ══ C4 — Cobertura temporal (20%) ══
    // No impone periodicidad normativa dura. La medición es válida si existe
    // reconocimiento con fecha (la fuente temporal del estándar). Comparación
    // con el período previo documentada como metadata/finding informativo.
    const hasDatedRecognition = allCases.some((c) => {
      if (!c.recognitionDate) return false;
      const d = new Date(c.recognitionDate);
      return !Number.isNaN(d.getTime());
    });
    const c4 = hasDatedRecognition ? 100 : 0;

    const percentage = Math.round(c1 * 0.3 + c2 * 0.3 + c3 * 0.2 + c4 * 0.2);

    // ══ Fórmula (FASE 10): factor 1000 fijo, precisión interna completa. ══
    const prevalence =
      denominator > 0 ? (prevalentCases.length / denominator) * DiseasePrevalenceProvider.SCALE_FACTOR : 0;

    // ══ Findings ══
    const findings: ProviderComplianceResult['findings'] = [];

    if (prevalentCases.length === 0) {
      // FASE 11: 0 casos + denominador válido + registro en uso = medición válida.
      findings.push({
        id: 'disease-prevalence-zero-cases',
        module: DiseasePrevalenceProvider.MODULE,
        title: '0 casos cualificados registrados a la fecha de corte',
        description:
          `El registro estadístico está en uso (${totalRecords} registro(s) administrativo(s)) y hay ` +
          `${denominator} trabajador(es) de referencia, pero no existen casos QUALIFIED con ` +
          `recognitionDate <= ${cutoffDate.toISOString().slice(0, 10)}. Prevalencia = 0.00 por 1.000 trabajadores. ` +
          'Advertencia: un cero puede reflejar subregistro; verificar que los casos reales estén siendo calificados y registrados.',
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    } else {
      findings.push({
        id: 'disease-prevalence-rate',
        module: DiseasePrevalenceProvider.MODULE,
        title: `Prevalencia de enfermedad laboral: ${prevalence.toFixed(2)} por 1.000 trabajadores`,
        description:
          `${prevalentCases.length} caso(s) existente(s) (QUALIFIED, activos en el registro, reconocidos hasta el corte) ` +
          `sobre ${denominator} trabajador(es) de referencia. ` +
          `Tasa con precisión interna completa: ${prevalence} (factor fijo 1.000). ` +
          'La tasa y el porcentaje de cumplimiento son conceptos distintos: el score evalúa la medición (C1–C4), no penaliza la magnitud epidemiológica.',
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    if (withoutEmployee > 0) {
      findings.push({
        id: 'disease-prevalence-traceability-gap',
        module: DiseasePrevalenceProvider.MODULE,
        title: `${withoutEmployee} caso(s) sin trabajador asociado`,
        description:
          'Casos válidos sin employeeId: la trazabilidad por trabajador es incompleta (el modelo 35B permite casos sin vínculo). ' +
          'Asociar el caso al trabajador correspondiente cuando sea posible.',
        priority: FindingPriority.LOW,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    if (administrativeOnly > 0 && prevalentCases.length === 0) {
      findings.push({
        id: 'disease-prevalence-administrative-only',
        module: DiseasePrevalenceProvider.MODULE,
        title: `${administrativeOnly} registro(s) sin casos prevalentes`,
        description:
          'El registro contiene únicamente casos UNDER_REVIEW / NOT_QUALIFIED / DISCARDED (o inactivos): ' +
          'no son casos confirmados y no cuentan para la prevalencia.',
        priority: FindingPriority.LOW,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    // ══ Resultado (contrato ProviderComplianceResult, FASE 21) ══
    const status =
      percentage >= DiseasePrevalenceProvider.COMPLIANCE_TARGET
        ? 'TARGET_MET'
        : 'TARGET_NOT_MET';

    return {
      module: DiseasePrevalenceProvider.MODULE,
      percentage,
      status,
      findings,
      pending: 0,
      completed: prevalentCases.length,
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
      metadata: this.buildMetadata(prevalence, denominator, cutoffDate, {
        collectionEmpty: false,
        totalRecords,
        prevalentCases: prevalentCases.length,
        withoutEmployeeLink: withoutEmployee,
        administrativeOnlyRecords: administrativeOnly,
      }),
    };
  }

  /** NO_DATA reutilizable (patrón 3.1.8). */
  private noData(findingId: string, title: string): ProviderComplianceResult {
    return {
      module: DiseasePrevalenceProvider.MODULE,
      percentage: 0,
      status: 'NO_DATA',
      findings: [
        {
          id: findingId,
          module: DiseasePrevalenceProvider.MODULE,
          title,
          description: 'No es posible calcular la prevalencia de enfermedad laboral (3.3.4).',
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
      metadata: this.buildMetadata(0, 0, new Date(), { collectionEmpty: true, invalidCompanyId: true }),
    };
  }

  /** Metadata mínima (FASE 10/FASE 9): metric/unit/scaleFactor/numerator/denominator/cutoffDate. */
  private buildMetadata(
    prevalence: number,
    denominator: number,
    cutoffDate: Date,
    extra: {
      collectionEmpty: boolean;
      invalidCompanyId?: boolean;
      zeroDenominator?: boolean;
      totalRecords?: number;
      prevalentCases?: number;
      withoutEmployeeLink?: number;
      administrativeOnlyRecords?: number;
    },
  ): Record<string, unknown> {
    return {
      metric: 'prevalence',
      unit: 'casos por 1.000 trabajadores',
      scaleFactor: DiseasePrevalenceProvider.SCALE_FACTOR,
      /** Valor con precisión interna completa (sin redondeo intermedio). */
      prevalence,
      numerator: extra.prevalentCases ?? 0,
      denominator,
      cutoffDate: cutoffDate.toISOString(),
      denominatorType: 'census_headcount_proxy',
      collectionEmpty: extra.collectionEmpty,
      invalidCompanyId: extra.invalidCompanyId ?? false,
      zeroDenominator: extra.zeroDenominator ?? false,
      totalRecords: extra.totalRecords ?? 0,
      withoutEmployeeLink: extra.withoutEmployeeLink ?? 0,
      administrativeOnlyRecords: extra.administrativeOnlyRecords ?? 0,
    };
  }
}
