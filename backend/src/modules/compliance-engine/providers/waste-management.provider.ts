import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  WasteDisposalFrequency,
  WasteManagementRecord,
  WasteManagementRecordDocument,
  WasteManagementStatus,
  WASTE_DISPOSAL_FREQUENCY_DAYS,
} from '../../waste-management/schemas/waste-management-record.schema';
import {
  WasteTypeDeclaration,
  WasteTypeDeclarationDocument,
} from '../../waste-management/schemas/waste-type-declaration.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';

/**
 * Evaluación automática del estándar 3.1.9 "Eliminación adecuada de residuos
 * sólidos, líquidos o gaseosos" (FASE 34C). Semantic: EXACT.
 *
 * METADATA:
 *   standard: 3.1.9
 *   module: waste-management
 *   phase: do
 *   semantic: EXACT
 *
 * REGLAS DE IMPLEMENTACIÓN (NO NEGOCIABLES — frontera anti-double-scoring):
 *
 * 1. Evalúa EXCLUSIVAMENTE WasteManagementRecord; las demás entidades no son
 *    fuente primaria de puntuación para 3.1.9. Employee se utiliza ÚNICAMENTE
 *    como denominador poblacional cuando corresponda (no afecta la fórmula
 *    actual).
 * 2. NO consume como evidencia: HazardousSubstance (4.1.3),
 *    EnvironmentalMeasurement (4.1.4), InspectionActivity (4.2.4),
 *    Maintenance (4.2.5), HealthPromotionActivity (3.1.2/3.1.7),
 *    WorkplaceSanitaryCondition (3.1.8), WorkRestriction (3.1.6), JobProfile
 *    (3.1.3), Risk ni DocumentMaster. Una sustancia peligrosa ≠ residuo
 *    gestionado; una medición ambiental ≠ disposición; un documento ≠
 *    ejecución.
 * 3. Registro VÁLIDO para C2/C3/C4: active = true Y status = ACTIVE (un
 *    registro PLANNED identifica el residuo pero NO demuestra disposición
 *    ejecutada; SUSPENDED tampoco). C1 cuenta cobertura de TIPOS con
 *    registros activos (cualquier estado del enum, porque identificar el
 *    residuo ya es parte de C1).
 * 4. hazardous = true es SOLO clasificación operativa: NO produce
 *    cumplimiento automático (CASO L).
 * 5. Registro ACTIVE sin disposalMethod no alcanza cumplimiento completo
 *    (C2 lo penaliza; el service además lo rechaza al crear).
 *
 * DETERMINACIÓN DE "TIPOS REALMENTE GENERADOS" (C1 — §17):
 * NO se asume que toda empresa genera los tres tipos. La declaración
 * EXPLÍCITA vive en la colección propia del módulo
 * (WasteTypeDeclaration, documento único por empresa con
 * `declaredWasteTypes: WasteType[]`), metadata operativa mínima — NO es un
 * Applicability Engine. Fallbacks, en orden:
 *   a) declaración explícita (autoridad del denominador; se unen los tipos
 *      ya cubiertos por registros para no penalizar operación real);
 *   b) si NO existe declaración: tipos con registros activos (la cobertura
 *      mínima demostrable es lo que la empresa misma registra).
 * NO se infieren tipos generados desde Risk, sustancias ni mediciones.
 *
 * CRITERIOS C1–C4 (25% cada uno):
 *
 * C1 — Identificación y cobertura: tipos cubiertos (con ≥1 registro activo,
 *      cualquier estado) / tipos realmente generados (declarados).
 * C2 — Manejo y disposición: registros activos con handlingMethod +
 *      disposalMethod (+ disposalDestination) / registros activos.
 *      "El residuo existe" ≠ "el residuo se dispuso".
 * C3 — Trazabilidad: registros activos con lastDisposalDate + responsible +
 *      evidenceUrl (+ destination) / registros activos. Un documento aislado
 *      NO cuenta: la evidencia debe vivir en el registro operativo.
 * C4 — Continuidad: disposiciones VIGENTES (dentro de la ventana de la
 *      frecuencia declarada) / registros con manejo + disposición. Evaluable
 *      solo sobre disposiciones realmente ejecutadas; nextDisposalDate
 *      vencida penaliza y genera finding. No se usa updatedAt como fecha de
 *      disposición.
 */
@Injectable()
export class WasteManagementProvider implements ComplianceProvider {
  private static readonly COMPLIANCE_TARGET = 90;

  constructor(
    @InjectModel(WasteManagementRecord.name)
    private readonly recordModel: Model<WasteManagementRecordDocument>,
    /** Declaración explícita de tipos generados (metadata del propio módulo). */
    @InjectModel(WasteTypeDeclaration.name)
    private readonly declarationModel: Model<WasteTypeDeclarationDocument>,
  ) {}

  /** Metadata del provider. */
  get metadata() {
    return {
      module: 'waste-management',
      standard: '3.1.9',
      phase: 'do' as const,
      semantic: 'EXACT' as const,
      title: 'Eliminación adecuada de residuos sólidos, líquidos o gaseosos',
      description:
        'Gestión y disposición final adecuada de los residuos generados por la operación, con trazabilidad y continuidad.',
    };
  }

  /**
   * Calcula el cumplimiento del estándar 3.1.9 para una empresa.
   */
  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    if (!Types.ObjectId.isValid(companyId)) {
      return this.noData('waste-management-invalid-company', 'companyId inválido');
    }

    const companyObjectId = new Types.ObjectId(companyId);

    const [records, declarations] = await Promise.all([
      this.recordModel
        .find({ companyId: companyObjectId })
        .sort({ lastDisposalDate: -1, createdAt: -1 })
        .lean(),
      this.declarationModel
        .findOne({ companyId: companyObjectId } as Record<string, unknown>)
        .lean() as Promise<WasteTypeDeclarationDocument | null>,
    ]);

    // Registro activo: única evidencia vigente (§12/§17).
    const activeRecords = records.filter((r) => r.active);

    // ── NO_DATA: sin registros activos no existe evidencia evaluable ──
    if (activeRecords.length === 0) {
      return {
        module: 'waste-management',
        percentage: 0,
        status: 'NO_DATA',
        findings: [
          {
            id: 'waste-management-no-records',
            module: 'waste-management',
            title: 'Sin registros de gestión de residuos',
            description:
              'No existen registros activos de residuos sólidos, líquidos o gaseosos generados por la operación. El estándar 3.1.9 exige evidencia de identificación, manejo y disposición adecuada. Un documento (DocumentMaster) o un inventario de sustancias NO sustituye este registro.',
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

    // ── C1 — Identificación y cobertura (25%): tipos cubiertos / declarados ──
    const coveredTypes = new Set<string>(activeRecords.map((r) => r.wasteType));
    const declared = this.resolveDeclaredTypes(declarations, coveredTypes);
    const c1 = coveredTypes.size / declared.length;

    // Registros elegibles para gestión demostrada: ACTIVE únicamente.
    const managed = activeRecords.filter(
      (r) => r.status === WasteManagementStatus.ACTIVE,
    );

    // ── C2 — Manejo y disposición (25%) sobre registros activos ──
    let c2Sum = 0;
    for (const record of managed) {
      const hasHandling = (record.handlingMethod ?? '').trim().length > 0;
      const hasDisposal = (record.disposalMethod ?? '').trim().length > 0;
      const hasDestination = (record.disposalDestination ?? '').trim().length > 0;
      if (hasHandling && hasDisposal && hasDestination) {
        c2Sum += 1;
      } else if (hasHandling && hasDisposal) {
        // Manejo + disposición sin destino explícito: la existencia del
        // método ya implica destino operativo; cuenta parcial.
        c2Sum += 0.5;
      }
      // Solo manejo, o nada: 0 (la mera existencia del residuo no cumple).
    }
    const c2 = managed.length > 0 ? c2Sum / managed.length : 0;

    // Registros con manejo + disposición registrados: la continuidad (C4)
    // solo es evaluable sobre una disposición REALMENTE ejecutada; sin
    // método de disposición no hay cadena manejo→disposición→continuidad.
    const disposedRecords = managed.filter(
      (r) =>
        (r.handlingMethod ?? '').trim().length > 0 &&
        (r.disposalMethod ?? '').trim().length > 0,
    );

    // ── C3 — Trazabilidad (25%): fecha + responsable + evidencia (+ destino) ──
    let c3Sum = 0;
    for (const record of managed) {
      const hasDate =
        record.lastDisposalDate !== undefined && record.lastDisposalDate !== null;
      const hasResponsible = (record.responsible ?? '').trim().length > 0;
      const hasEvidence = (record.evidenceUrl ?? '').trim().length > 0;
      const hasDestination = (record.disposalDestination ?? '').trim().length > 0;
      if (hasDate && hasResponsible && hasEvidence && hasDestination) {
        c3Sum += 1;
      }
      // Un documento aislado NO cuenta: falta la fecha de disposición del
      // registro operativo.
    }
    const c3 = managed.length > 0 ? c3Sum / managed.length : 0;

    // ── C4 — Continuidad (25%): disposición dentro de la frecuencia ──
    // Se evalúa EXCLUSIVAMENTE sobre registros con manejo + disposición
    // (disposedRecords): sin método de disposición registrado, una fecha
    // NO demuestra que la eliminación ocurrió.
    const now = Date.now();
    let c4Sum = 0;
    let overdueCount = 0;
    for (const record of disposedRecords) {
      const nextOverdue =
        record.nextDisposalDate !== undefined &&
        record.nextDisposalDate !== null &&
        new Date(record.nextDisposalDate).getTime() < now;
      if (nextOverdue) {
        overdueCount += 1;
        continue;
      }
      if (record.lastDisposalDate) {
        const days = WASTE_DISPOSAL_FREQUENCY_DAYS[record.disposalFrequency];
        const last = new Date(record.lastDisposalDate).getTime();
        const expiry = last + days * 24 * 60 * 60 * 1000;
        if (now <= expiry) {
          c4Sum += 1;
        } else {
          // Fuera de la ventana esperada: penaliza y genera finding.
          overdueCount += 1;
        }
      }
      // Sin lastDisposalDate: no puede demostrar continuidad (ya penaliza C3).
    }
    const c4 = disposedRecords.length > 0 ? c4Sum / disposedRecords.length : 0;

    const percentage = Math.round(c1 * 25 + c2 * 25 + c3 * 25 + c4 * 25);

    // ── Estado (mapeo sobre el contrato existente) ──
    // NO_DATA       → sin evidencia (rama anterior).
    // NON_COMPLIANT → registro ACTIVE sin método de disposición (brecha
    //                 verificable de gestión) o disposición vencida.
    // TARGET_MET    → cumplimiento ≥ objetivo (90), convención de providers.
    // PARTIAL       → cobertura o gestión incompleta.
    const activeWithoutDisposal = managed.some(
      (r) => !(r.disposalMethod ?? '').trim(),
    );
    const status =
      percentage >= WasteManagementProvider.COMPLIANCE_TARGET && !activeWithoutDisposal
        ? 'TARGET_MET'
        : activeWithoutDisposal || overdueCount > 0
          ? 'NON_COMPLIANT'
          : 'PARTIAL';

    // ── Findings ──
    const findings: ProviderComplianceResult['findings'] = [];

    if (managed.length === 0) {
      findings.push({
        id: 'waste-management-no-managed-records',
        module: 'waste-management',
        title: 'Residuos identificados sin gestión activa (solo PLANNED/SUSPENDED)',
        description:
          'Existen registros de residuos pero ninguno en estado ACTIVE. Un registro PLANNED identifica el residuo pero NO demuestra disposición ejecutada. Completar manejo y disposición.',
        priority: FindingPriority.HIGH,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    const withoutDisposal = managed.filter(
      (r) => !(r.disposalMethod ?? '').trim(),
    );
    if (withoutDisposal.length > 0) {
      findings.push({
        id: 'waste-management-disposal-method-pending',
        module: 'waste-management',
        title: `${withoutDisposal.length} registro(s) activo(s) sin método de disposición`,
        description:
          'Un registro ACTIVE sin disposalMethod NO alcanza cumplimiento completo. Registrar el método de disposición (gestor autorizado, tratamiento, disposición final).',
        priority: FindingPriority.HIGH,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    const withoutTraceability = managed.filter((r) => {
      const hasDate = r.lastDisposalDate !== undefined && r.lastDisposalDate !== null;
      const hasResponsible = (r.responsible ?? '').trim().length > 0;
      const hasEvidence = (r.evidenceUrl ?? '').trim().length > 0;
      const hasDestination = (r.disposalDestination ?? '').trim().length > 0;
      return !(hasDate && hasResponsible && hasEvidence && hasDestination);
    });
    if (withoutTraceability.length > 0) {
      findings.push({
        id: 'waste-management-traceability-pending',
        module: 'waste-management',
        title: `${withoutTraceability.length} registro(s) sin trazabilidad completa`,
        description:
          'Cada registro activo debe tener fecha de disposición, responsable, evidencia asociada y destino. Un documento aislado no sustituye el registro operativo.',
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    if (overdueCount > 0) {
      findings.push({
        id: 'waste-management-disposal-overdue',
        module: 'waste-management',
        title: `${overdueCount} registro(s) con disposición vencida o fuera de frecuencia`,
        description:
          'La vigencia de la disposición depende de la frecuencia declarada. Ejecutar la disposición pendiente y actualizar las fechas; no se acepta vigencia indefinida.',
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    const hazardousRecords = activeRecords.filter((r) => r.hazardous);
    const hazardousWithoutDisposal = hazardousRecords.filter(
      (r) => !(r.disposalMethod ?? '').trim() || r.status !== WasteManagementStatus.ACTIVE,
    );
    if (hazardousWithoutDisposal.length > 0) {
      findings.push({
        id: 'waste-management-hazardous-not-evidence',
        module: 'waste-management',
        title: `${hazardousWithoutDisposal.length} residuo(s) peligroso(s) sin disposición demostrada`,
        description:
          'hazardous = true es clasificación operativa: NO produce cumplimiento automático. El residuo peligroso debe estar gestionado (ACTIVE) con método y trazabilidad de disposición.',
        priority: FindingPriority.MEDIUM,
        status: 'OPEN',
        responsible: '',
        dueDate: '',
        createdAt: new Date().toISOString(),
      });
    }

    const completed = managed.filter((r) => {
      const hasHandling = (r.handlingMethod ?? '').trim().length > 0;
      const hasDisposal = (r.disposalMethod ?? '').trim().length > 0;
      const hasDestination = (r.disposalDestination ?? '').trim().length > 0;
      const hasDate = r.lastDisposalDate !== undefined && r.lastDisposalDate !== null;
      const hasResponsible = (r.responsible ?? '').trim().length > 0;
      const hasEvidence = (r.evidenceUrl ?? '').trim().length > 0;
      return hasHandling && hasDisposal && hasDestination && hasDate && hasResponsible && hasEvidence;
    }).length;

    return {
      module: 'waste-management',
      percentage,
      status,
      findings,
      pending: managed.length - completed,
      completed,
      overdue: overdueCount,
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
    };
  }

  /**
   * Resuelve los tipos de residuo REALMENTE generados (C1).
   * Declaración explícita (WasteTypeDeclaration.declaredWasteTypes) con
   * fallback a los tipos cubiertos por registros propios. Nunca se infieren
   * desde Risk/sustancias/mediciones (§17).
   */
  private resolveDeclaredTypes(
    declaration: WasteTypeDeclarationDocument | null,
    coveredTypes: Set<string>,
  ): string[] {
    const declared = (declaration?.declaredWasteTypes ?? []).filter((t) =>
      Object.values(
        // Enum cerrado: solo los tres tipos normativos son válidos.
        { SOLID: 'SOLID', LIQUID: 'LIQUID', GASEOUS: 'GASEOUS' },
      ).includes(t),
    );
    if (declared.length > 0) {
      // La declaración es la autoridad; se unen los cubiertos para no
      // penalizar registros operando fuera de la declaración desactualizada.
      return Array.from(new Set([...declared, ...coveredTypes]));
    }
    return Array.from(coveredTypes);
  }

  /** Resultado NO_DATA con finding estructurado (código, no solo texto). */
  private noData(findingId: string, title: string): ProviderComplianceResult {
    return {
      module: 'waste-management',
      percentage: 0,
      status: 'NO_DATA',
      findings: [
        {
          id: findingId,
          module: 'waste-management',
          title,
          description:
            'No fue posible evaluar el estándar 3.1.9. Verifique los datos de la empresa.',
          priority: FindingPriority.CRITICAL,
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
}
