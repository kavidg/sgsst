import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { LegalRegulationTemplate, LegalRegulationTemplateDocument } from './schemas/legal-regulation-template.schema';
import { CompanyLegalMatrix, CompanyLegalMatrixDocument, LegalMatrixItem } from './schemas/company-legal-matrix.schema';
import { LegalRequirement, LegalRequirementDocument, RequirementComplianceStatus } from './schemas/legal-requirement.schema';
import { LegalEvidence, LegalEvidenceDocument } from './schemas/legal-evidence.schema';
import { LegalActionPlan, LegalActionPlanDocument } from './schemas/legal-action-plan.schema';
import { LegalFollowUp, LegalFollowUpDocument } from './schemas/legal-follow-up.schema';
import { LegalRegulatoryChange, LegalRegulatoryChangeDocument } from './schemas/legal-regulatory-change.schema';
import { LegalHistory, LegalHistoryDocument } from './schemas/legal-history.schema';
import { AlertsService } from '../alerts/alerts.service';
import { AlertSeverity } from '../alerts/schemas/alert.schema';

const SECTOR_REGULATIONS: Record<string, Array<{ code: string; name: string; description?: string }>> = {
  Common: [
    { code: 'RES-0312', name: 'Resolución 0312 - Estándares Mínimos SG-SST' },
    { code: 'DEC-1072', name: 'Decreto 1072 - Decreto Único Reglamentario del Sector Trabajo' },
    { code: 'LEY-1562', name: 'Ley 1562 - Sistema General de Riesgos Laborales' },
    { code: 'LEY-9-1979', name: 'Ley 9 de 1979 - Código Sanitario Nacional' },
    { code: 'RES-2400', name: 'Resolución 2400 - Disposiciones sobre vivienda, higiene y seguridad industrial' },
  ],
  Construction: [
    { code: 'RES-0312', name: 'Resolución 0312 - Estándares Mínimos SG-SST' },
    { code: 'DEC-1072', name: 'Decreto 1072 - Decreto Único Reglamentario del Sector Trabajo' },
    { code: 'RES-1409', name: 'Resolución 1409 - Reglamento de Seguridad en Alturas' },
    { code: 'LEY-400', name: 'Ley 400 - Régimen de Construcciones Sismo Resistentes' },
    { code: 'RES-2013', name: 'Resolución 2013 - Requisitos de EPP por Actividad Económica' },
  ],
  Healthcare: [
    { code: 'RES-0312', name: 'Resolución 0312 - Estándares Mínimos SG-SST' },
    { code: 'DEC-1072', name: 'Decreto 1072 - Decreto Único Reglamentario del Sector Trabajo' },
    { code: 'RES-1164', name: 'Resolución 1164 - Manual de Bioseguridad' },
    { code: 'DEC-3518', name: 'Decreto 3518 - SIVIGILA - Vigilancia en Salud Pública' },
    { code: 'DEC-780', name: 'Decreto 780 - Decreto Único Reglamentario del Sector Salud' },
    { code: 'RES-2184', name: 'Resolución 2184 - Gestión Integral de Residuos' },
  ],
  Transportation: [
    { code: 'RES-0312', name: 'Resolución 0312 - Estándares Mínimos SG-SST' },
    { code: 'DEC-1072', name: 'Decreto 1072 - Decreto Único Reglamentario del Sector Trabajo' },
    { code: 'LEY-1503', name: 'Ley 1503 - Seguridad Vial' },
    { code: 'DEC-2851', name: 'Decreto 2851 - Plan Estratégico de Seguridad Vial' },
    { code: 'RES-1565', name: 'Resolución 1565 - Plan Estratégico de Seguridad Vial' },
  ],
  Manufacturing: [
    { code: 'RES-0312', name: 'Resolución 0312 - Estándares Mínimos SG-SST' },
    { code: 'DEC-1072', name: 'Decreto 1072 - Decreto Único Reglamentario del Sector Trabajo' },
    { code: 'LEY-55', name: 'Ley 55 - Manipulación de Sustancias Químicas' },
    { code: 'DEC-2090', name: 'Decreto 2090 - Valores Límite Permisibles (VLP)' },
    { code: 'NTC-ISO-45001', name: 'NTC-ISO 45001 - Sistema de Gestión de Seguridad y Salud en el Trabajo' },
  ],
  Mining: [
    { code: 'RES-0312', name: 'Resolución 0312 - Estándares Mínimos SG-SST' },
    { code: 'DEC-1072', name: 'Decreto 1072 - Decreto Único Reglamentario del Sector Trabajo' },
    { code: 'LEY-1382', name: 'Ley 1382 - Código de Minas' },
    { code: 'DEC-2222', name: 'Decreto 2222 - Reglamento de Higiene y Seguridad en Minería' },
  ],
  'Oil and Gas': [
    { code: 'RES-0312', name: 'Resolución 0312 - Estándares Mínimos SG-SST' },
    { code: 'DEC-1072', name: 'Decreto 1072 - Decreto Único Reglamentario del Sector Trabajo' },
    { code: 'DEC-1073', name: 'Decreto 1073 - Decreto Único Reglamentario del Sector Hidrocarburos' },
    { code: 'RES-181495', name: 'Resolución 181495 - Seguridad en Hidrocarburos' },
  ],
  Agriculture: [
    { code: 'RES-0312', name: 'Resolución 0312 - Estándares Mínimos SG-SST' },
    { code: 'DEC-1072', name: 'Decreto 1072 - Decreto Único Reglamentario del Sector Trabajo' },
    { code: 'LEY-55', name: 'Ley 55 - Manipulación de Agroquímicos' },
    { code: 'DEC-1843', name: 'Decreto 1843 - Uso de Plaguicidas' },
  ],
  Education: [
    { code: 'RES-0312', name: 'Resolución 0312 - Estándares Mínimos SG-SST' },
    { code: 'DEC-1072', name: 'Decreto 1072 - Decreto Único Reglamentario del Sector Trabajo' },
    { code: 'DEC-1075', name: 'Decreto 1075 - Decreto Único Reglamentario del Sector Educación' },
  ],
  Technology: [
    { code: 'RES-0312', name: 'Resolución 0312 - Estándares Mínimos SG-SST' },
    { code: 'DEC-1072', name: 'Decreto 1072 - Decreto Único Reglamentario del Sector Trabajo' },
    { code: 'LEY-1581', name: 'Ley 1581 - Protección de Datos Personales' },
  ],
  'Hotels': [
    { code: 'RES-0312', name: 'Resolución 0312 - Estándares Mínimos SG-SST' },
    { code: 'DEC-1072', name: 'Decreto 1072 - Decreto Único Reglamentario del Sector Trabajo' },
    { code: 'RES-2674', name: 'Resolución 2674 - Requisitos Sanitarios para Alimentos' },
  ],
  'Retail Commerce': [
    { code: 'RES-0312', name: 'Resolución 0312 - Estándares Mínimos SG-SST' },
    { code: 'DEC-1072', name: 'Decreto 1072 - Decreto Único Reglamentario del Sector Trabajo' },
    { code: 'LEY-1480', name: 'Ley 1480 - Estatuto del Consumidor' },
  ],
  'Security Services': [
    { code: 'RES-0312', name: 'Resolución 0312 - Estándares Mínimos SG-SST' },
    { code: 'DEC-1072', name: 'Decreto 1072 - Decreto Único Reglamentario del Sector Trabajo' },
    { code: 'DEC-356', name: 'Decreto 356 - Vigilancia y Seguridad Privada' },
  ],
};

@Injectable()
export class LegalMatrixService {
  constructor(
    @InjectModel(LegalRegulationTemplate.name)
    private readonly templateModel: Model<LegalRegulationTemplateDocument>,
    @InjectModel(CompanyLegalMatrix.name)
    private readonly companyMatrixModel: Model<CompanyLegalMatrixDocument>,
    @InjectModel(LegalRequirement.name)
    private readonly requirementModel: Model<LegalRequirementDocument>,
    @InjectModel(LegalEvidence.name)
    private readonly evidenceModel: Model<LegalEvidenceDocument>,
    @InjectModel(LegalActionPlan.name)
    private readonly actionPlanModel: Model<LegalActionPlanDocument>,
    @InjectModel(LegalFollowUp.name)
    private readonly followUpModel: Model<LegalFollowUpDocument>,
    @InjectModel(LegalRegulatoryChange.name)
    private readonly regulatoryChangeModel: Model<LegalRegulatoryChangeDocument>,
    @InjectModel(LegalHistory.name)
    private readonly historyModel: Model<LegalHistoryDocument>,
    private readonly alertsService: AlertsService,
  ) {}

  // ==================== HELPERS ====================

  private async recordHistory(params: {
    companyId: Types.ObjectId;
    userId: Types.ObjectId;
    userEmail: string;
    userName?: string;
    action: string;
    entityType: string;
    entityId: string;
    requirementId?: Types.ObjectId;
    description?: string;
    previousValue?: Record<string, unknown>;
    newValue?: Record<string, unknown>;
  }): Promise<void> {
    await this.historyModel.create({
      companyId: params.companyId,
      userId: params.userId,
      userEmail: params.userEmail,
      userName: params.userName,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      requirementId: params.requirementId,
      description: params.description,
      previousValue: params.previousValue,
      newValue: params.newValue,
    });
  }

  // ==================== SECTOR TEMPLATES (TAB 2) ====================

  async seedRegulationsForSector(sector: string): Promise<LegalRegulationTemplate[]> {
    const regulations = SECTOR_REGULATIONS[sector] || SECTOR_REGULATIONS['Common'] || [];

    const operations = regulations.map((reg) => ({
      updateOne: {
        filter: { sector, regulationCode: reg.code },
        update: { $set: { sector, regulationCode: reg.code, regulationName: reg.name, description: reg.description ?? '', isActive: true } },
        upsert: true,
      },
    }));

    if (operations.length > 0) await this.templateModel.bulkWrite(operations);
    return this.templateModel.find({ sector }).exec();
  }

  async seedAllSectors(): Promise<void> {
    for (const sector of Object.keys(SECTOR_REGULATIONS)) {
      await this.seedRegulationsForSector(sector);
    }
  }

  async getRegulationsBySector(sector: string): Promise<LegalRegulationTemplate[]> {
    let regulations = await this.templateModel.find({ sector, isActive: true }).exec();
    if (regulations.length === 0) regulations = await this.templateModel.find({ sector: 'Common', isActive: true }).exec();
    return regulations;
  }

  async getAllSectorTemplates(): Promise<Array<{ sector: string; count: number }>> {
    const result = await this.templateModel.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$sector', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]).exec();
    return result.map((r) => ({ sector: r._id, count: r.count }));
  }

  async createRegulationTemplate(sector: string, data: { regulationCode: string; regulationName: string; description?: string }): Promise<LegalRegulationTemplate> {
    const existing = await this.templateModel.findOne({ sector, regulationCode: data.regulationCode }).exec();
    if (existing) throw new BadRequestException(`Regulation ${data.regulationCode} already exists in sector ${sector}`);
    return this.templateModel.create({ sector, ...data, isActive: true });
  }

  async updateRegulationTemplate(id: string, data: Partial<{ regulationName: string; description: string; isActive: boolean }>): Promise<LegalRegulationTemplate> {
    const updated = await this.templateModel.findByIdAndUpdate(id, { $set: data }, { new: true }).exec();
    if (!updated) throw new NotFoundException('Regulation template not found');
    return updated;
  }

  async deleteRegulationTemplate(id: string): Promise<void> {
    const deleted = await this.templateModel.findByIdAndDelete(id).exec();
    if (!deleted) throw new NotFoundException('Regulation template not found');
  }

  // ==================== COMPANY MATRIX (TAB 1 & 2) ====================

  async autoAssignLegalMatrix(companyId: string, economicSector: string): Promise<CompanyLegalMatrix> {
    const existing = await this.companyMatrixModel.findOne({ companyId: new Types.ObjectId(companyId) }).exec();
    if (existing) return existing;

    await this.seedRegulationsForSector(economicSector);
    const regulations = await this.getRegulationsBySector(economicSector);

    const items: LegalMatrixItem[] = regulations.map((reg) => ({
      regulationCode: reg.regulationCode,
      regulationName: reg.regulationName,
      description: reg.description,
      status: 'PENDIENTE' as const,
    }));

    return this.companyMatrixModel.create({ companyId: new Types.ObjectId(companyId), economicSector, items });
  }

  async getCompanyMatrix(companyId: string): Promise<CompanyLegalMatrix> {
    const matrix = await this.companyMatrixModel.findOne({ companyId: new Types.ObjectId(companyId) }).exec();
    if (!matrix) throw new NotFoundException(`Legal matrix not found for company ${companyId}`);
    return matrix;
  }

  async updateMatrixItemStatus(companyId: string, regulationCode: string, status: LegalMatrixItem['status'], observation?: string, userId?: string): Promise<CompanyLegalMatrix> {
    const matrix = await this.companyMatrixModel.findOne({ companyId: new Types.ObjectId(companyId) }).exec();
    if (!matrix) throw new NotFoundException(`Legal matrix not found`);

    const item = matrix.items.find((i) => i.regulationCode === regulationCode);
    if (!item) throw new NotFoundException(`Regulation ${regulationCode} not found`);

    const prevStatus = item.status;
    item.status = status;
    if (observation !== undefined) item.observation = observation;
    if (userId) item.updatedBy = new Types.ObjectId(userId);
    item.lastUpdatedAt = new Date();

    await matrix.save();

    if (userId) {
      await this.recordHistory({
        companyId: new Types.ObjectId(companyId),
        userId: new Types.ObjectId(userId),
        userEmail: '',
        action: 'UPDATE_MATRIX_STATUS',
        entityType: 'LegalMatrixItem',
        entityId: regulationCode,
        description: `Status changed from ${prevStatus} to ${status} for ${regulationCode}`,
        previousValue: { status: prevStatus },
        newValue: { status },
      });
    }

    return matrix;
  }

  async addCustomRegulation(companyId: string, regulationCode: string, regulationName: string, description?: string, userId?: string): Promise<CompanyLegalMatrix> {
    const matrix = await this.companyMatrixModel.findOne({ companyId: new Types.ObjectId(companyId) }).exec();
    if (!matrix) throw new NotFoundException(`Legal matrix not found`);

    const exists = matrix.items.some((i) => i.regulationCode === regulationCode);
    if (exists) throw new BadRequestException(`Regulation ${regulationCode} already exists`);

    matrix.items.push({ regulationCode, regulationName, description, status: 'PENDIENTE' });

    if (userId) {
      await this.templateModel.updateOne({ sector: matrix.economicSector, regulationCode }, {
        $set: { sector: matrix.economicSector, regulationCode, regulationName, description: description ?? '', isActive: true },
      }, { upsert: true });
    }

    return matrix.save();
  }

  async removeRegulationFromMatrix(companyId: string, regulationCode: string): Promise<CompanyLegalMatrix> {
    const matrix = await this.companyMatrixModel.findOne({ companyId: new Types.ObjectId(companyId) }).exec();
    if (!matrix) throw new NotFoundException(`Legal matrix not found`);

    matrix.items = matrix.items.filter((i) => i.regulationCode !== regulationCode);
    return matrix.save();
  }

  async getMatrixCompliance(companyId: string): Promise<{
    total: number; cumplen: number; noCumplen: number; noAplica: number; pendiente: number; compliancePercentage: number;
  }> {
    const matrix = await this.getCompanyMatrix(companyId);
    const items = matrix.items;
    const total = items.length;
    const cumplen = items.filter((i) => i.status === 'CUMPLE').length;
    const noCumplen = items.filter((i) => i.status === 'NO_CUMPLE').length;
    const noAplica = items.filter((i) => i.status === 'NO_APLICA').length;
    const pendiente = items.filter((i) => i.status === 'PENDIENTE').length;
    const evaluated = cumplen + noCumplen;
    return { total, cumplen, noCumplen, noAplica, pendiente, compliancePercentage: evaluated > 0 ? Math.round((cumplen / evaluated) * 100) : 0 };
  }

  async getAllCompanyMatrices(): Promise<CompanyLegalMatrix[]> {
    return this.companyMatrixModel.find().populate('companyId', 'name nit economicSector').exec();
  }

  // ==================== DASHBOARD (TAB 1) ====================

  async getAdvancedDashboard(companyId: string): Promise<{
    totalRequirements: number;
    compliant: number;
    partial: number;
    nonCompliant: number;
    expiringReviews: number;
    pendingEvidence: number;
    regulatoryChanges: number;
    overallCompliancePercentage: number;
  }> {
    const companyOid = new Types.ObjectId(companyId);

    const [matrix, requirements, followUps, evidence, regulatoryChanges] = await Promise.all([
      this.companyMatrixModel.findOne({ companyId: companyOid }).exec(),
      this.requirementModel.find({ companyId: companyOid, isActive: true }).exec(),
      this.followUpModel.find({ companyId: companyOid }).sort({ reviewDate: -1 }).exec(),
      this.evidenceModel.find({ companyId: companyOid, status: 'PENDING' }).exec(),
      this.regulatoryChangeModel.find({ companyId: companyOid, isReviewed: false }).exec(),
    ]);

    const totalRequirements = requirements.length;
    const compliant = requirements.filter((r) => r.complianceStatus === 'CUMPLE').length;
    const partial = requirements.filter((r) => r.complianceStatus === 'PARCIAL').length;
    const nonCompliant = requirements.filter((r) => r.complianceStatus === 'NO_CUMPLE').length;

    // Expiring reviews: follow-ups with nextReviewDate within 30 days
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const expiringReviews = followUps.filter(
      (f) => f.nextReviewDate && f.nextReviewDate <= thirtyDaysFromNow,
    ).length;

    const pendingEvidence = evidence.length;
    const regulatoryChangeCount = regulatoryChanges.length;

    const evaluated = compliant + partial + nonCompliant;
    const overallCompliancePercentage = evaluated > 0
      ? Math.round(((compliant + partial * 0.5) / evaluated) * 100)
      : (matrix ? 0 : 0);

    return {
      totalRequirements,
      compliant,
      partial,
      nonCompliant,
      expiringReviews,
      pendingEvidence,
      regulatoryChanges: regulatoryChangeCount,
      overallCompliancePercentage,
    };
  }

  // ==================== LEGAL REQUIREMENTS (TAB 3) ====================

  async createRequirement(data: {
    companyId: string;
    regulationCode: string;
    regulationName: string;
    article?: string;
    requirement: string;
    responsibleUser?: string;
    reviewFrequency?: string;
    userId?: string;
    userEmail?: string;
  }): Promise<LegalRequirement> {
    const requirement = await this.requirementModel.create({
      companyId: new Types.ObjectId(data.companyId),
      regulationCode: data.regulationCode,
      regulationName: data.regulationName,
      article: data.article,
      requirement: data.requirement,
      responsibleUser: data.responsibleUser ? new Types.ObjectId(data.responsibleUser) : undefined,
      reviewFrequency: (data.reviewFrequency as any) ?? 'ANUAL',
      complianceStatus: 'NO_CUMPLE',
    });

    if (data.userId && data.userEmail) {
      await this.recordHistory({
        companyId: new Types.ObjectId(data.companyId),
        userId: new Types.ObjectId(data.userId),
        userEmail: data.userEmail,
        action: 'CREATE_REQUIREMENT',
        entityType: 'LegalRequirement',
        entityId: requirement._id.toString(),
        description: `Created requirement: ${data.requirement}`,
        newValue: { regulationCode: data.regulationCode, requirement: data.requirement },
      });
    }

    return requirement;
  }

  async getRequirements(companyId: string, regulationCode?: string): Promise<LegalRequirement[]> {
    const filter: any = { companyId: new Types.ObjectId(companyId), isActive: true };
    if (regulationCode) filter.regulationCode = regulationCode;
    return this.requirementModel.find(filter).sort({ regulationCode: 1 }).populate('responsibleUser', 'email name').exec();
  }

  async getRequirement(id: string): Promise<LegalRequirement> {
    const req = await this.requirementModel.findById(id).populate('responsibleUser', 'email name').exec();
    if (!req) throw new NotFoundException('Requirement not found');
    return req;
  }

  async updateRequirement(id: string, data: Partial<{
    complianceStatus: RequirementComplianceStatus;
    responsibleUser: string;
    reviewFrequency: string;
    article: string;
    requirement: string;
    notes: string;
    linkedModules: any[];
  }>, userId?: string, userEmail?: string): Promise<LegalRequirement> {
    const req = await this.requirementModel.findById(id).exec();
    if (!req) throw new NotFoundException('Requirement not found');

    const before: Record<string, unknown> = {};
    if (data.complianceStatus !== undefined) {
      before.complianceStatus = req.complianceStatus;
      req.complianceStatus = data.complianceStatus;
    }
    if (data.responsibleUser !== undefined) {
      before.responsibleUser = req.responsibleUser?.toString();
      req.responsibleUser = new Types.ObjectId(data.responsibleUser);
    }
    if (data.reviewFrequency !== undefined) {
      before.reviewFrequency = req.reviewFrequency;
      req.reviewFrequency = data.reviewFrequency as any;
    }
    if (data.article !== undefined) { before.article = req.article; req.article = data.article; }
    if (data.requirement !== undefined) { before.requirement = req.requirement; req.requirement = data.requirement; }
    if (data.notes !== undefined) { before.notes = req.notes; req.notes = data.notes; }
    if (data.linkedModules !== undefined) {
      before.linkedModules = req.linkedModules;
      req.linkedModules = data.linkedModules as any;
    }

    await req.save();

    if (userId && userEmail) {
      await this.recordHistory({
        companyId: req.companyId,
        userId: new Types.ObjectId(userId),
        userEmail,
        action: 'UPDATE_REQUIREMENT',
        entityType: 'LegalRequirement',
        entityId: id,
        requirementId: req._id,
        description: `Updated requirement ${req.regulationCode}`,
        previousValue: before,
        newValue: data as any,
      });
    }

    return req;
  }

  async deleteRequirement(id: string): Promise<void> {
    const req = await this.requirementModel.findByIdAndUpdate(id, { isActive: false }, { new: true }).exec();
    if (!req) throw new NotFoundException('Requirement not found');
    // Cascade deactivate evidence and action plans
    await this.evidenceModel.updateMany({ requirementId: new Types.ObjectId(id) }, { status: 'REJECTED' }).exec();
    await this.actionPlanModel.updateMany({ requirementId: new Types.ObjectId(id) }, { status: 'CANCELLED' }).exec();
  }

  async linkModuleToRequirement(requirementId: string, moduleInfo: {
    module: string; entityId: string; entityName?: string; isCompliant?: boolean;
  }): Promise<LegalRequirement> {
    const req = await this.requirementModel.findById(requirementId).exec();
    if (!req) throw new NotFoundException('Requirement not found');

    const existing = req.linkedModules.findIndex((m) => m.module === moduleInfo.module && m.entityId === moduleInfo.entityId);
    if (existing >= 0) {
      req.linkedModules[existing].isCompliant = moduleInfo.isCompliant ?? false;
      if (moduleInfo.entityName) req.linkedModules[existing].entityName = moduleInfo.entityName;
    } else {
      req.linkedModules.push({
        module: moduleInfo.module as any,
        entityId: moduleInfo.entityId,
        entityName: moduleInfo.entityName,
        isCompliant: moduleInfo.isCompliant ?? false,
      });
    }

    // Auto-update compliance: if all linked modules are compliant, mark as CUMPLE
    const allCompliant = req.linkedModules.length > 0 && req.linkedModules.every((m) => m.isCompliant);
    if (allCompliant) req.complianceStatus = 'CUMPLE';

    return req.save();
  }

  // ==================== EVIDENCE (TAB 4) ====================

  async linkEvidence(data: {
    companyId: string;
    requirementId: string;
    documentId?: string;
    documentName?: string;
    documentVersion?: string;
    fileUrl?: string;
    description: string;
    uploadedBy?: string;
  }): Promise<LegalEvidence> {
    return this.evidenceModel.create({
      companyId: new Types.ObjectId(data.companyId),
      requirementId: new Types.ObjectId(data.requirementId),
      documentId: data.documentId ? new Types.ObjectId(data.documentId) : undefined,
      documentName: data.documentName,
      documentVersion: data.documentVersion,
      fileUrl: data.fileUrl,
      description: data.description,
      uploadedBy: data.uploadedBy ? new Types.ObjectId(data.uploadedBy) : undefined,
      uploadDate: new Date(),
      status: 'VALID',
    });
  }

  async getEvidenceByRequirement(requirementId: string): Promise<LegalEvidence[]> {
    return this.evidenceModel.find({ requirementId: new Types.ObjectId(requirementId) }).sort({ createdAt: -1 }).exec();
  }

  async getEvidenceByCompany(companyId: string): Promise<LegalEvidence[]> {
    return this.evidenceModel.find({ companyId: new Types.ObjectId(companyId) }).sort({ createdAt: -1 }).exec();
  }

  async removeEvidence(id: string): Promise<void> {
    const deleted = await this.evidenceModel.findByIdAndDelete(id).exec();
    if (!deleted) throw new NotFoundException('Evidence not found');
  }

  // ==================== FOLLOW-UP (TAB 5) ====================

  async createFollowUp(data: {
    companyId: string;
    requirementId: string;
    reviewDate: Date;
    reviewer?: string;
    reviewerName?: string;
    findings?: string;
    recommendations?: string;
    complianceResult: string;
    nextReviewDate?: Date;
  }): Promise<LegalFollowUp> {
    const followUp = await this.followUpModel.create({
      companyId: new Types.ObjectId(data.companyId),
      requirementId: new Types.ObjectId(data.requirementId),
      reviewDate: data.reviewDate,
      reviewer: data.reviewer ? new Types.ObjectId(data.reviewer) : undefined,
      reviewerName: data.reviewerName,
      findings: data.findings,
      recommendations: data.recommendations,
      complianceResult: data.complianceResult,
      nextReviewDate: data.nextReviewDate,
    });

    // Auto-update requirement compliance status based on follow-up result
    if (data.complianceResult === 'CUMPLE' || data.complianceResult === 'PARCIAL' || data.complianceResult === 'NO_CUMPLE') {
      await this.requirementModel.findByIdAndUpdate(data.requirementId, {
        complianceStatus: data.complianceResult as RequirementComplianceStatus,
        lastReviewedAt: new Date(),
      }).exec();
    }

    return followUp;
  }

  async getFollowUpsByRequirement(requirementId: string): Promise<LegalFollowUp[]> {
    return this.followUpModel.find({ requirementId: new Types.ObjectId(requirementId) }).sort({ reviewDate: -1 }).exec();
  }

  async getFollowUpsByCompany(companyId: string): Promise<LegalFollowUp[]> {
    return this.followUpModel.find({ companyId: new Types.ObjectId(companyId) }).sort({ reviewDate: -1 }).populate('reviewer', 'email name').exec();
  }

  async signFollowUp(id: string, data: {
    signedBy: string;
    signedByName: string;
    signatureHash?: string;
    signatureUrl?: string;
  }): Promise<LegalFollowUp> {
    const followUp = await this.followUpModel.findById(id).exec();
    if (!followUp) throw new NotFoundException('Follow-up not found');

    followUp.isSigned = true;
    followUp.signedBy = new Types.ObjectId(data.signedBy);
    followUp.signedByName = data.signedByName;
    followUp.signedAt = new Date();
    if (data.signatureHash) followUp.signatureHash = data.signatureHash;
    if (data.signatureUrl) followUp.signatureUrl = data.signatureUrl;

    return followUp.save();
  }

  // ==================== REGULATORY CHANGES (TAB 6) ====================

  async createRegulatoryChange(data: {
    companyId: string;
    changeType: string;
    regulationCode: string;
    regulationName: string;
    previousRegulationCode?: string;
    description?: string;
    impact: string;
    effectiveDate: Date;
    source?: string;
    url?: string;
  }): Promise<LegalRegulatoryChange> {
    const change = await this.regulatoryChangeModel.create({
      companyId: new Types.ObjectId(data.companyId),
      changeType: data.changeType as any,
      regulationCode: data.regulationCode,
      regulationName: data.regulationName,
      previousRegulationCode: data.previousRegulationCode,
      description: data.description,
      impact: data.impact as any,
      effectiveDate: data.effectiveDate,
      source: data.source,
      url: data.url,
    });

    // Generate alert for impactful changes
    if (data.impact === 'HIGH' || data.impact === 'MEDIUM') {
      await this.alertsService.create({
        companyId: data.companyId,
        type: 'REGULATORY_CHANGE',
        message: `Cambio normativo: ${data.changeType === 'NEW_REGULATION' ? 'Nueva' : data.changeType === 'AMENDMENT' ? 'Modificación' : data.changeType === 'REPEAL' ? 'Derogación' : 'Actualización'} de ${data.regulationName}`,            severity: data.impact === 'HIGH' ? AlertSeverity.HIGH : AlertSeverity.MEDIUM,
      });

      await this.regulatoryChangeModel.findByIdAndUpdate(change._id, { alertGenerated: true }).exec();
    }

    return change;
  }

  async getRegulatoryChanges(companyId: string, onlyUnreviewed?: boolean): Promise<LegalRegulatoryChange[]> {
    const filter: any = { companyId: new Types.ObjectId(companyId) };
    if (onlyUnreviewed) filter.isReviewed = false;
    return this.regulatoryChangeModel.find(filter).sort({ effectiveDate: -1 }).exec();
  }

  async markRegulatoryChangeReviewed(id: string, reviewedBy: string): Promise<LegalRegulatoryChange> {
    const change = await this.regulatoryChangeModel.findByIdAndUpdate(id, {
      isReviewed: true,
      reviewedBy: new Types.ObjectId(reviewedBy),
      reviewedAt: new Date(),
    }, { new: true }).exec();
    if (!change) throw new NotFoundException('Regulatory change not found');
    return change;
  }

  // ==================== ACTION PLAN (TAB 7) ====================

  async createActionPlan(data: {
    companyId: string;
    requirementId: string;
    title: string;
    description?: string;
    responsibleUser?: string;
    dueDate?: Date;
    createdBy?: string;
  }): Promise<LegalActionPlan> {
    return this.actionPlanModel.create({
      companyId: new Types.ObjectId(data.companyId),
      requirementId: new Types.ObjectId(data.requirementId),
      title: data.title,
      description: data.description,
      responsibleUser: data.responsibleUser ? new Types.ObjectId(data.responsibleUser) : undefined,
      dueDate: data.dueDate,
      createdBy: data.createdBy ? new Types.ObjectId(data.createdBy) : undefined,
      status: 'PENDING',
    });
  }

  async getActionPlans(companyId: string, requirementId?: string): Promise<LegalActionPlan[]> {
    const filter: any = { companyId: new Types.ObjectId(companyId) };
    if (requirementId) filter.requirementId = new Types.ObjectId(requirementId);
    return this.actionPlanModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  async updateActionPlan(id: string, data: Partial<{
    title: string; description: string; responsibleUser: string; dueDate: Date; status: string;
    completionNotes: string;
  }>): Promise<LegalActionPlan> {
    const plan = await this.actionPlanModel.findById(id).exec();
    if (!plan) throw new NotFoundException('Action plan not found');

    if (data.title !== undefined) plan.title = data.title;
    if (data.description !== undefined) plan.description = data.description;
    if (data.responsibleUser !== undefined) plan.responsibleUser = new Types.ObjectId(data.responsibleUser);
    if (data.dueDate !== undefined) plan.dueDate = data.dueDate;
    if (data.status !== undefined) plan.status = data.status as any;
    if (data.completionNotes !== undefined) plan.completionNotes = data.completionNotes;
    if (data.status === 'COMPLETED') plan.completedAt = new Date();

    return plan.save();
  }

  async syncActionPlanToAnnualWorkPlan(id: string, activityId: string, activityTitle: string): Promise<LegalActionPlan> {
    const plan = await this.actionPlanModel.findById(id).exec();
    if (!plan) throw new NotFoundException('Action plan not found');

    plan.linkedActivityId = new Types.ObjectId(activityId);
    plan.activityTitle = activityTitle;
    plan.syncedToAnnualPlan = true;
    plan.syncedAt = new Date();

    return plan.save();
  }

  // ==================== HISTORY (TAB 8) ====================

  async getHistory(companyId: string, limit = 100, skip = 0): Promise<LegalHistory[]> {
    return this.historyModel.find({ companyId: new Types.ObjectId(companyId) })
      .sort({ createdAt: -1 }).skip(skip).limit(limit).exec();
  }

  async getEntityHistory(entityType: string, entityId: string): Promise<LegalHistory[]> {
    return this.historyModel.find({ entityType, entityId }).sort({ createdAt: -1 }).exec();
  }

  // ==================== ALERTS ENGINE ====================

  async checkAndGenerateAlerts(companyId: string): Promise<string[]> {
    const companyOid = new Types.ObjectId(companyId);
    const alerts: string[] = [];
    const now = new Date();

    // 1. Check requirements approaching review date (30, 15, 5, 1 days)
    const requirements = await this.requirementModel.find({ companyId: companyOid, isActive: true }).exec();
    for (const req of requirements) {
      if (!req.lastReviewedAt) continue;
      const daysSinceReview = Math.floor((now.getTime() - req.lastReviewedAt.getTime()) / (1000 * 60 * 60 * 24));
      let frequencyDays = 365;
      if (req.reviewFrequency === 'MENSUAL') frequencyDays = 30;
      else if (req.reviewFrequency === 'TRIMESTRAL') frequencyDays = 90;
      else if (req.reviewFrequency === 'SEMESTRAL') frequencyDays = 180;
      else if (req.reviewFrequency === 'ANUAL') frequencyDays = 365;

      const daysUntilReview = frequencyDays - daysSinceReview;
      const triggerDays = [30, 15, 5, 1];
      for (const triggerDay of triggerDays) {
        if (daysUntilReview === triggerDay) {
          const msg = `Revisión de requisito "${req.regulationCode} - ${req.requirement.substring(0, 50)}" vence en ${triggerDay} días`;
          await this.alertsService.create({
            companyId,
            type: 'LEGAL_REVIEW_REMINDER',
            message: msg,
            severity: triggerDay <= 5 ? AlertSeverity.HIGH : AlertSeverity.MEDIUM,
          });
          alerts.push(msg);
        }
      }

      if (daysUntilReview < 0) {
        const msg = `Revisión de requisito "${req.regulationCode}" está vencida por ${Math.abs(daysUntilReview)} días`;
        await this.alertsService.create({
          companyId,
          type: 'LEGAL_REVIEW_OVERDUE',
          message: msg,            severity: AlertSeverity.HIGH,
        });
        alerts.push(msg);
      }
    }

    // 2. Check pending evidence
    const pendingEvidence = await this.evidenceModel.find({ companyId: companyOid, status: 'PENDING' }).countDocuments().exec();
    if (pendingEvidence > 0) {
      const msg = `${pendingEvidence} evidencia(s) pendiente(s) por adjuntar en la matriz legal`;
      await this.alertsService.create({
        companyId,
        type: 'LEGAL_EVIDENCE_PENDING',
        message: msg,            severity: AlertSeverity.MEDIUM,
      });
      alerts.push(msg);
    }

    // 3. Check unreviewed regulatory changes
    const unreviewedChanges = await this.regulatoryChangeModel.find({ companyId: companyOid, isReviewed: false }).countDocuments().exec();
    if (unreviewedChanges > 0) {
      const msg = `${unreviewedChanges} cambio(s) normativo(s) sin revisar`;
      await this.alertsService.create({
        companyId,
        type: 'LEGAL_UNREVIEWED_CHANGES',
        message: msg,
        severity: AlertSeverity.HIGH,
      });
      alerts.push(msg);
    }

    // 4. Check non-compliant requirements
    const nonCompliant = await this.requirementModel.find({ companyId: companyOid, complianceStatus: 'NO_CUMPLE' }).countDocuments().exec();
    if (nonCompliant > 0) {
      const msg = `${nonCompliant} requisito(s) legal(es) en estado No Cumple`;
      await this.alertsService.create({
        companyId,
        type: 'LEGAL_NON_COMPLIANCE',
        message: msg,
        severity: AlertSeverity.HIGH,
      });
      alerts.push(msg);
    }

    return alerts;
  }

  // ==================== COMPLIANCE ENGINE ====================

  async evaluateAutoCompliance(companyId: string): Promise<{
    complies: boolean;
    reasons: string[];
    score: number;
  }> {
    const reasons: string[] = [];
    let score = 0;
    const maxScore = 5;

    // 1. Legal matrix exists and has items
    const matrix = await this.companyMatrixModel.findOne({ companyId: new Types.ObjectId(companyId) }).exec();
    if (matrix && matrix.items.length > 0) {
      score += 1;
    } else {
      reasons.push('La matriz legal no existe o está vacía');
    }

    // 2. Legal requirements reviewed (at least 80% have been reviewed)
    const requirements = await this.requirementModel.find({ companyId: new Types.ObjectId(companyId), isActive: true }).exec();
    if (requirements.length > 0) {
      const reviewed = requirements.filter((r) => r.lastReviewedAt).length;
      const reviewPct = reviewed / requirements.length;
      if (reviewPct >= 0.8) {
        score += 1;
      } else {
        reasons.push(`Solo ${reviewed}/${requirements.length} requisitos han sido revisados`);
      }
    } else {
      reasons.push('No hay requisitos legales registrados');
    }

    // 3. Evidence linked
    const evidenceCount = await this.evidenceModel.find({ companyId: new Types.ObjectId(companyId) }).countDocuments().exec();
    if (evidenceCount > 0) {
      score += 1;
    } else {
      reasons.push('No hay evidencias vinculadas a la matriz legal');
    }

    // 4. Follow-ups completed
    const followUpCount = await this.followUpModel.find({ companyId: new Types.ObjectId(companyId) }).countDocuments().exec();
    if (followUpCount > 0) {
      score += 1;
    } else {
      reasons.push('No se han realizado seguimientos');
    }

    // 5. Legal reviews signed
    const signedFollowUps = await this.followUpModel.find({ companyId: new Types.ObjectId(companyId), isSigned: true }).countDocuments().exec();
    if (signedFollowUps > 0) {
      score += 1;
    } else {
      reasons.push('No hay revisiones legales firmadas');
    }

    return {
      complies: score >= 4,
      reasons,
      score: Math.round((score / maxScore) * 100),
    };
  }

  // ==================== DOCUMENT MANAGEMENT INTEGRATION ====================

  async registerDocumentFromLegalAction(data: {
    companyId: string;
    code: string;
    name: string;
    documentType: string;
    description?: string;
  }): Promise<{ documentId: string }> {
    // This will be called when a legal review, compliance report, or regulatory analysis is generated.
    // The actual document creation is delegated to the Document Management Service via the controller.
    return { documentId: `pending-${data.code}` };
  }
}
