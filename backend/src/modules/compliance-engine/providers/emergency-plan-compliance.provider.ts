import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { PhvaAdvancedService } from '../../phva-advanced/phva-advanced.service';
import { SstEmergenciesDocument } from '../../phva-advanced/schemas/phva-advanced-emergencies.schema';
import { DocumentMaster, DocumentMasterDocument } from '../../document-management/schemas/document-master.schema';
import { FindingPriority } from '../enums/finding-priority.enum';
import { CompliancePhaseKey } from '../interfaces/compliance-engine.interface';
import { ComplianceProvider, ProviderComplianceResult } from './compliance-provider.interface';
import {
  EMERGENCY_PLAN_FORMULA,
  EMERGENCY_PLAN_MODULE,
  EMERGENCY_PLAN_SCORE_WEIGHTS,
  EMERGENCY_PLAN_STANDARD_CODE,
  computeEmergencyPlanScore,
} from './emergency-plan-scoring';

/**
 * Provider OFICIAL del estándar 5.1.1 — Plan de prevención, preparación y
 * respuesta ante emergencias (HACER).
 *
 * Reemplaza como evaluación de 5.1.1 al provider procedures-doc (wrong-mapping:
 * evaluaba procedimientos genéricos de DocumentMaster, no emergencias). El
 * provider procedures-doc se conserva para su evidencia propia; esta etapa lo
 * retira del scoring de 5.1.1 (ver compliance-weights.spec.ts BOUNDARY-16).
 *
 * FUENTE DE VERDAD: SstEmergencias, resuelta con las funciones legacy-aware
 * existentes (findEmergenciesByCompany con $in [5.1.1, 1.1.10]). El provider
 * NUNCA consulta por itemCode directo: la compatibilidad 5.1.1/1.1.10 vive en
 * PhvaAdvancedService y no se requiere migración física para scorear registros
 * legacy. Uso de LECTURA estricto (no upsert como efecto de scorear).
 *
 * El documento oficial (plan.documentId → DocumentMaster) se valida SOLO
 * cuando el plan lo referencia; es UNA sola evidencia documental dentro de la
 * dimensión Plan (documentUrl + documentId + DocumentMaster NO suman por
 * separado).
 *
 * FRONTERA 5.1.2: la brigada NO puntúa aquí (ni integrantes, ni funciones, ni
 * suplentes, ni capacitación de brigada). Solo aparece como metadata
 * complementaria `brigadesPresent` sin efecto en el score.
 *
 * PERFORMANCE: consultas bulk tenant-scoped (1 registro de emergencias +
 * 1 búsqueda del documento oficial SOLO si plan.documentId existe); cálculo
 * en memoria vía función pura. Sin consultas dentro de loops (sin N+1).
 */
@Injectable()
export class EmergencyPlanProvider implements ComplianceProvider {
  private static readonly MODULE = EMERGENCY_PLAN_MODULE;
  private static readonly COMPLIANCE_TARGET = 90;

  constructor(
    private readonly phvaAdvancedService: PhvaAdvancedService,
    // Lectura de SOLO validación del documento oficial referenciado por
    // plan.documentId (patrón emergency-management.provider: modelo inyectado
    // directamente; DocumentManagement NO se modifica).
    @InjectModel(DocumentMaster.name)
    private readonly documentMasterModel: Model<DocumentMasterDocument>,
  ) {}

  async getCompliance(companyId: string): Promise<ProviderComplianceResult> {
    const companyObjectId = new Types.ObjectId(companyId);
    const now = new Date();

    // Registro legacy-aware (5.1.1 / 1.1.10), lectura estricta: si no existe
    // registro → NO_DATA (NO se crea por efecto de scorear).
    let record: SstEmergenciesDocument | null = null;
    try {
      record = await this.phvaAdvancedService.findEmergenciesByCompany(companyObjectId);
    } catch {
      record = null;
    }

    // Documento oficial: se consulta SOLO si el plan referencia documentId.
    const documentId = record?.plan?.documentId;
    let planDocument: DocumentMasterDocument | null = null;
    if (documentId) {
      try {
        planDocument = await this.documentMasterModel.findById(documentId).exec();
      } catch {
        planDocument = null; // id malformado/inexistente → condición documental falla
      }
    }

    const breakdown = computeEmergencyPlanScore(
      {
        record: (record as unknown) ?? null,
        planDocument: (planDocument as unknown) ?? null,
        companyId,
      },
      now,
    );

    const toPriority = (priority: 'HIGH' | 'MEDIUM' | 'LOW'): FindingPriority =>
      priority === 'HIGH' ? FindingPriority.HIGH : priority === 'MEDIUM' ? FindingPriority.MEDIUM : FindingPriority.LOW;

    const findings: ProviderComplianceResult['findings'] = breakdown.findings.map((f) => ({
      id: f.id,
      module: EmergencyPlanProvider.MODULE,
      title: f.title,
      description: f.description,
      priority: toPriority(f.priority),
      status: 'OPEN', responsible: '', dueDate: '', createdAt: now.toISOString(),
    }));

    const percentage = Math.round(breakdown.score);

    if (breakdown.noData) {
      return {
        module: EmergencyPlanProvider.MODULE,
        percentage: 0,
        status: 'NO_DATA',
        findings,
        pending: 0, completed: 0,
        phases: { do: 0 } as Partial<Record<CompliancePhaseKey, number>>,
        metadata: this.metadata(breakdown, { noData: true, emptyRecord: breakdown.emptyRecord }),
      };
    }

    return {
      module: EmergencyPlanProvider.MODULE,
      percentage,
      status: percentage >= EmergencyPlanProvider.COMPLIANCE_TARGET ? 'TARGET_MET' : 'TARGET_NOT_MET',
      findings,
      // pending/completed con semántica de brechas del dominio: pending = nº de
      // hallazgos abiertos; completed = porcentaje alcanzado (explicables con metadata).
      pending: findings.length,
      completed: percentage,
      phases: { do: percentage } as Partial<Record<CompliancePhaseKey, number>>,
      metadata: this.metadata(breakdown),
    };
  }

  /** Metadata serializable (sin documentos Mongo completos ni funciones). */
  private metadata(
    breakdown: ReturnType<typeof computeEmergencyPlanScore>,
    extra: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      semantic: 'EXACT',
      standardCode: EMERGENCY_PLAN_STANDARD_CODE,
      phase: 'do',
      formula: EMERGENCY_PLAN_FORMULA,
      weights: { ...EMERGENCY_PLAN_SCORE_WEIGHTS },
      dimensions: {
        plan: { ...breakdown.dimensions.plan },
        threats: { ...breakdown.dimensions.threats },
        resources: { ...breakdown.dimensions.resources },
        evacuation: { ...breakdown.dimensions.evacuation },
        contacts: { ...breakdown.dimensions.contacts },
        drills: { ...breakdown.dimensions.drills },
        socialization: { ...breakdown.dimensions.socialization },
      },
      counters: { ...breakdown.counters },
      details: {
        plan: { ...breakdown.details.plan },
        threats: { ...breakdown.details.threats },
        evacuation: { ...breakdown.details.evacuation },
        drills: { ...breakdown.details.drills },
        socialization: { ...breakdown.details.socialization },
      },
      ...extra,
    };
  }
}
