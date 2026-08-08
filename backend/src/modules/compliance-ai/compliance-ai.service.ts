import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AIContext } from '../ai/interfaces/ai-context.interface';
import { AIEngine, AIEngineResult } from '../ai/interfaces/ai-engine.interface';
import { ComplianceEngineService } from '../compliance-engine/compliance-engine.service';
import { FindingPriority } from '../compliance-engine/enums/finding-priority.enum';
import { DocumentMasterService } from '../document-management/services/document-master.service';
import { EvaluationsService } from '../../evaluations/evaluations.service';
import { EvaluationStatus } from '../../evaluations/schemas/evaluation.schema';
import { Company, CompanyDocument } from '../companies/schemas/company.schema';
import {
  FindingSeverity,
  InitialEvaluation,
  InitialEvaluationDocument,
  StandardEvaluationStatus,
} from '../initial-evaluation/schemas/initial-evaluation.schema';
import { ComplianceAnalysisResult } from './interfaces/compliance-analysis.interface';

/** Contexto interno con el análisis y datos agregados de documentos/evidencias. */
interface ComplianceContextData {
  analysis: ComplianceAnalysisResult;
  documentCount: number;
}

/**
 * Catálogo de marcos de estándares aplicables al SG-SST colombiano.
 * La estructura de análisis soporta 7, 21 y 60 estándares sin hardcodear
 * códigos: los conteos se derivan de los datos reales evaluados.
 */
const STANDARD_FRAMEWORKS: Record<string, string> = {
  '7': '7 estándares',
  '21': '21 estándares',
  '60': '60 estándares',
};

/**
 * Compliance AI Engine.
 *
 * Analiza el cumplimiento del SG-SST de una empresa consultando datos REALES:
 * - Company (standardsType → marco de estándares aplicables).
 * - EvaluationsService (autoevaluaciones existentes por código).
 * - Evaluación inicial (estándares evaluados y su estado).
 * - DocumentMasterService (documentos/evidencias registrados).
 * - ComplianceEngineService.getOverview (indicadores agregados: overall, hallazgos, recomendaciones).
 *
 * No inventa información: si no existen datos suficientes responde
 * "Información insuficiente para análisis de cumplimiento".
 */
@Injectable()
export class ComplianceAIEngine implements AIEngine {
  private readonly logger = new Logger(ComplianceAIEngine.name);

  constructor(
    @InjectModel(Company.name)
    private readonly companyModel: Model<CompanyDocument>,
    @InjectModel(InitialEvaluation.name)
    private readonly initialEvaluationModel: Model<InitialEvaluationDocument>,
    private readonly evaluationsService: EvaluationsService,
    private readonly complianceEngineService: ComplianceEngineService,
    private readonly documentMasterService: DocumentMasterService,
  ) {}

  getName(): string {
    return 'compliance';
  }

  /**
   * Ejecuta el engine para responder la consulta del usuario.
   */
  async execute(_question: string, context: AIContext): Promise<AIEngineResult> {
    if (!context.companyId) {
      return this.buildInsufficientResult();
    }

    let contextData: ComplianceContextData;
    try {
      contextData = await this.analyzeComplianceContext(context.companyId);
    } catch (error) {
      this.logger.debug(`Análisis de cumplimiento no disponible: ${this.errorMessage(error)}`);
      return this.buildInsufficientResult();
    }

    if (!this.hasEnoughData(contextData)) {
      return this.buildInsufficientResult();
    }

    return {
      action: 'compliance_analysis',
      confidence: this.computeConfidence(contextData),
      response: this.buildResponse(contextData),
      suggestions: this.buildSuggestions(contextData.analysis),
    };
  }

  /**
   * Analiza el cumplimiento SG-SST de una empresa con datos reales.
   *
   * @param companyId - Identificador de la empresa.
   */
  async analyzeCompliance(companyId: string): Promise<ComplianceAnalysisResult> {
    return (await this.analyzeComplianceContext(companyId)).analysis;
  }

  /**
   * Consulta en paralelo las fuentes reales y construye el análisis junto con
   * el conteo de documentos/evidencias registradas.
   */
  private async analyzeComplianceContext(companyId: string): Promise<ComplianceContextData> {
    const companyObjectId = this.toObjectId(companyId);

    const [company, evaluations, overview, documents, initialEvaluation] = await Promise.all([
      this.safeFindCompany(companyId),
      this.safeGetEvaluations(companyId),
      this.safeGetOverview(companyId),
      this.safeGetDocuments(companyObjectId),
      this.safeGetInitialEvaluation(companyObjectId),
    ]);

    const standards = initialEvaluation?.standards ?? [];
    const completedStandards = standards.filter(
      (standard) => standard.status === StandardEvaluationStatus.COMPLIES,
    ).length;
    const pendingStandards = standards.filter(
      (standard) => standard.status === StandardEvaluationStatus.DOES_NOT_COMPLY,
    ).length;

    const completedEvaluations = evaluations.filter(
      (evaluation) => evaluation.status === EvaluationStatus.CUMPLE,
    ).length;
    const pendingEvaluations = evaluations.filter(
      (evaluation) => evaluation.status === EvaluationStatus.NO_CUMPLE,
    ).length;

    // Cumplimiento global: reutiliza el cálculo ponderado del Compliance Engine
    // (fuente única de verdad) y respalda con la evaluación inicial si el overview no está.
    const overall = overview?.overallCompliance ?? initialEvaluation?.overallCompliance ?? 0;

    const standardLevel = this.resolveStandardLevel(company?.standardsType);

    const criticalFindings = [
      ...(overview?.findings ?? [])
        .filter(
          (finding) =>
            finding.priority === FindingPriority.HIGH || finding.priority === FindingPriority.CRITICAL,
        )
        .map((finding) => finding.title),
      ...(initialEvaluation?.findings ?? [])
        .filter(
          (finding) =>
            finding.severity === FindingSeverity.HIGH || finding.severity === FindingSeverity.CRITICAL,
        )
        .map((finding) => finding.title),
    ];

    const recommendations = [
      ...(overview?.recommendations ?? []).map((recommendation) => recommendation.title),
      ...(initialEvaluation?.gaps ?? []).map((gap) => gap.recommendedAction),
    ];

    return {
      analysis: {
        overall,
        standardLevel,
        completed: completedStandards + completedEvaluations,
        pending: pendingStandards + pendingEvaluations,
        criticalFindings: this.unique(criticalFindings),
        recommendations: this.unique(recommendations),
      },
      documentCount: documents.length,
    };
  }

  // -------------------------------------------------------------------------
  // Helpers privados (lecturas tolerantes)
  // -------------------------------------------------------------------------

  private toObjectId(companyId: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(companyId)) {
      throw new Error(`Invalid companyId: ${companyId}`);
    }
    return new Types.ObjectId(companyId);
  }

  private async safeFindCompany(companyId: string): Promise<CompanyDocument | null> {
    try {
      return await this.companyModel.findById(companyId).exec();
    } catch (error) {
      this.logger.debug(`Empresa no disponible: ${this.errorMessage(error)}`);
      return null;
    }
  }

  private async safeGetEvaluations(companyId: string) {
    try {
      return await this.evaluationsService.findAllByCompany(companyId);
    } catch (error) {
      this.logger.debug(`Autoevaluaciones no disponibles: ${this.errorMessage(error)}`);
      return [];
    }
  }

  private async safeGetOverview(companyId: string) {
    try {
      return await this.complianceEngineService.getOverview(companyId);
    } catch (error) {
      this.logger.debug(`Overview no disponible: ${this.errorMessage(error)}`);
      return null;
    }
  }

  private async safeGetDocuments(companyObjectId: Types.ObjectId) {
    try {
      return await this.documentMasterService.findAll(companyObjectId);
    } catch (error) {
      this.logger.debug(`Documentos no disponibles: ${this.errorMessage(error)}`);
      return [];
    }
  }

  /** Lectura directa de la evaluación inicial (sin findOrCreate: análisis no debe crear datos). */
  private async safeGetInitialEvaluation(companyObjectId: Types.ObjectId) {
    try {
      return await this.initialEvaluationModel
        .findOne({ companyId: companyObjectId, archived: false })
        .lean()
        .exec();
    } catch (error) {
      this.logger.debug(`Evaluación inicial no disponible: ${this.errorMessage(error)}`);
      return null;
    }
  }

  private resolveStandardLevel(standardsType?: string): string {
    if (!standardsType) {
      return 'Sin catálogo de estándares';
    }
    // Solo los marcos conocidos (7/21/60) sustentan un nivel; valores desconocidos
    // caen a un default seguro sin afirmar un catálogo incorrecto.
    return STANDARD_FRAMEWORKS[standardsType] ?? 'Sin catálogo de estándares';
  }

  private hasEnoughData(contextData: ComplianceContextData): boolean {
    const { analysis } = contextData;
    // Los documentos/evidencias por sí solos no sustentan un porcentaje de
    // cumplimiento: se exige al menos una fuente real de evaluación.
    return (
      analysis.overall > 0 ||
      analysis.completed > 0 ||
      analysis.pending > 0 ||
      analysis.criticalFindings.length > 0 ||
      analysis.recommendations.length > 0
    );
  }

  private buildResponse(contextData: ComplianceContextData): string {
    const { analysis, documentCount } = contextData;
    const findingsSummary =
      analysis.criticalFindings.length > 0
        ? `Se detectaron ${analysis.criticalFindings.length} hallazgos de alta prioridad.`
        : 'No se detectaron hallazgos de alta prioridad.';
    const documentsSummary =
      documentCount > 0 ? ` Se registraron ${documentCount} documentos/evidencias.` : '';
    const recommendationsSummary =
      analysis.recommendations.length > 0
        ? ` Se generaron ${analysis.recommendations.length} recomendaciones de mejora.`
        : '';
    const complianceSummary =
      analysis.overall > 0
        ? `El cumplimiento SG-SST es del ${analysis.overall}% (${analysis.standardLevel}).`
        : `Aún no hay un porcentaje de cumplimiento calculado (${analysis.standardLevel}).`;
    return (
      `${complianceSummary} ` +
      `Hay ${analysis.completed} ítems cumplidos y ${analysis.pending} pendientes. ` +
      `${findingsSummary}${documentsSummary}${recommendationsSummary}`
    );
  }

  private buildSuggestions(analysis: ComplianceAnalysisResult): string[] {
    const suggestions: string[] = ['¿Cómo va el cumplimiento por fase PHVA?'];
    if (analysis.criticalFindings.length > 0) {
      suggestions.push(`¿Cuáles son los ${analysis.criticalFindings.length} hallazgos de alta prioridad?`);
    }
    if (analysis.pending > 0) {
      suggestions.push(`¿Qué estándares o ítems están pendientes por cumplir?`);
    }
    if (analysis.recommendations.length > 0) {
      suggestions.push('Muéstrame las recomendaciones de mejora');
    }
    return suggestions.slice(0, 4);
  }

  private computeConfidence(contextData: ComplianceContextData): number {
    const { analysis, documentCount } = contextData;
    // Los documentos/evidencias son una señal de apoyo, no una fuente
    // independiente: solo aumentan la confianza cuando ya existe data real de
    // evaluación (hasEnoughData los excluye como criterio de suficiencia).
    const sources = [
      analysis.overall > 0,
      analysis.completed > 0 || analysis.pending > 0,
      analysis.criticalFindings.length > 0,
      analysis.recommendations.length > 0,
      documentCount > 0,
    ].filter(Boolean).length;
    return Math.min(0.9, 0.5 + sources * 0.1);
  }

  private unique(items: string[]): string[] {
    return Array.from(new Set(items.filter((item) => item.trim().length > 0)));
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'error desconocido';
  }

  private buildInsufficientResult(): AIEngineResult {
    return {
      action: 'compliance_analysis',
      confidence: 0.2,
      response: 'Información insuficiente para análisis de cumplimiento',
      suggestions: [
        '¿Cómo va el cumplimiento SG-SST?',
        '¿Qué estándares aplican a mi empresa?',
        '¿Cuáles son los hallazgos de alta prioridad?',
      ],
    };
  }
}
