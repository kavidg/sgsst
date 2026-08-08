import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ComplianceEngineService } from '../compliance-engine/compliance-engine.service';
import { FindingPriority } from '../compliance-engine/enums/finding-priority.enum';
import { ComplianceSnapshotDto } from './dto/compliance-snapshot.dto';
import { MonthlyTrendPointDto } from './dto/monthly-trend.dto';
import { SnapshotComparisonDto } from './dto/snapshot-comparison.dto';
import {
  ComplianceSnapshotData,
  MonthlyTrendDirection,
} from './interfaces/compliance-timeline.interface';
import {
  ComplianceTimeline,
  ComplianceTimelineDocument,
} from './schemas/compliance-timeline.schema';
import { compareSnapshots as compareSnapshotsUtil } from './utils/snapshot-comparator';
import { percentageVariation } from './utils/variation';

/**
 * Servicio del Compliance Timeline.
 *
 * Almacena la evolución histórica del cumplimiento SG-SST. NUNCA calcula
 * indicadores: toda la información proviene de ComplianceEngineService.getOverview().
 */
@Injectable()
export class ComplianceTimelineService {
  constructor(
    private readonly complianceEngineService: ComplianceEngineService,
    @InjectModel(ComplianceTimeline.name)
    private readonly timelineModel: Model<ComplianceTimeline>,
  ) {}

  /**
   * Crea (o actualiza) el snapshot del día para una empresa.
   *
   * Consulta el ComplianceEngine una única vez y persiste un snapshot completo.
   * Si ya existe un snapshot para la misma empresa el mismo día, lo actualiza
   * en lugar de insertar uno nuevo.
   */
  async createSnapshot(companyId: string): Promise<ComplianceSnapshotDto> {
    const overview = await this.complianceEngineService.getOverview(companyId);
    const snapshotDate = this.toStartOfUtcDay(new Date());

    const data: ComplianceSnapshotData = {
      snapshotDate,
      overallCompliance: overview.overallCompliance,
      phaseCompliance: { ...overview.phaseCompliance },
      moduleCompliance: overview.moduleCompliance.map((m) => ({
        module: m.module,
        compliance: m.compliance,
        level: m.level,
        lastUpdated: m.lastUpdated,
      })),
      findingsCount: overview.findings.length,
      criticalFindings: overview.findings.filter(
        (f) => f.priority === FindingPriority.CRITICAL,
      ).length,
      // El overview actual no expone conteos de actividades pendientes/completadas.
      // Se persisten en 0 hasta que el engine las exponga en su respuesta.
      pendingActivities: 0,
      completedActivities: 0,
      activeAlerts: overview.alerts.length,
      generatedAutomatically: true,
    };

    const document = await this.timelineModel
      .findOneAndUpdate(
        { companyId: new Types.ObjectId(companyId), snapshotDate: data.snapshotDate },
        { $set: data },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec();

    return this.toDto(document);
  }

  /**
   * Devuelve todos los snapshots de una empresa ordenados cronológicamente.
   */
  async getTimeline(companyId: string): Promise<ComplianceSnapshotDto[]> {
    const documents = await this.timelineModel
      .find({ companyId: new Types.ObjectId(companyId) })
      .sort({ snapshotDate: 1 })
      .exec();

    return documents.map((doc) => this.toDto(doc));
  }

  /**
   * Devuelve el snapshot más reciente de una empresa (o null si no existe ninguno).
   */
  async getLatest(companyId: string): Promise<ComplianceSnapshotDto | null> {
    const document = await this.timelineModel
      .findOne({ companyId: new Types.ObjectId(companyId) })
      .sort({ snapshotDate: -1 })
      .exec();

    return document ? this.toDto(document) : null;
  }

  /**
   * Construye la tendencia mensual tomando el último snapshot de cada mes.
   *
   * - `variation`: porcentaje de cambio respecto al mes anterior (null si no
   *   hay mes previo o si no es calculable).
   * - `trend`: UP / DOWN / STABLE según la variación.
   */
  async getMonthlyTrend(companyId: string): Promise<MonthlyTrendPointDto[]> {
    const documents = await this.timelineModel
      .find({ companyId: new Types.ObjectId(companyId) })
      .sort({ snapshotDate: 1 })
      .exec();

    // Los documentos vienen ascendentes: el último de cada mes reemplaza a los anteriores.
    const lastSnapshotByMonth = new Map<string, ComplianceTimelineDocument>();
    for (const doc of documents) {
      lastSnapshotByMonth.set(this.monthKey(doc.snapshotDate), doc);
    }

    const months = Array.from(lastSnapshotByMonth.entries()).map(([month, doc]) => ({
      month,
      compliance: doc.overallCompliance,
    }));

    return months.map((entry, index): MonthlyTrendPointDto => {
      const previous = index > 0 ? months[index - 1].compliance : null;
      return {
        month: entry.month,
        overallCompliance: entry.compliance,
        variation: percentageVariation(previous ?? 0, entry.compliance),
        trend: this.computeTrend(previous, entry.compliance),
      };
    });
  }

  /**
   * Compara dos snapshots y devuelve únicamente las diferencias.
   */
  compareSnapshots(
    snapshotA: ComplianceSnapshotData,
    snapshotB: ComplianceSnapshotData,
  ): SnapshotComparisonDto {
    return compareSnapshotsUtil(snapshotA, snapshotB);
  }

  // -------------------------------------------------------------------------
  // Helpers privados
  // -------------------------------------------------------------------------

  private toDto(document: ComplianceTimelineDocument): ComplianceSnapshotDto {
    return {
      id: document._id.toString(),
      companyId: document.companyId.toString(),
      snapshotDate: document.snapshotDate.toISOString(),
      overallCompliance: document.overallCompliance,
      phaseCompliance: {
        plan: document.phaseCompliance.plan,
        do: document.phaseCompliance.do,
        check: document.phaseCompliance.check,
        act: document.phaseCompliance.act,
      },
      moduleCompliance: document.moduleCompliance.map((m) => ({
        module: m.module,
        compliance: m.compliance,
        level: m.level,
        lastUpdated: m.lastUpdated.toISOString(),
      })),
      findingsCount: document.findingsCount,
      criticalFindings: document.criticalFindings,
      pendingActivities: document.pendingActivities,
      completedActivities: document.completedActivities,
      activeAlerts: document.activeAlerts,
      generatedAutomatically: document.generatedAutomatically,
      timelineInsights: null,
      trendPrediction: null,
      riskPrediction: null,
      createdAt: document.createdAt.toISOString(),
      updatedAt: document.updatedAt.toISOString(),
    };
  }

  private toStartOfUtcDay(date: Date): Date {
    const normalized = new Date(date);
    normalized.setUTCHours(0, 0, 0, 0);
    return normalized;
  }

  private monthKey(date: Date): string {
    return date.toISOString().slice(0, 7);
  }

  private computeTrend(previous: number | null, current: number): MonthlyTrendDirection {
    if (previous === null || previous === 0) {
      return current > 0 ? 'UP' : 'STABLE';
    }
    const variation = (current - previous) / previous;
    if (variation > 0.005) {
      return 'UP';
    }
    if (variation < -0.005) {
      return 'DOWN';
    }
    return 'STABLE';
  }
}
