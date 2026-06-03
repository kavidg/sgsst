import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { Model, Types } from 'mongoose';
import { AlertsService } from '../alerts/alerts.service';
import { AlertSeverity } from '../alerts/schemas/alert.schema';
import { Company, CompanyDocument } from '../companies/schemas/company.schema';
import { CopasstPeriod, CopasstPeriodDocument } from '../committee-engine/schemas/copasst.schema';
import { PhvaAdvancedResponsableSst, PhvaAdvancedResponsableSstDocument, ResponsableSstComplianceStatus } from '../phva-advanced/schemas/phva-advanced-responsable-sst.schema';
import { SstObjectives, SstObjectivesDocument } from '../phva-advanced/schemas/phva-advanced-sst-objective.schema';
import { SstPolicy, SstPolicyDocument, SstPolicyStatus } from '../phva-advanced/schemas/phva-advanced-sst-policy.schema';
import { TrainingManagement, TrainingManagementDocument } from '../phva-advanced/schemas/phva-advanced-training-management.schema';
import { UserDocument } from '../users/schemas/user.schema';
import { SignApprovalDto, SubmitApprovalDto, UpdateStandardDto, UpsertActionDto, UpsertFindingDto } from './dto/initial-evaluation.dto';
import { EvaluationActionPlan, EvaluationFinding, EvaluationGap, EvaluationStandard, FindingSeverity, InitialEvaluation, InitialEvaluationDocument, InitialEvaluationStatus, StandardEvaluationStatus, WorkStatus } from './schemas/initial-evaluation.schema';

const CATALOG: Array<Omit<EvaluationStandard, 'status' | 'observations' | 'evidence' | 'attachments' | 'autoEvaluated' | 'evaluatedAt' | 'evaluatedBy'>> = [
  { code: '1.1.1', chapter: '1. Recursos', title: 'Responsable del SG-SST', description: 'Asignación del responsable SST con perfil y soportes.', weight: 0.5, autoSource: 'Responsable SST' },
  { code: '1.1.2', chapter: '1. Recursos', title: 'Responsabilidades en SG-SST', description: 'Matriz de responsabilidades para todos los niveles.', weight: 0.5 },
  { code: '1.1.3', chapter: '1. Recursos', title: 'Asignación de recursos', description: 'Recursos financieros, técnicos y humanos.', weight: 0.5 },
  { code: '1.1.4', chapter: '1. Recursos', title: 'Afiliación a riesgos laborales', description: 'Cobertura en riesgos laborales del personal.', weight: 0.5 },
  { code: '1.1.5', chapter: '1. Recursos', title: 'Trabajadores alto riesgo', description: 'Identificación y control de tareas de alto riesgo.', weight: 0.5 },
  { code: '1.1.6', chapter: '1. Recursos', title: 'Conformación COPASST', description: 'COPASST vigente y operativo.', weight: 0.5, autoSource: 'COPASST' },
  { code: '1.1.8', chapter: '1. Recursos', title: 'Comité de convivencia', description: 'Comité de convivencia laboral conformado.', weight: 0.5 },
  { code: '1.2.1', chapter: '1. Capacitación', title: 'Programa de capacitación SST', description: 'Programa anual de capacitación, inducción y reinducción.', weight: 6, autoSource: 'Capacitaciones' },
  { code: '2.1.1', chapter: '2. Gestión integral', title: 'Política SST', description: 'Política SST vigente, aprobada y divulgada.', weight: 1, autoSource: 'Política SST' },
  { code: '2.2.1', chapter: '2. Gestión integral', title: 'Objetivos SST', description: 'Objetivos SST medibles y alineados con la política.', weight: 1, autoSource: 'Objetivos SST' },
];

@Injectable()
export class InitialEvaluationService {
  constructor(
    @InjectModel(InitialEvaluation.name) private readonly evaluationModel: Model<InitialEvaluationDocument>,
    @InjectModel(Company.name) private readonly companyModel: Model<CompanyDocument>,
    @InjectModel(PhvaAdvancedResponsableSst.name) private readonly responsableModel: Model<PhvaAdvancedResponsableSstDocument>,
    @InjectModel(SstPolicy.name) private readonly policyModel: Model<SstPolicyDocument>,
    @InjectModel(SstObjectives.name) private readonly objectivesModel: Model<SstObjectivesDocument>,
    @InjectModel(CopasstPeriod.name) private readonly copasstModel: Model<CopasstPeriodDocument>,
    @InjectModel(TrainingManagement.name) private readonly trainingManagementModel: Model<TrainingManagementDocument>,
    private readonly alertsService: AlertsService,
  ) {}

  async findOrCreate(companyId: Types.ObjectId) {
    let evaluation = await this.evaluationModel.findOne({ companyId, archived: false }).exec();
    if (!evaluation) {
      evaluation = await this.evaluationModel.create({
        companyId,
        standards: this.createDefaultStandards(),
        nextReassessmentAt: this.addMonths(new Date(), 12),
        history: [{ date: new Date(), entity: 'InitialEvaluation', field: 'created', newValue: 'Evaluación Inicial SG-SST generada automáticamente' }],
      });
    }
    return this.recalculate(evaluation);
  }

  async runAutoDiagnostic(companyId: Types.ObjectId, user?: UserDocument) {
    const evaluation = await this.findOrCreate(companyId);
    const [responsable, policy, objectives, copasst, training] = await Promise.all([
      this.responsableModel.findOne({ companyId, itemCode: '1.1.1' }).lean().exec(),
      this.policyModel.findOne({ companyId }).lean().exec(),
      this.objectivesModel.findOne({ companyId }).lean().exec(),
      this.copasstModel.findOne({ companyId, status: { $in: ['ACTIVO', 'PROXIMO_A_VENCER'] } }).lean().exec(),
      this.trainingManagementModel.findOne({ companyId, itemCode: '1.2.1' }).lean().exec(),
    ]);

    this.applyAutomaticStandard(evaluation, '1.1.1', responsable?.complianceStatus === ResponsableSstComplianceStatus.COMPLIES, 'Responsable SST vigente');
    this.applyAutomaticStandard(evaluation, '2.1.1', Boolean(policy?.versions?.some((version) => version.status === SstPolicyStatus.APPROVED) || policy?.status === SstPolicyStatus.APPROVED), 'Política SST aprobada');
    this.applyAutomaticStandard(evaluation, '2.2.1', Boolean(objectives?.objectives?.length), 'Objetivos SST registrados');
    this.applyAutomaticStandard(evaluation, '1.1.6', Boolean(copasst?.members?.length), 'COPASST vigente');
    this.applyAutomaticStandard(evaluation, '1.2.1', Boolean(training?.annualProgram?.length || training?.trainings?.length || training?.complianceStatus === 'COMPLIES'), 'Programa de capacitación detectado');

    evaluation.status = evaluation.status === InitialEvaluationStatus.DRAFT ? InitialEvaluationStatus.IN_PROGRESS : evaluation.status;
    this.pushHistory(evaluation, user, 'InitialEvaluation', 'autoDiagnostic', '', 'Auto-diagnóstico ejecutado');
    await this.recalculate(evaluation);
    await this.generateLifecycleAlerts(evaluation);
    return evaluation.save();
  }

  async updateStandard(companyId: Types.ObjectId, code: string, dto: UpdateStandardDto, user: UserDocument) {
    const evaluation = await this.findOrCreate(companyId);
    const standard = evaluation.standards.find((item) => item.code === code);
    if (!standard) throw new NotFoundException(`Standard ${code} not found`);
    const previous = JSON.stringify({ status: standard.status, observations: standard.observations });
    if (dto.status) standard.status = dto.status;
    if (dto.observations !== undefined) standard.observations = dto.observations;
    if (dto.evidence) standard.evidence = dto.evidence;
    if (dto.attachments) standard.attachments = dto.attachments;
    standard.autoEvaluated = false;
    standard.evaluatedAt = new Date();
    standard.evaluatedBy = user._id as Types.ObjectId;
    evaluation.status = InitialEvaluationStatus.IN_PROGRESS;
    this.pushHistory(evaluation, user, 'EvaluationStandard', code, previous, JSON.stringify(dto));
    await this.recalculate(evaluation);
    return evaluation.save();
  }

  async upsertFinding(companyId: Types.ObjectId, dto: UpsertFindingDto, user: UserDocument) {
    if (!dto.title?.trim()) throw new BadRequestException('Finding title is required');
    const evaluation = await this.findOrCreate(companyId);
    const existing = dto.id ? evaluation.findings.find((finding) => finding.id === dto.id) : undefined;
    const next: EvaluationFinding = {
      id: existing?.id ?? new Types.ObjectId().toString(),
      title: dto.title,
      description: dto.description ?? existing?.description ?? '',
      severity: dto.severity ?? existing?.severity ?? FindingSeverity.MEDIUM,
      responsible: dto.responsible ?? existing?.responsible ?? '',
      dueDate: dto.dueDate ? new Date(dto.dueDate) : existing?.dueDate,
      status: dto.status ?? existing?.status ?? WorkStatus.OPEN,
      createdAt: existing?.createdAt ?? new Date(),
      createdBy: existing?.createdBy ?? (user._id as Types.ObjectId),
    };
    if (existing) Object.assign(existing, next); else evaluation.findings.push(next);
    this.pushHistory(evaluation, user, 'EvaluationFinding', next.id, existing ? 'updated' : '', JSON.stringify(next));
    await this.recalculate(evaluation);
    await this.generateLifecycleAlerts(evaluation);
    return evaluation.save();
  }

  async upsertAction(companyId: Types.ObjectId, dto: UpsertActionDto, user: UserDocument) {
    if (!dto.title?.trim()) throw new BadRequestException('Action title is required');
    const evaluation = await this.findOrCreate(companyId);
    const existing = dto.id ? evaluation.actionPlan.find((action) => action.id === dto.id) : undefined;
    const progress = this.calculateActionProgress(dto, existing);
    const next: EvaluationActionPlan = {
      id: existing?.id ?? new Types.ObjectId().toString(),
      source: dto.source ?? existing?.source ?? 'Manual',
      title: dto.title,
      description: dto.description ?? existing?.description ?? '',
      responsible: dto.responsible ?? existing?.responsible ?? '',
      dueDate: dto.dueDate ? new Date(dto.dueDate) : existing?.dueDate,
      manualProgress: dto.manualProgress ?? existing?.manualProgress ?? 0,
      automaticProgress: dto.automaticProgress ?? existing?.automaticProgress ?? 0,
      activityProgress: dto.activityProgress ?? existing?.activityProgress ?? 0,
      progress,
      status: dto.status ?? (progress >= 100 ? WorkStatus.CLOSED : existing?.status ?? WorkStatus.OPEN),
      evidence: dto.evidence ?? existing?.evidence ?? [],
    };
    if (existing) Object.assign(existing, next); else evaluation.actionPlan.push(next);
    this.pushHistory(evaluation, user, 'EvaluationActionPlan', next.id, existing ? 'updated' : '', JSON.stringify(next));
    await this.recalculate(evaluation);
    await this.generateLifecycleAlerts(evaluation);
    return evaluation.save();
  }

  async generateActionPlan(companyId: Types.ObjectId, user: UserDocument) {
    const evaluation = await this.findOrCreate(companyId);
    const existingKeys = new Set(evaluation.actionPlan.map((action) => action.source));
    for (const standard of evaluation.standards.filter((item) => item.status === StandardEvaluationStatus.DOES_NOT_COMPLY)) {
      const source = `standard:${standard.code}`;
      if (!existingKeys.has(source)) evaluation.actionPlan.push(this.actionFromStandard(standard));
    }
    for (const finding of evaluation.findings.filter((item) => item.status !== WorkStatus.CLOSED)) {
      const source = `finding:${finding.id}`;
      if (!existingKeys.has(source)) evaluation.actionPlan.push({ id: new Types.ObjectId().toString(), source, title: `Cerrar hallazgo: ${finding.title}`, description: finding.description, responsible: finding.responsible, dueDate: finding.dueDate, manualProgress: 0, automaticProgress: 0, activityProgress: 0, progress: 0, status: WorkStatus.OPEN, evidence: [] });
    }
    this.pushHistory(evaluation, user, 'EvaluationActionPlan', 'generated', '', `${evaluation.actionPlan.length}`);
    await this.recalculate(evaluation);
    await this.generateLifecycleAlerts(evaluation);
    return evaluation.save();
  }

  async submitForApproval(companyId: Types.ObjectId, dto: SubmitApprovalDto, user: UserDocument) {
    const evaluation = await this.findOrCreate(companyId);
    const hasAllEvaluated = evaluation.standards.every((item) => item.status);
    if (!hasAllEvaluated || !evaluation.actionPlan.length) throw new BadRequestException('Complete standards and generate action plan before approval');
    evaluation.status = InitialEvaluationStatus.PENDING_APPROVAL;
    this.pushHistory(evaluation, user, 'InitialEvaluation', 'status', '', `${InitialEvaluationStatus.PENDING_APPROVAL}${dto.comments ? `: ${dto.comments}` : ''}`);
    await this.generateLifecycleAlerts(evaluation);
    return evaluation.save();
  }

  async managerSign(companyId: Types.ObjectId, dto: SignApprovalDto, user: UserDocument) {
    const evaluation = await this.findOrCreate(companyId);
    if (evaluation.status !== InitialEvaluationStatus.PENDING_APPROVAL) throw new BadRequestException('Evaluation must be pending approval');
    const signerEmail = dto.signerEmail || user.email;
    const signedAt = new Date();
    const signatureHash = createHash('sha256').update(`${evaluation._id}:${signerEmail}:${signedAt.toISOString()}:${evaluation.overallCompliance}`).digest('hex');
    const signature = { signerRole: 'MANAGER', signerName: dto.signerName, signerEmail, signatureHash, signedAt, signatureUrl: dto.signatureUrl ?? '' };
    evaluation.signatures.push(signature);
    evaluation.approval = { approvedBy: user._id as Types.ObjectId, approvedByEmail: user.email, approvedAt: signedAt, compliancePercentage: evaluation.overallCompliance, comments: dto.comments ?? '', signature, approvalDocumentUrl: this.buildApprovalDocumentUrl(evaluation._id.toString()) };
    evaluation.status = InitialEvaluationStatus.APPROVED;
    evaluation.nextReassessmentAt = this.addMonths(signedAt, 12);
    this.pushHistory(evaluation, user, 'EvaluationApproval', 'signature', '', signatureHash);
    await this.recalculate(evaluation);
    return evaluation.save();
  }

  async executiveDashboard(companyId: Types.ObjectId) {
    const evaluation = await this.findOrCreate(companyId);
    const criticalFindings = evaluation.findings.filter((finding) => finding.severity === FindingSeverity.CRITICAL && finding.status !== WorkStatus.CLOSED).length;
    const pendingActions = evaluation.actionPlan.filter((action) => action.status !== WorkStatus.CLOSED).length;
    const riskLevel = criticalFindings > 0 || evaluation.overallCompliance < 60 ? 'Alto' : evaluation.overallCompliance < 85 ? 'Medio' : 'Bajo';
    return { overallCompliance: evaluation.overallCompliance, criticalFindings, pendingActions, riskLevel, status: evaluation.status };
  }

  private createDefaultStandards(): EvaluationStandard[] {
    return CATALOG.map((item) => ({ ...item, status: StandardEvaluationStatus.DOES_NOT_COMPLY, observations: '', evidence: [], attachments: [], autoEvaluated: false }));
  }

  private applyAutomaticStandard(evaluation: InitialEvaluationDocument, code: string, complies: boolean, source: string) {
    const standard = evaluation.standards.find((item) => item.code === code);
    if (!standard) return;
    standard.status = complies ? StandardEvaluationStatus.COMPLIES : StandardEvaluationStatus.DOES_NOT_COMPLY;
    standard.autoEvaluated = true;
    standard.autoSource = source;
    standard.observations = complies ? `${source}: cumple según motor de cumplimiento existente.` : `${source}: brecha detectada automáticamente.`;
    standard.evaluatedAt = new Date();
  }

  private async recalculate(evaluation: InitialEvaluationDocument) {
    const applicable = evaluation.standards.filter((item) => item.status !== StandardEvaluationStatus.NOT_APPLICABLE);
    const compliantWeight = applicable.filter((item) => item.status === StandardEvaluationStatus.COMPLIES).reduce((sum, item) => sum + item.weight, 0);
    const totalWeight = applicable.reduce((sum, item) => sum + item.weight, 0);
    evaluation.overallCompliance = totalWeight ? Math.round((compliantWeight / totalWeight) * 100) : 100;
    evaluation.totalStandardsEvaluated = evaluation.standards.filter((item) => item.status).length;
    evaluation.gaps = evaluation.standards.filter((item) => item.status !== StandardEvaluationStatus.COMPLIES).map((item) => ({ code: item.code, chapter: item.chapter, title: item.title, status: item.status, recommendedAction: this.recommendedAction(item) } as EvaluationGap));
    for (const action of evaluation.actionPlan) action.progress = Math.round(((action.manualProgress || 0) + (action.automaticProgress || 0) + (action.activityProgress || 0)) / 3);
    return evaluation;
  }

  private actionFromStandard(standard: EvaluationStandard): EvaluationActionPlan {
    return { id: new Types.ObjectId().toString(), source: `standard:${standard.code}`, title: this.recommendedAction(standard), description: `Acción generada automáticamente por incumplimiento del estándar ${standard.code} - ${standard.title}.`, responsible: '', dueDate: undefined, manualProgress: 0, automaticProgress: 0, activityProgress: 0, progress: 0, status: WorkStatus.OPEN, evidence: [] };
  }

  private recommendedAction(standard: Pick<EvaluationStandard, 'code' | 'title'>) {
    const map: Record<string, string> = { '2.1.1': 'Create SST Policy', '1.1.6': 'Conform COPASST', '1.1.1': 'Asignar Responsable SST', '1.2.1': 'Crear programa de capacitación SST', '2.2.1': 'Definir objetivos SST' };
    return map[standard.code] ?? `Cerrar brecha: ${standard.title}`;
  }

  private calculateActionProgress(dto: UpsertActionDto, existing?: EvaluationActionPlan) {
    if (dto.progress !== undefined) return Math.max(0, Math.min(100, dto.progress));
    const values = [dto.manualProgress ?? existing?.manualProgress ?? 0, dto.automaticProgress ?? existing?.automaticProgress ?? 0, dto.activityProgress ?? existing?.activityProgress ?? 0];
    return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  }

  private async generateLifecycleAlerts(evaluation: InitialEvaluationDocument) {
    const alerts: Array<{ type: string; message: string; severity: AlertSeverity }> = [];
    if (evaluation.status !== InitialEvaluationStatus.APPROVED) alerts.push({ type: 'INITIAL_EVALUATION_PENDING', message: 'Evaluación inicial SG-SST no completada o pendiente de aprobación.', severity: AlertSeverity.MEDIUM });
    if (evaluation.status === InitialEvaluationStatus.PENDING_APPROVAL) alerts.push({ type: 'INITIAL_EVALUATION_APPROVAL', message: 'Evaluación inicial SG-SST pendiente de firma gerencial.', severity: AlertSeverity.HIGH });
    const now = new Date();
    for (const finding of evaluation.findings) if (finding.dueDate && finding.dueDate < now && finding.status !== WorkStatus.CLOSED) alerts.push({ type: 'INITIAL_EVALUATION_FINDING_OVERDUE', message: `Hallazgo vencido: ${finding.title}`, severity: finding.severity === FindingSeverity.CRITICAL ? AlertSeverity.HIGH : AlertSeverity.MEDIUM });
    for (const action of evaluation.actionPlan) if (action.dueDate && action.dueDate < now && action.status !== WorkStatus.CLOSED) alerts.push({ type: 'INITIAL_EVALUATION_ACTION_OVERDUE', message: `Acción vencida: ${action.title}`, severity: AlertSeverity.HIGH });
    if (evaluation.nextReassessmentAt) {
      const days = Math.ceil((evaluation.nextReassessmentAt.getTime() - now.getTime()) / 86400000);
      if ([60, 30, 15].includes(days) || days < 0) alerts.push({ type: 'INITIAL_EVALUATION_REASSESSMENT', message: days < 0 ? 'Reevaluación anual SG-SST vencida.' : `Reevaluación anual SG-SST requerida en ${days} días.`, severity: days < 0 ? AlertSeverity.HIGH : AlertSeverity.MEDIUM });
    }
    await Promise.all(alerts.map((alert) => this.alertsService.createUnique({ companyId: evaluation.companyId, ...alert })));
  }

  private pushHistory(evaluation: InitialEvaluationDocument, user: UserDocument | undefined, entity: string, field: string, previousValue?: string, newValue?: string) {
    evaluation.history.push({ userId: user?._id as Types.ObjectId | undefined, userEmail: user?.email, date: new Date(), entity, field, previousValue, newValue });
  }

  private addMonths(date: Date, months: number) {
    const next = new Date(date);
    next.setMonth(next.getMonth() + months);
    return next;
  }

  private buildApprovalDocumentUrl(evaluationId: string) {
    return `/documents/initial-evaluation/${evaluationId}/informe-evaluacion-inicial-sg-sst.pdf`;
  }
}
