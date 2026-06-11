import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Communication } from './schemas/communication.schema';
import { CommunicationRecipient } from './schemas/communication-recipient.schema';
import { CommunicationReadReceipt } from './schemas/communication-read-receipt.schema';
import { CommunicationSignature } from './schemas/communication-signature.schema';
import { CommunicationCampaign } from './schemas/communication-campaign.schema';
import { CommunicationSurvey } from './schemas/communication-survey.schema';
import { CommunicationSurveyResponse } from './schemas/communication-survey-response.schema';
import { CommunicationMailbox } from './schemas/communication-mailbox.schema';
import { CommunicationHistory } from './schemas/communication-history.schema';
import { AlertsService } from '../alerts/alerts.service';
import { AlertSeverity } from '../alerts/schemas/alert.schema';

@Injectable()
export class CommunicationService {
  constructor(
    @InjectModel(Communication.name) private commModel: Model<Communication>,
    @InjectModel(CommunicationRecipient.name) private recipientModel: Model<CommunicationRecipient>,
    @InjectModel(CommunicationReadReceipt.name) private receiptModel: Model<CommunicationReadReceipt>,
    @InjectModel(CommunicationSignature.name) private signatureModel: Model<CommunicationSignature>,
    @InjectModel(CommunicationCampaign.name) private campaignModel: Model<CommunicationCampaign>,
    @InjectModel(CommunicationSurvey.name) private surveyModel: Model<CommunicationSurvey>,
    @InjectModel(CommunicationSurveyResponse.name) private surveyResponseModel: Model<CommunicationSurveyResponse>,
    @InjectModel(CommunicationMailbox.name) private mailboxModel: Model<CommunicationMailbox>,
    @InjectModel(CommunicationHistory.name) private historyModel: Model<CommunicationHistory>,
    private alertsService: AlertsService,
  ) {}

  private async recordHistory(companyId: string, userId: string, userEmail: string, userName: string | undefined, action: string, entityType: string, entityId: string, description: string, previousValue?: Record<string, unknown>, newValue?: Record<string, unknown>) {
    await this.historyModel.create({ companyId, userId: new Types.ObjectId(userId), userEmail, userName, action, entityType, entityId, description, previousValue, newValue });
  }

  // ========== DASHBOARD ==========
  async getDashboard(token: string, companyId: string) {
    const companyOid = new Types.ObjectId(companyId);
    const total = await this.commModel.countDocuments({ companyId }).exec();
    const published = await this.commModel.countDocuments({ companyId, status: 'PUBLISHED' }).exec();
    const drafts = await this.commModel.countDocuments({ companyId, status: 'DRAFT' }).exec();
    const unread = await this.recipientModel.countDocuments({ companyId, status: { $in: ['PENDING', 'DELIVERED'] } }).exec();
    const pendingSignatures = await this.recipientModel.countDocuments({ companyId, status: 'DELIVERED', communicationId: { $in: (await this.commModel.find({ companyId, requiresSignature: true }).distinct('_id').exec()) } }).exec();
    const pendingSurveys = await this.surveyResponseModel.countDocuments({ companyId }).exec();
    const totalRecipients = await this.recipientModel.countDocuments({ companyId }).exec();
    const totalRead = await this.receiptModel.countDocuments({ companyId }).exec();
    const mailboxPending = await this.mailboxModel.countDocuments({ companyId, status: 'PENDING' }).exec();
    const campaignsActive = await this.campaignModel.countDocuments({ companyId, status: 'ACTIVE' }).exec();

    return { totalCommunications: total, published, drafts, unread, pendingSignatures, pendingSurveys: 0, totalRecipients, totalRead, mailboxPending, campaignsActive, readRate: totalRecipients > 0 ? Math.round((totalRead / totalRecipients) * 100) : 0 };
  }

  async getAutoCompliance(companyId: string) {
    const published = await this.commModel.countDocuments({ companyId, status: 'PUBLISHED' }).exec();
    const totalRead = await this.receiptModel.countDocuments({ companyId }).exec();
    const totalRecipients = await this.recipientModel.countDocuments({ companyId }).exec();
    const hasComms = published > 0;
    const hasEvidence = totalRead > 0;
    const hasConfirmation = totalRecipients > 0 && totalRead > 0;
    const reasons: string[] = [];
    if (!hasComms) reasons.push('No hay comunicaciones publicadas');
    if (!hasEvidence) reasons.push('No hay comprobantes de lectura');
    if (!hasConfirmation) reasons.push('No hay confirmaciones de lectura registradas');
    const score = [hasComms, hasEvidence, hasConfirmation].filter(Boolean).length;
    return { complies: score === 3, reasons, score };
  }

  // ========== COMMUNICATIONS CRUD ==========
  async createComm(token: string, companyId: string, userId: string, userName: string | undefined, payload: any) {
    const created = await this.commModel.create({ companyId, ...payload, createdBy: new Types.ObjectId(userId), createdByName: userName, status: 'DRAFT' });
    await this.recordHistory(companyId, userId, '', userName, 'CREATE', 'Communication', created._id.toString(), `Comunicación creada: ${payload.title}`);
    return created;
  }

  async findAllComms(companyId: string) {
    return this.commModel.find({ companyId }).sort({ createdAt: -1 }).exec();
  }

  async findCommById(companyId: string, id: string) {
    const comm = await this.commModel.findOne({ _id: new Types.ObjectId(id), companyId }).exec();
    if (!comm) throw new NotFoundException('Communication not found');
    return comm;
  }

  async updateComm(companyId: string, id: string, payload: any) {
    const updated = await this.commModel.findOneAndUpdate({ _id: new Types.ObjectId(id), companyId }, { $set: payload }, { new: true }).exec();
    if (!updated) throw new NotFoundException('Communication not found');
    return updated;
  }

  async publishComm(token: string, companyId: string, id: string) {
    const comm = await this.commModel.findOneAndUpdate({ _id: new Types.ObjectId(id), companyId }, { $set: { status: 'PUBLISHED', publishedAt: new Date().toISOString() } }, { new: true }).exec();
    if (!comm) throw new NotFoundException('Communication not found');
    await this.recordHistory(companyId, '', '', '', 'PUBLISH', 'Communication', id, `Comunicación publicada: ${comm.title}`);
    await this.alertsService.create({ companyId, type: 'COMM_PUBLISHED', message: `Nueva comunicación: ${comm.title}`, severity: AlertSeverity.MEDIUM });
    return comm;
  }

  async archiveComm(companyId: string, id: string) {
    const comm = await this.commModel.findOneAndUpdate({ _id: new Types.ObjectId(id), companyId }, { $set: { status: 'ARCHIVED' } }, { new: true }).exec();
    if (!comm) throw new NotFoundException('Communication not found');
    return comm;
  }

  async deleteComm(companyId: string, id: string) {
    await this.commModel.findOneAndDelete({ _id: new Types.ObjectId(id), companyId }).exec();
    await this.recipientModel.deleteMany({ communicationId: new Types.ObjectId(id) }).exec();
    await this.receiptModel.deleteMany({ communicationId: new Types.ObjectId(id) }).exec();
    await this.signatureModel.deleteMany({ communicationId: new Types.ObjectId(id) }).exec();
  }

  // ========== RECIPIENTS ==========
  async getRecipients(companyId: string, commId: string) {
    return this.recipientModel.find({ companyId, communicationId: new Types.ObjectId(commId) }).exec();
  }

  async addRecipients(companyId: string, commId: string, employeeIds: string[]) {
    const comm = await this.commModel.findById(new Types.ObjectId(commId)).exec();
    if (!comm) throw new NotFoundException('Communication not found');
    const existing = await this.recipientModel.find({ communicationId: new Types.ObjectId(commId), employeeId: { $in: employeeIds.map((e) => new Types.ObjectId(e)) } }).exec();
    const existingIds = new Set(existing.map((r) => r.employeeId.toString()));
    const newRecipients = employeeIds.filter((e) => !existingIds.has(e)).map((empId) => ({ companyId, communicationId: new Types.ObjectId(commId), employeeId: new Types.ObjectId(empId), status: 'PENDING' as const }));
    if (newRecipients.length > 0) await this.recipientModel.insertMany(newRecipients);
    return this.recipientModel.find({ communicationId: new Types.ObjectId(commId) }).exec();
  }

  // ========== READ RECEIPTS ==========
  async registerRead(companyId: string, commId: string, employeeId: string, employeeName: string) {
    const existing = await this.receiptModel.findOne({ companyId, communicationId: new Types.ObjectId(commId), employeeId: new Types.ObjectId(employeeId) }).exec();
    if (existing) return existing;
    const now = new Date();
    const receipt = await this.receiptModel.create({
      companyId, communicationId: new Types.ObjectId(commId),
      employeeId: new Types.ObjectId(employeeId), employeeName,
      readDate: now.toISOString().slice(0, 10),
      readTime: now.toTimeString().slice(0, 8),
    });
    await this.recipientModel.updateOne(
      { companyId, communicationId: new Types.ObjectId(commId), employeeId: new Types.ObjectId(employeeId) },
      { $set: { status: 'READ', readAt: now.toISOString() } },
    ).exec();
    return receipt;
  }

  async getReadReceipts(companyId: string, commId: string) {
    return this.receiptModel.find({ companyId, communicationId: new Types.ObjectId(commId) }).sort({ readDate: -1 }).exec();
  }

  // ========== SIGNATURES ==========
  async addSignature(companyId: string, commId: string, employeeId: string, employeeName: string, employeeEmail: string, extra?: { signatureHash?: string; signatureUrl?: string; comments?: string }) {
    const sig = await this.signatureModel.create({
      companyId, communicationId: new Types.ObjectId(commId),
      employeeId: new Types.ObjectId(employeeId), employeeName, employeeEmail,
      signatureDate: new Date().toISOString(), isManadatorySigned: true,
      ...extra,
    });
    await this.recipientModel.updateOne(
      { companyId, communicationId: new Types.ObjectId(commId), employeeId: new Types.ObjectId(employeeId) },
      { $set: { status: 'SIGNED', signedAt: new Date().toISOString(), signatureId: sig._id } },
    ).exec();
    return sig;
  }

  async getSignatures(companyId: string, commId: string) {
    return this.signatureModel.find({ companyId, communicationId: new Types.ObjectId(commId) }).exec();
  }

  // ========== CAMPAIGNS ==========
  async createCampaign(companyId: string, payload: any) {
    return this.campaignModel.create({ companyId, ...payload });
  }

  async findAllCampaigns(companyId: string) {
    return this.campaignModel.find({ companyId }).sort({ createdAt: -1 }).exec();
  }

  async updateCampaign(companyId: string, id: string, payload: any) {
    return this.campaignModel.findOneAndUpdate({ _id: new Types.ObjectId(id), companyId }, { $set: payload }, { new: true }).exec();
  }

  async deleteCampaign(companyId: string, id: string) {
    await this.campaignModel.findOneAndDelete({ _id: new Types.ObjectId(id), companyId }).exec();
  }

  // ========== SURVEYS ==========
  async createSurvey(companyId: string, payload: any) {
    return this.surveyModel.create({ companyId, ...payload });
  }

  async findAllSurveys(companyId: string) {
    return this.surveyModel.find({ companyId }).sort({ createdAt: -1 }).exec();
  }

  async updateSurvey(companyId: string, id: string, payload: any) {
    return this.surveyModel.findOneAndUpdate({ _id: new Types.ObjectId(id), companyId }, { $set: payload }, { new: true }).exec();
  }

  async deleteSurvey(companyId: string, id: string) {
    await this.surveyModel.findOneAndDelete({ _id: new Types.ObjectId(id), companyId }).exec();
  }

  async submitSurveyResponse(companyId: string, payload: any) {
    const response = await this.surveyResponseModel.create({ companyId, ...payload });
    await this.surveyModel.findByIdAndUpdate(payload.surveyId, { $inc: { totalResponses: 1 } }).exec();
    return response;
  }

  async getSurveyResults(companyId: string, surveyId: string) {
    const survey = await this.surveyModel.findOne({ _id: new Types.ObjectId(surveyId), companyId }).exec();
    if (!survey) throw new NotFoundException('Survey not found');
    const responses = await this.surveyResponseModel.find({ surveyId: new Types.ObjectId(surveyId) }).exec();
    const stats = survey.questions.map((q) => {
      const answers = responses.flatMap((r) => r.answers.filter((a) => a.questionId === q.questionId));
      if (q.questionType === 'OPEN_TEXT') return { questionId: q.questionId, questionText: q.questionText, type: 'OPEN_TEXT', count: answers.length, answers: answers.map((a) => a.answer || '') };
      const optionCounts: Record<string, number> = {};
      q.options.forEach((opt) => { optionCounts[opt] = 0; });
      answers.forEach((a) => { a.selectedOptions?.forEach((opt) => { if (optionCounts[opt] !== undefined) optionCounts[opt]++; }); });
      if (answers.length && !answers.some((a) => a.selectedOptions?.length)) {
        answers.forEach((a) => { if (a.answer && optionCounts[a.answer] !== undefined) optionCounts[a.answer]++; });
      }
      return { questionId: q.questionId, questionText: q.questionText, type: q.questionType, total: answers.length, optionCounts };
    });
    return { survey, totalResponses: responses.length, stats };
  }

  async getSurveyStats(companyId: string, surveyId: string) {
    const responses = await this.surveyResponseModel.find({ companyId, surveyId: new Types.ObjectId(surveyId) }).exec();
    return { total: responses.length, participationRate: 0 };
  }

  // ========== MAILBOX ==========
  async createMailboxEntry(companyId: string, payload: any, employeeId?: string) {
    return this.mailboxModel.create({ companyId, ...payload, submittedBy: employeeId ? new Types.ObjectId(employeeId) : undefined });
  }

  async findAllMailbox(companyId: string, filterStatus?: string) {
    const filter: any = { companyId };
    if (filterStatus) filter.status = filterStatus;
    return this.mailboxModel.find(filter).sort({ createdAt: -1 }).exec();
  }

  async respondMailbox(companyId: string, id: string, response: string, respondedBy: string) {
    const updated = await this.mailboxModel.findOneAndUpdate(
      { _id: new Types.ObjectId(id), companyId },
      { $set: { response, respondedBy, respondedAt: new Date().toISOString(), status: 'RESOLVED' } },
      { new: true },
    ).exec();
    if (!updated) throw new NotFoundException('Mailbox entry not found');
    return updated;
  }

  async deleteMailboxEntry(companyId: string, id: string) {
    await this.mailboxModel.findOneAndDelete({ _id: new Types.ObjectId(id), companyId }).exec();
  }

  // ========== HISTORY ==========
  async getHistory(companyId: string, limit = 100, skip = 0) {
    return this.historyModel.find({ companyId }).sort({ createdAt: -1 }).skip(skip).limit(limit).exec();
  }

  async getEntityHistory(entityType: string, entityId: string) {
    return this.historyModel.find({ entityType, entityId }).sort({ createdAt: -1 }).exec();
  }

  // ========== ALERTS ENGINE ==========
  async checkAlerts(companyId: string) {
    const alerts: string[] = [];
    const companyOid = new Types.ObjectId(companyId);

    // Unread communications
    const unread = await this.recipientModel.countDocuments({ companyId, status: { $in: ['PENDING', 'DELIVERED'] } }).exec();
    if (unread > 0) {
      await this.alertsService.create({ companyId, type: 'COMM_UNREAD', message: `${unread} comunicación(es) sin leer`, severity: AlertSeverity.MEDIUM });
      alerts.push(`${unread} comunicación(es) sin leer`);
    }

    // Pending signatures
    const pendingSig = await this.recipientModel.countDocuments({ companyId, status: 'DELIVERED', communicationId: { $in: (await this.commModel.find({ companyId, requiresSignature: true }).distinct('_id').exec()) } }).exec();
    if (pendingSig > 0) {
      await this.alertsService.create({ companyId, type: 'COMM_PENDING_SIGNATURE', message: `${pendingSig} comunicación(es) requieren firma`, severity: AlertSeverity.HIGH });
      alerts.push(`${pendingSig} comunicación(es) requieren firma`);
    }

    // Mailbox pending
    const mailboxPending = await this.mailboxModel.countDocuments({ companyId, status: 'PENDING' }).exec();
    if (mailboxPending > 0) {
      await this.alertsService.create({ companyId, type: 'COMM_MAILBOX_PENDING', message: `${mailboxPending} solicitud(es) en bandeja SST pendientes`, severity: AlertSeverity.LOW });
      alerts.push(`${mailboxPending} solicitud(es) en bandeja SST`);
    }

    // Pending surveys
    const pendingSurveys = await this.surveyResponseModel.countDocuments({ companyId }).exec();
    if (pendingSurveys > 0) {
      // Just notify - surveys have responses
    }

    return alerts;
  }
}
