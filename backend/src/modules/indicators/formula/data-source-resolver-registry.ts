import { Inject, Injectable, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  DataSourceModule,
  DataSourceResult,
} from './formula-types';

// Schema names for @InjectModel
const INCIDENT_MODEL = 'Incident';
const TRAINING_MODEL = 'Training';
const INSPECTION_MODEL = 'InspectionActivity';
const RISK_MODEL = 'Risk';
const DOCUMENT_MODEL = 'Document';
const WORK_DATA_MODEL = 'CompanyPeriodWorkData';
const ABSENTEEISM_MODEL = 'Absenteeism';

/**
 * DataSourceResolverRegistry — Catálogo inyectable de resolvedores de datos reales.
 *
 * Cada resolvedor:
 * 1. Consulta el modelo Mongoose correspondiente
 * 2. Filtra por companyId (tenant isolation)
 * 3. Filtra por período cuando es posible
 * 4. Retorna DataSourceResult { value, available }
 * 5. Nunca lanza excepciones
 *
 * Un resolvedor retorna available: false cuando:
 * - No existen datos para el período
 * - El modelo fuente no está configurado
 * - La consulta falla
 *
 * Un resolvedor retorna available: true con value: 0 cuando:
 * - Existen datos reales pero el resultado es 0
 *   (ej: 0 incidentes reales)
 */
@Injectable()
export class DataSourceResolverRegistry {
  constructor(
    @InjectModel(INCIDENT_MODEL) private readonly incidentModel: Model<any>,
    @InjectModel(TRAINING_MODEL) private readonly trainingModel: Model<any>,
    @InjectModel(INSPECTION_MODEL) private readonly inspectionModel: Model<any>,
    @InjectModel(RISK_MODEL) private readonly riskModel: Model<any>,
    @InjectModel(DOCUMENT_MODEL) private readonly documentModel: Model<any>,
    @Optional()
    @InjectModel(WORK_DATA_MODEL) private readonly workDataModel?: Model<any>,
    @Optional()
    @InjectModel(ABSENTEEISM_MODEL) private readonly absenteeismModel?: Model<any>,
  ) {}

  // ─── Resolution ────────────────────────────────────────────────────────

  /**
   * Resuelve un campo de datos para un módulo dado.
   * Retorna { value, available } — nunca lanza excepciones.
   */
  async resolve(
    module: DataSourceModule,
    field: string,
    companyId: Types.ObjectId,
    periodStart?: Date,
    periodEnd?: Date,
  ): Promise<DataSourceResult> {
    try {
      switch (module) {
        case 'incidents':
          return this.resolveIncidents(field, companyId, periodStart, periodEnd);
        case 'trainings':
          return this.resolveTrainings(field, companyId, periodStart, periodEnd);
        case 'inspections':
          return this.resolveInspections(field, companyId, periodStart, periodEnd);
        case 'risks':
          return this.resolveRisks(field, companyId, periodStart, periodEnd);
        case 'documents':
          return this.resolveDocuments(field, companyId, periodStart, periodEnd);
        case 'work-data':
          return this.resolveWorkData(field, companyId, periodStart, periodEnd);
        case 'absenteeism':
          return this.resolveAbsenteeism(field, companyId, periodStart, periodEnd);
        case 'evaluations':
          return this.resolveEvaluations(field, companyId, periodStart, periodEnd);
        case 'annual-work-plan':
          return this.resolveAnnualWorkPlan(field, companyId, periodStart, periodEnd);
        case 'copasst-training':
          return this.resolveCopasstTraining(field, companyId, periodStart, periodEnd);
        case 'legal-matrix':
          return this.resolveLegalMatrix(field, companyId, periodStart, periodEnd);
        // ─── UNSUPPORTED ─────────────────────────────────────────────────
        // These modules lack sufficient data for automatic calculation
        case 'sst-objectives':
        case 'emergencies':
        case 'convivencia':
          return { value: 0, available: false };
        default:
          return { value: 0, available: false };
      }
    } catch {
      return { value: 0, available: false };
    }
  }

  // ─── INCIDENTS ─────────────────────────────────────────────────────────
  // Fields: count, closedCount, openCount
  // Schema: companyId, date, type, severity, status
  // Period filter: date field

  private async resolveIncidents(
    field: string,
    companyId: Types.ObjectId,
    periodStart?: Date,
    periodEnd?: Date,
  ): Promise<DataSourceResult> {
    const query: Record<string, unknown> = { companyId };
    if (periodStart || periodEnd) {
      query.date = {};
      if (periodStart) (query.date as Record<string, Date>).$gte = periodStart;
      if (periodEnd) (query.date as Record<string, Date>).$lte = periodEnd;
    }

    const docs = await this.incidentModel.find(query).lean().exec();

    switch (field) {
      case 'count':
        return { value: docs.length, available: true };
      case 'closedCount': {
        const closed = docs.filter((d: any) =>
          ['CERRADO', 'CLOSED', 'RESUELTO', 'RESOLVED'].includes((d.status || '').toUpperCase()),
        ).length;
        return { value: closed, available: true };
      }
      case 'openCount': {
        const open = docs.filter((d: any) =>
          !['CERRADO', 'CLOSED', 'RESUELTO', 'RESOLVED'].includes((d.status || '').toUpperCase()),
        ).length;
        return { value: open, available: true };
      }
      case 'accidentCount': {
        // Count only incidents classified as AT or ATEL (accidents with injury)
        // If accidentType is not set, count as generic incident (not accident)
        const accidents = docs.filter((d: any) => {
          const at = (d.accidentType || '').toUpperCase();
          return at === 'AT' || at === 'ATEL';
        }).length;
        return { value: accidents, available: true };
      }
      case 'daysLost': {
        // Sum of daysLost for all incidents in the period
        // Only count incidents that have accidentType set (AT or ATEL)
        const totalDaysLost = docs
          .filter((d: any) => {
            const at = (d.accidentType || '').toUpperCase();
            return at === 'AT' || at === 'ATEL';
          })
          .reduce((sum: number, d: any) => sum + (d.daysLost ?? 0), 0);
        return { value: totalDaysLost, available: true };
      }
      default:
        return { value: 0, available: false };
    }
  }

  // ─── TRAININGS ─────────────────────────────────────────────────────────
  // Fields: count, avgCompletion
  // Schema: companyId, date, indicators.completionPercentage
  // Period filter: date field

  private async resolveTrainings(
    field: string,
    companyId: Types.ObjectId,
    periodStart?: Date,
    periodEnd?: Date,
  ): Promise<DataSourceResult> {
    const query: Record<string, unknown> = { companyId };
    if (periodStart || periodEnd) {
      query.date = {};
      if (periodStart) (query.date as Record<string, Date>).$gte = periodStart;
      if (periodEnd) (query.date as Record<string, Date>).$lte = periodEnd;
    }

    const docs = await this.trainingModel.find(query).lean().exec();

    if (docs.length === 0) {
      return { value: 0, available: false };
    }

    switch (field) {
      case 'count':
        return { value: docs.length, available: true };
      case 'avgCompletion': {
        const completions = docs.map(
          (d: any) => d.indicators?.completionPercentage ?? 0,
        );
        const avg = completions.reduce((a: number, b: number) => a + b, 0) / completions.length;
        return { value: Math.round(avg * 100) / 100, available: true };
      }
      case 'effectivenessPercentage': {
        const values = docs.map(
          (d: any) => d.indicators?.effectivenessPercentage ?? 0,
        );
        const avg = values.reduce((a: number, b: number) => a + b, 0) / values.length;
        return { value: Math.round(avg * 100) / 100, available: true };
      }
      case 'participationPercentage': {
        const values = docs.map(
          (d: any) => d.indicators?.participationPercentage ?? 0,
        );
        const avg = values.reduce((a: number, b: number) => a + b, 0) / values.length;
        return { value: Math.round(avg * 100) / 100, available: true };
      }
      default:
        return { value: 0, available: false };
    }
  }

  // ─── INSPECTIONS ───────────────────────────────────────────────────────
  // Fields: count, completedCount, completionRate
  // Schema: companyId, plannedDate, status ('pendiente', 'completada', etc.)
  // Period filter: plannedDate

  private async resolveInspections(
    field: string,
    companyId: Types.ObjectId,
    periodStart?: Date,
    periodEnd?: Date,
  ): Promise<DataSourceResult> {
    const query: Record<string, unknown> = { companyId };
    if (periodStart || periodEnd) {
      query.plannedDate = {};
      if (periodStart) (query.plannedDate as Record<string, Date>).$gte = periodStart;
      if (periodEnd) (query.plannedDate as Record<string, Date>).$lte = periodEnd;
    }

    const docs = await this.inspectionModel.find(query).lean().exec();

    if (docs.length === 0) {
      return { value: 0, available: false };
    }

    const completedStatuses = [
      'COMPLETADA', 'COMPLETED', 'FINALIZADA', 'FINALIZED',
      'COMPLETA', 'COMPLETE', 'CERRADA', 'CLOSED',
      'APROBADA', 'APPROVED',
    ];

    switch (field) {
      case 'count':
        return { value: docs.length, available: true };
      case 'completedCount': {
        const completed = docs.filter((d: any) =>
          completedStatuses.includes((d.status || '').toUpperCase()),
        ).length;
        return { value: completed, available: true };
      }
      case 'completionRate': {
        const completed = docs.filter((d: any) =>
          completedStatuses.includes((d.status || '').toUpperCase()),
        ).length;
        const rate = (completed / docs.length) * 100;
        return { value: Math.round(rate * 100) / 100, available: true };
      }
      default:
        return { value: 0, available: false };
    }
  }

  // ─── RISKS ─────────────────────────────────────────────────────────────
  // Fields: count, controlledCount, controlledPercentage
  // Schema: companyId, probability, consequence, riskLevel (= probability * consequence)
  // Controlled: riskLevel <= 6 (low-medium risk range)
  // No temporal filter (risks are cumulative state)

  private async resolveRisks(
    field: string,
    companyId: Types.ObjectId,
    _periodStart?: Date,
    _periodEnd?: Date,
  ): Promise<DataSourceResult> {
    const docs = await this.riskModel.find({ companyId }).lean().exec();

    if (docs.length === 0) {
      return { value: 0, available: false };
    }

    // A risk is considered "controlled" when riskLevel <= 6 (low-medium)
    // riskLevel = probability × consequence (both 1-5 scale typically)
    const controlledThreshold = 6;

    switch (field) {
      case 'count':
        return { value: docs.length, available: true };
      case 'controlledCount': {
        const controlled = docs.filter(
          (d: any) => d.riskLevel <= controlledThreshold,
        ).length;
        return { value: controlled, available: true };
      }
      case 'controlledPercentage': {
        const controlled = docs.filter(
          (d: any) => d.riskLevel <= controlledThreshold,
        ).length;
        const pct = (controlled / docs.length) * 100;
        return { value: Math.round(pct * 100) / 100, available: true };
      }
      default:
        return { value: 0, available: false };
    }
  }

  // ─── EVALUATIONS ───────────────────────────────────────────────────────
  // Fields: count, compliantCount, compliancePercentage
  // NOTE: This module is accessed through EvaluationsService.findAllByCompany()
  // The evaluations are managed by the compliance engine's EvaluationsProvider.
  // For indicator purposes, evaluations are normative compliance data,
  // not performance indicators.

  private async resolveEvaluations(
    _field: string,
    _companyId: Types.ObjectId,
    _periodStart?: Date,
    _periodEnd?: Date,
  ): Promise<DataSourceResult> {
    return { value: 0, available: false };
  }

  // ─── ANNUAL WORK PLAN ──────────────────────────────────────────────────
  // Fields: overallPercentage
  // The AWP compliance is calculated by PlanComplianceService.
  // Direct model access would require injecting AnnualWorkPlan models.

  private async resolveAnnualWorkPlan(
    _field: string,
    _companyId: Types.ObjectId,
    _periodStart?: Date,
    _periodEnd?: Date,
  ): Promise<DataSourceResult> {
    return { value: 0, available: false };
  }

  // ─── COPASST TRAINING ──────────────────────────────────────────────────
  // Fields: coveragePercentage
  // The service has calculateCoverage(), but requires CopasstService.

  private async resolveCopasstTraining(
    _field: string,
    _companyId: Types.ObjectId,
    _periodStart?: Date,
    _periodEnd?: Date,
  ): Promise<DataSourceResult> {
    return { value: 0, available: false };
  }

  // ─── LEGAL MATRIX ──────────────────────────────────────────────────────
  // Fields: compliancePercentage
  // The service has evaluateAutoCompliance().

  private async resolveLegalMatrix(
    _field: string,
    _companyId: Types.ObjectId,
    _periodStart?: Date,
    _periodEnd?: Date,
  ): Promise<DataSourceResult> {
    return { value: 0, available: false };
  }

  // ─── ABSENTEEISM ─────────────────────────────────────────────────────
  // Fields: daysAbsent, count
  // Schema: companyId, fechaInicio, fechaFin, dias
  // Period filter: date intersection (fechaInicio <= periodEnd AND fechaFin >= periodStart)

  private async resolveAbsenteeism(
    field: string,
    companyId: Types.ObjectId,
    periodStart?: Date,
    periodEnd?: Date,
  ): Promise<DataSourceResult> {
    if (!this.absenteeismModel) {
      return { value: 0, available: false };
    }

    // Date intersection query:
    // A record intersects the period if:
    //   fechaInicio <= periodEnd AND fechaFin >= periodStart
    const query: Record<string, unknown> = { companyId };
    if (periodStart || periodEnd) {
      query.fechaInicio = {};
      if (periodEnd) (query.fechaInicio as Record<string, Date>).$lte = periodEnd;
      query.fechaFin = {};
      if (periodStart) (query.fechaFin as Record<string, Date>).$gte = periodStart;
    }

    const docs = await this.absenteeismModel.find(query).lean().exec();

    if (docs.length === 0) {
      return { value: 0, available: false };
    }

    switch (field) {
      case 'daysAbsent': {
        const totalDays = docs.reduce((sum: number, d: any) => sum + (d.dias ?? 0), 0);
        return { value: totalDays, available: true };
      }
      case 'count':
        return { value: docs.length, available: true };
      default:
        return { value: 0, available: false };
    }
  }

  // ─── WORK DATA ────────────────────────────────────────────────────────
  // Fields: hoursWorked
  // Schema: companyId, period, hoursWorked
  // Period filter: period string match

  private async resolveWorkData(
    field: string,
    companyId: Types.ObjectId,
    _periodStart?: Date,
    _periodEnd?: Date,
  ): Promise<DataSourceResult> {
    if (!this.workDataModel) {
      return { value: 0, available: false };
    }

    // Extract period string from periodStart/periodEnd
    // For monthly: period = '2026-08'
    // For quarterly: period = '2026-Q3'
    // We need to match against the work-data period field
    const period = _periodStart
      ? `${_periodStart.getFullYear()}-${String(_periodStart.getMonth() + 1).padStart(2, '0')}`
      : undefined;

    if (!period) {
      return { value: 0, available: false };
    }

    const doc = await this.workDataModel
      .findOne({ companyId, period })
      .lean()
      .exec() as Record<string, unknown> | null;

    if (!doc) {
      return { value: 0, available: false };
    }

    switch (field) {
      case 'hoursWorked':
        return { value: (doc.hoursWorked as number) ?? 0, available: true };
      default:
        return { value: 0, available: false };
    }
  }

  // ─── DOCUMENTS ─────────────────────────────────────────────────────────
  // Fields: count, validCount, expiredCount, expiringSoonCount
  // Schema: companyId, name, type, fileUrl, uploadedBy, expirationDate?, documentStatus?
  // Validity semantics:
  //   - Documents WITH expirationDate: valid if expirationDate >= reference date
  //   - Documents WITHOUT expirationDate: excluded from validity counts
  //     (not counted as expired or valid)
  // Reference date: periodEnd if provided, else new Date()
  // expiringSoonCount: documents expiring within 30 days of reference date

  private async resolveDocuments(
    field: string,
    companyId: Types.ObjectId,
    _periodStart?: Date,
    _periodEnd?: Date,
  ): Promise<DataSourceResult> {
    const docs = await this.documentModel.find({ companyId }).lean().exec();

    if (docs.length === 0) {
      return { value: 0, available: false };
    }

    const referenceDate = _periodEnd ?? new Date();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    switch (field) {
      case 'count':
        return { value: docs.length, available: true };
      case 'validCount': {
        // Documents with expirationDate >= referenceDate
        const valid = docs.filter((d: any) => {
          if (!d.expirationDate) return false; // exclude docs without expiration
          return new Date(d.expirationDate) >= referenceDate;
        }).length;
        return { value: valid, available: true };
      }
      case 'expiredCount': {
        // Documents with expirationDate < referenceDate
        const expired = docs.filter((d: any) => {
          if (!d.expirationDate) return false; // exclude docs without expiration
          return new Date(d.expirationDate) < referenceDate;
        }).length;
        return { value: expired, available: true };
      }
      case 'expiringSoonCount': {
        // Documents expiring within 30 days of reference date
        const upperBound = new Date(referenceDate.getTime() + thirtyDaysMs);
        const expiringSoon = docs.filter((d: any) => {
          if (!d.expirationDate) return false;
          const exp = new Date(d.expirationDate);
          return exp >= referenceDate && exp <= upperBound;
        }).length;
        return { value: expiringSoon, available: true };
      }
      // Legacy fields for backward compatibility
      case 'activeCount':
        return { value: docs.length, available: true };
      case 'activePercentage':
        return { value: 100, available: true };
      default:
        return { value: 0, available: false };
    }
  }
}
