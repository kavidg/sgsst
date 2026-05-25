import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AlertsService } from '../alerts/alerts.service';
import { AlertSeverity } from '../alerts/schemas/alert.schema';
import { UserDocument } from '../users/schemas/user.schema';
import { UpdateResponsableSstDto } from './dto/update-responsable-sst.dto';
import {
  PhvaAdvancedResponsableSst,
  PhvaAdvancedResponsableSstDocument,
  ResponsableSstComplianceStatus,
  ResponsableSstDocumentType,
  ResponsableSstStoredDocument,
} from './schemas/phva-advanced-responsable-sst.schema';
import {
  PhvaAdvancedResponsibilities,
  PhvaAdvancedResponsibilitiesDocument,
  ResponsibilitiesComplianceStatus,
  ResponsibilityAssignmentEntry,
} from './schemas/phva-advanced-responsibilities.schema';
import {
  PhvaAdvancedResourceAssignment,
  PhvaAdvancedResourceAssignmentDocument,
  ResourceAssignmentComplianceStatus,
} from './schemas/phva-advanced-resource-assignment.schema';
import { UpdateResourceAssignmentDto } from './dto/update-resource-assignment.dto';
import { UpdateArlAffiliationsDto } from './dto/update-arl-affiliations.dto';
import { ArlComplianceStatus, PhvaAdvancedArlAffiliations, PhvaAdvancedArlAffiliationsDocument } from './schemas/phva-advanced-arl-affiliations.schema';
import { SpecialPensionComplianceStatus, SpecialPensionConfiguration, SpecialPensionConfigurationDocument } from './schemas/phva-advanced-special-pension.schema';

const REQUIRED_TEXT_FIELDS: Array<keyof UpdateResponsableSstDto> = [
  'fullName',
  'documentNumber',
  'position',
  'profession',
  'sstProfessionalType',
  'sstLicenseNumber',
  'licenseExpiresAt',
  'course50HoursDate',
];

@Injectable()
export class PhvaAdvancedService {
  constructor(
    @InjectModel(PhvaAdvancedResponsableSst.name)
    private readonly responsableSstModel: Model<PhvaAdvancedResponsableSstDocument>,
    @InjectModel(PhvaAdvancedResponsibilities.name)
    private readonly responsibilitiesModel: Model<PhvaAdvancedResponsibilitiesDocument>,
    @InjectModel(PhvaAdvancedResourceAssignment.name)
    private readonly resourceAssignmentModel: Model<PhvaAdvancedResourceAssignmentDocument>,
    @InjectModel(PhvaAdvancedArlAffiliations.name)
    private readonly arlAffiliationsModel: Model<PhvaAdvancedArlAffiliationsDocument>,
    @InjectModel(SpecialPensionConfiguration.name)
    private readonly specialPensionModel: Model<SpecialPensionConfigurationDocument>,
    private readonly alertsService: AlertsService,
  ) {}

  async findOrCreateResourceAssignment(companyId: Types.ObjectId) {
    const current = await this.resourceAssignmentModel.findOne({ companyId, itemCode: '1.1.3' }).exec();
    if (current) return current;
    return this.resourceAssignmentModel.create({ companyId, itemCode: '1.1.3' });
  }

  async updateResourceAssignment(companyId: Types.ObjectId, user: UserDocument, dto: UpdateResourceAssignmentDto) {
    const record = await this.findOrCreateResourceAssignment(companyId);
    const before = JSON.stringify({
      financial: record.financialResources.length,
      human: record.humanResources.length,
      technical: record.technicalResources.length,
      evidences: record.evidences.length,
      approved: record.approval?.approved ?? false,
    });
    if (dto.financialResources) record.financialResources = dto.financialResources as never;
    if (dto.humanResources) record.humanResources = dto.humanResources as never;
    if (dto.technicalResources) record.technicalResources = dto.technicalResources as never;
    if (dto.activities) record.activities = dto.activities as never;
    if (dto.evidences) record.evidences = dto.evidences as never;
    if (dto.approval) record.approval = { ...record.approval, ...dto.approval, signedAt: dto.approval.signedAt ? new Date(dto.approval.signedAt) : record.approval?.signedAt };
    const hasFinancial = record.financialResources.length > 0;
    const hasHuman = record.humanResources.some((entry) => entry.active);
    const hasTechnical = record.technicalResources.length > 0;
    const hasEvidence = record.evidences.length > 0 || record.financialResources.some((entry) => entry.evidence?.fileUrl) || record.technicalResources.some((entry) => entry.evidence?.fileUrl);
    const hasManagerApproval = Boolean(record.approval?.approved && record.approval.signatureImage);
    record.alerts = [
      ...(!hasManagerApproval ? ['Firma gerencial pendiente'] : []),
      ...(!hasEvidence ? ['Evidencia faltante'] : []),
      ...record.technicalResources.filter((entry) => !entry.responsible).map((entry) => `Recurso sin responsable: ${entry.name}`),
    ];
    record.complianceStatus = hasFinancial && hasHuman && hasTechnical && hasEvidence && hasManagerApproval
      ? ResourceAssignmentComplianceStatus.COMPLIES
      : (hasFinancial || hasHuman || hasTechnical ? ResourceAssignmentComplianceStatus.PENDING : ResourceAssignmentComplianceStatus.NON_COMPLIANT);
    record.complianceReason = hasManagerApproval
      ? 'Validación automática completada para recursos SG-SST.'
      : 'Pendiente aprobación/firma gerencial y/o evidencias.';
    record.auditHistory.push({
      field: 'resourceAssignment',
      oldValue: before,
      newValue: JSON.stringify({
        financial: record.financialResources.length,
        human: record.humanResources.length,
        technical: record.technicalResources.length,
        evidences: record.evidences.length,
        approved: record.approval?.approved ?? false,
      }),
      user: user.email,
      timestamp: new Date(),
    });
    await record.save();
    return record;
  }

  async findOrCreateResponsibilities(companyId: Types.ObjectId) {
    const current = await this.responsibilitiesModel.findOne({ companyId, itemCode: '1.1.2' }).exec();
    if (current) return current;
    return this.responsibilitiesModel.create({ companyId, itemCode: '1.1.2' });
  }

  async updateResponsibilities(companyId: Types.ObjectId, user: UserDocument, responsibilities: ResponsibilityAssignmentEntry[]) {
    const record = await this.findOrCreateResponsibilities(companyId);
    record.responsibilities = responsibilities;
    const active = responsibilities.filter((entry) => entry.active);
    const unassigned = active.filter((entry) => !entry.employeeId);
    const pendingSignatures = active.filter((entry) => entry.requiresSignature && !entry.signature?.signedAt);
    const coverageMissing = ['MANAGER', 'ADMIN', 'MEMBER'].some((role) => !active.some((entry) => entry.role === role));
    record.alerts = [
      ...unassigned.map((entry) => `Responsabilidad sin asignar: ${entry.title}`),
      ...pendingSignatures.map((entry) => `Usuario con firma pendiente: ${entry.title}`),
      ...(coverageMissing ? ['Cargo sin responsabilidades activas.'] : []),
    ];
    record.complianceStatus = active.length && !unassigned.length && !pendingSignatures.length && !coverageMissing
      ? ResponsibilitiesComplianceStatus.COMPLIES
      : (active.length ? ResponsibilitiesComplianceStatus.PENDING : ResponsibilitiesComplianceStatus.NON_COMPLIANT);
    record.complianceReason = record.complianceStatus === ResponsibilitiesComplianceStatus.COMPLIES
      ? 'Cumple con responsabilidades, asignaciones y firmas requeridas.'
      : 'Pendiente completar asignaciones, cobertura por cargo y firmas.';
    record.auditHistory.push({
      userId: this.resolveUserId(user),
      userEmail: user.email,
      changedAt: new Date(),
      field: 'responsibilities',
      oldValue: `${record.responsibilities.length}`,
      newValue: `${responsibilities.length}`,
    });
    record.updatedBy = this.resolveUserId(user);
    return record.save();
  }

  async findOrCreateResponsableSst(companyId: Types.ObjectId) {
    const current = await this.responsableSstModel.findOne({ companyId, itemCode: '1.1.1' }).exec();
    if (current) return current;

    return this.responsableSstModel.create({ companyId, itemCode: '1.1.1' });
  }

  async updateResponsableSst(companyId: Types.ObjectId, user: UserDocument, dto: UpdateResponsableSstDto) {
    const record = await this.findOrCreateResponsableSst(companyId);
    const auditEntries = this.buildAuditEntries(record, dto, user);

    for (const [key, value] of Object.entries(dto) as Array<[keyof UpdateResponsableSstDto, string | undefined]>) {
      if (value === undefined) continue;
      if (key.endsWith('Date') || key === 'licenseExpiresAt' || key === 'course50HoursDetectedDate') {
        (record as unknown as Record<string, Date | undefined>)[key] = this.parseOptionalDate(value, key);
      } else {
        (record as unknown as Record<string, string>)[key] = value;
      }
    }

    if (dto.course50HoursDetectedDate && dto.course50HoursDate && dto.course50HoursDetectedDate !== dto.course50HoursDate) {
      auditEntries.push({
        userId: this.resolveUserId(user),
        userEmail: user.email,
        changedAt: new Date(),
        field: 'course50HoursDate',
        oldValue: dto.course50HoursDetectedDate,
        newValue: dto.course50HoursDate,
        warning: 'El usuario cambió manualmente la fecha detectada del certificado de 50 horas.',
      });
    }

    record.requires20HourUpdate = this.isCourseOlderThanThreeYears(record.course50HoursDate);
    const compliance = this.calculateCompliance(record);
    record.complianceStatus = compliance.status;
    record.complianceReason = compliance.reason;
    record.alerts = this.buildAlertSchedule(record);
    record.auditHistory.push(...auditEntries);
    record.updatedBy = this.resolveUserId(user);

    await record.save();
    await this.generateAlerts(record);
    return record;
  }

  async attachDocument(params: {
    companyId: Types.ObjectId;
    user: UserDocument;
    type: ResponsableSstDocumentType;
    fileName: string;
    fileUrl: string;
    finalUserDate?: string;
  }) {
    const record = await this.findOrCreateResponsableSst(params.companyId);
    const detectedDate = params.type === ResponsableSstDocumentType.FIFTY_HOUR_CERTIFICATE
      ? this.detectDateFromFileName(params.fileName)
      : undefined;
    const finalDate = this.parseOptionalDate(params.finalUserDate, 'finalUserDate') ?? detectedDate;
    const previousDocument = record.documents.find((document) => document.type === params.type);

    const storedDocument: ResponsableSstStoredDocument = {
      type: params.type,
      fileName: params.fileName,
      fileUrl: params.fileUrl,
      detectedDate,
      uploadedBy: this.resolveUserId(params.user),
      uploadedAt: new Date(),
    };

    record.documents = [
      ...record.documents.filter((document) => document.type !== params.type),
      storedDocument,
    ];

    if (params.type === ResponsableSstDocumentType.FIFTY_HOUR_CERTIFICATE) {
      record.course50HoursDetectedDate = detectedDate;
      if (finalDate) record.course50HoursDate = finalDate;

      if (detectedDate && finalDate && !this.isSameDay(detectedDate, finalDate)) {
        record.auditHistory.push({
          userId: this.resolveUserId(params.user),
          userEmail: params.user.email,
          changedAt: new Date(),
          field: 'course50HoursDate',
          oldValue: this.toDateOnly(detectedDate),
          newValue: this.toDateOnly(finalDate),
          warning: 'La fecha final registrada difiere de la fecha detectada automáticamente en el certificado de 50 horas.',
        });
      }
    }

    record.auditHistory.push({
      userId: this.resolveUserId(params.user),
      userEmail: params.user.email,
      changedAt: new Date(),
      field: `documents.${params.type}`,
      oldValue: previousDocument?.fileName ?? '',
      newValue: params.fileName,
    });

    record.requires20HourUpdate = this.isCourseOlderThanThreeYears(record.course50HoursDate);
    const compliance = this.calculateCompliance(record);
    record.complianceStatus = compliance.status;
    record.complianceReason = compliance.reason;
    record.alerts = this.buildAlertSchedule(record);
    record.updatedBy = this.resolveUserId(params.user);

    await record.save();
    await this.generateAlerts(record);
    return record;
  }

  async auditHistory(companyId: Types.ObjectId) {
    const record = await this.responsableSstModel.findOne({ companyId, itemCode: '1.1.1' }).exec();
    if (!record) throw new NotFoundException('Gestión avanzada no encontrada');
    return record.auditHistory.sort((left, right) => right.changedAt.getTime() - left.changedAt.getTime());
  }

  private calculateCompliance(record: PhvaAdvancedResponsableSstDocument): { status: ResponsableSstComplianceStatus; reason: string } {
    const missingFields = REQUIRED_TEXT_FIELDS.filter((field) => !String((record as unknown as Record<string, unknown>)[field] ?? '').trim());
    const hasDiploma = record.documents.some((document) => document.type === ResponsableSstDocumentType.DIPLOMA);
    const has50HourCertificate = record.documents.some((document) => document.type === ResponsableSstDocumentType.FIFTY_HOUR_CERTIFICATE);
    const has20HourCertificate = record.documents.some((document) => document.type === ResponsableSstDocumentType.TWENTY_HOUR_UPDATE_CERTIFICATE);
    const licenseValid = Boolean(record.licenseExpiresAt && record.licenseExpiresAt >= this.startOfToday());
    const courseExpired = this.isCourseOlderThanThreeYears(record.course50HoursDate);

    if (missingFields.length || !hasDiploma || !has50HourCertificate || (courseExpired && (!record.course20HoursDate || !has20HourCertificate)) || !licenseValid) {
      const reasons = [
        missingFields.length ? `Campos requeridos pendientes: ${missingFields.join(', ')}` : '',
        !hasDiploma ? 'Diploma pendiente.' : '',
        !has50HourCertificate ? 'Certificado de curso 50 horas pendiente.' : '',
        courseExpired && !record.course20HoursDate ? 'Fecha curso 20 horas requerida.' : '',
        courseExpired && !has20HourCertificate ? 'Certificado de actualización 20 horas requerido.' : '',
        !licenseValid ? 'Licencia SST no vigente o sin fecha válida.' : '',
      ].filter(Boolean);

      return {
        status: reasons.some((reason) => reason.includes('no vigente')) ? ResponsableSstComplianceStatus.NON_COMPLIANT : ResponsableSstComplianceStatus.PENDING,
        reason: reasons.join(' '),
      };
    }

    return { status: ResponsableSstComplianceStatus.COMPLIES, reason: 'Cumple validaciones avanzadas del responsable SG-SST.' };
  }

  private buildAlertSchedule(record: PhvaAdvancedResponsableSstDocument) {
    const alerts: Array<{ type: string; message: string; severity: string; dueAt: Date; generated: boolean }> = [];
    if (record.licenseExpiresAt) {
      for (const days of [30, 15, 5, 1]) {
        alerts.push({
          type: `PHVA_RESPONSABLE_SST_LICENSE_${days}_DAYS`,
          message: `La licencia SST vence en ${days} día(s).`,
          severity: days <= 5 ? AlertSeverity.HIGH : AlertSeverity.MEDIUM,
          dueAt: this.addDays(record.licenseExpiresAt, -days),
          generated: false,
        });
      }
      if (record.licenseExpiresAt < this.startOfToday()) {
        alerts.push({ type: 'PHVA_RESPONSABLE_SST_LICENSE_EXPIRED', message: 'Licencia expirada.', severity: AlertSeverity.HIGH, dueAt: new Date(), generated: false });
      }
    }
    if (this.isCourseOlderThanThreeYears(record.course50HoursDate)) {
      alerts.push({ type: 'PHVA_RESPONSABLE_SST_COURSE_EXPIRED', message: 'Curso vencido: requiere actualización 20 horas.', severity: AlertSeverity.HIGH, dueAt: new Date(), generated: false });
    }
    return alerts;
  }

  private async generateAlerts(record: PhvaAdvancedResponsableSstDocument) {
    const today = this.startOfToday();
    await Promise.all(record.alerts
      .filter((alert) => alert.dueAt <= today)
      .map((alert) => this.alertsService.createUnique({
        companyId: record.companyId,
        type: alert.type,
        message: `PHVA 1.1.1 · ${alert.message}`,
        severity: alert.severity as AlertSeverity,
      })));
  }

  private resolveUserId(user: UserDocument): Types.ObjectId {
    return (user as unknown as { _id: Types.ObjectId })._id;
  }

  private buildAuditEntries(record: PhvaAdvancedResponsableSstDocument, dto: UpdateResponsableSstDto, user: UserDocument) {
    const entries = [] as Array<{ userId?: Types.ObjectId; userEmail?: string; changedAt: Date; field: string; oldValue?: string; newValue?: string; warning?: string }>;
    for (const [key, value] of Object.entries(dto)) {
      const oldValue = this.normalizeValue((record as unknown as Record<string, unknown>)[key]);
      const newValue = this.normalizeValue(value);
      if (oldValue !== newValue) {
        entries.push({ userId: this.resolveUserId(user), userEmail: user.email, changedAt: new Date(), field: key, oldValue, newValue });
      }
    }
    return entries;
  }

  private detectDateFromFileName(fileName: string): Date | undefined {
    const normalized = fileName.replace(/_/g, '-');
    const iso = normalized.match(/(20\d{2}|19\d{2})[-./](0?[1-9]|1[0-2])[-./](0?[1-9]|[12]\d|3[01])/);
    if (iso) return this.parseOptionalDate(`${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`, 'detectedDate');
    const latam = normalized.match(/(0?[1-9]|[12]\d|3[01])[-./](0?[1-9]|1[0-2])[-./](20\d{2}|19\d{2})/);
    if (latam) return this.parseOptionalDate(`${latam[3]}-${latam[2].padStart(2, '0')}-${latam[1].padStart(2, '0')}`, 'detectedDate');
    return undefined;
  }

  private parseOptionalDate(value: string | undefined, fieldName: string): Date | undefined {
    if (!value) return undefined;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) throw new BadRequestException(`Fecha inválida para ${fieldName}`);
    return parsed;
  }

  private isCourseOlderThanThreeYears(date?: Date) {
    if (!date) return false;
    return this.addYears(date, 3) < this.startOfToday();
  }

  private addYears(date: Date, years: number) {
    const next = new Date(date);
    next.setUTCFullYear(next.getUTCFullYear() + years);
    return next;
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  private startOfToday() {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  private isSameDay(left: Date, right: Date) {
    return this.toDateOnly(left) === this.toDateOnly(right);
  }

  private normalizeValue(value: unknown) {
    if (value instanceof Date) return this.toDateOnly(value);
    return String(value ?? '');
  }

  private toDateOnly(date?: Date) {
    return date ? date.toISOString().slice(0, 10) : '';
  }

  async findOrCreateArlAffiliations(companyId: Types.ObjectId) {
    const current = await this.arlAffiliationsModel.findOne({ companyId, itemCode: '1.1.4' }).exec();
    if (current) return current;
    return this.arlAffiliationsModel.create({ companyId, itemCode: '1.1.4' });
  }

  async updateArlAffiliations(companyId: Types.ObjectId, user: UserDocument, dto: UpdateArlAffiliationsDto) {
    const record = await this.findOrCreateArlAffiliations(companyId);
    const before = JSON.stringify({ employees: record.employees.length, periods: record.socialSecurityPeriods.length, docs: record.companyDocuments.length });
    if (dto.employees) record.employees = dto.employees.map((e) => ({ ...e, affiliationDate: e.affiliationDate ? new Date(e.affiliationDate) : undefined, retirementDate: e.retirementDate ? new Date(e.retirementDate) : undefined })) as never;
    if (dto.companyDocuments) record.companyDocuments = dto.companyDocuments.map((d) => ({ ...d, uploadedAt: d.uploadedAt ? new Date(d.uploadedAt) : new Date() })) as never;
    if (dto.socialSecurityPeriods) record.socialSecurityPeriods = dto.socialSecurityPeriods.map((p) => ({ ...p, paymentDate: p.paymentDate ? new Date(p.paymentDate) : undefined })) as never;

    const activeEmployees = record.employees.filter((e) => e.affiliationStatus !== 'INACTIVE');
    const missingArl = activeEmployees.filter((e) => !e.arlName);
    const missingRisk = activeEmployees.filter((e) => !e.riskClass);
    const missingEvidence = activeEmployees.filter((e) => !e.evidences?.length);
    const inactiveAffiliation = activeEmployees.filter((e) => e.affiliationStatus !== 'ACTIVE');
    const pendingPeriods = record.socialSecurityPeriods.filter((p) => p.status !== 'PAGADO');

    record.alerts = [
      ...missingArl.map((e) => `Empleado sin ARL: ${e.employeeName}`),
      ...missingRisk.map((e) => `Clase de riesgo faltante: ${e.employeeName}`),
      ...missingEvidence.map((e) => `Evidencia faltante: ${e.employeeName}`),
      ...inactiveAffiliation.map((e) => `Afiliación inactiva o pendiente: ${e.employeeName}`),
      ...pendingPeriods.map((p) => `Seguridad social pendiente: ${p.period}`),
    ];

    const hasCritical = missingArl.length > 0 || inactiveAffiliation.length > 0;
    const complete = activeEmployees.length > 0 && !record.alerts.length && record.companyDocuments.length > 0 && record.socialSecurityPeriods.length > 0;
    record.complianceStatus = complete ? ArlComplianceStatus.COMPLIES : (hasCritical ? ArlComplianceStatus.NON_COMPLIANT : ArlComplianceStatus.PENDING);

    record.auditHistory.push({ field: 'arlAffiliations', oldValue: before, newValue: JSON.stringify({ employees: record.employees.length, periods: record.socialSecurityPeriods.length, docs: record.companyDocuments.length }), user: user.email, timestamp: new Date() });
    await record.save();
    return record;
  }


  async findOrCreateSpecialPension(companyId: Types.ObjectId) {
    const current = await this.specialPensionModel.findOne({ companyId, itemCode: '1.1.5' }).exec();
    if (current) return current;
    return this.specialPensionModel.create({ companyId, itemCode: '1.1.5', enabled: false });
  }

  async updateSpecialPension(companyId: Types.ObjectId, user: UserDocument, dto: { enabled?: boolean; records?: Array<{ employeeId: string; employeeName?: string; position?: string; highRiskType?: string; requiresSpecialContribution?: boolean; contributionStatus?: string; startDate?: string; observations?: string; supportDocument?: string }>; documents?: Array<{ type: string; fileName: string; fileUrl: string; uploadedAt?: string }> }) {
    const record = await this.findOrCreateSpecialPension(companyId);
    if (dto.enabled !== undefined) record.enabled = dto.enabled;
    if (dto.records) record.records = dto.records.map((r) => ({ ...r, startDate: r.startDate ? new Date(r.startDate) : undefined })) as never;
    if (dto.documents) record.documents = dto.documents.map((d) => ({ ...d, uploadedAt: d.uploadedAt ? new Date(d.uploadedAt) : new Date() })) as never;

    if (!record.enabled) {
      record.warnings = [];
      record.alerts = [];
      record.complianceStatus = SpecialPensionComplianceStatus.COMPLIES;
      await record.save();
      return record;
    }

    const incomplete = record.records.filter((r) => !r.employeeId || !r.employeeName || !r.position || !r.highRiskType || !r.startDate);
    const highRiskWithout = record.records.filter((r) => r.requiresSpecialContribution && r.contributionStatus !== 'COMPLETED');
    const docsMissing = record.documents.length === 0;
    record.warnings = [
      ...(highRiskWithout.length ? ['Trabajador alto riesgo sin cotización'] : []),
      ...(docsMissing ? ['Documento faltante'] : []),
      ...(incomplete.length ? ['Registro incompleto'] : []),
    ];
    record.alerts = [
      ...highRiskWithout.map((r) => `Cotización especial pendiente: ${r.employeeName}`),
      ...(docsMissing ? ['Documento faltante'] : []),
      ...record.documents.filter((d) => d.uploadedAt && this.addDays(d.uploadedAt, 365) < new Date()).map((d) => `Soporte vencido: ${d.fileName}`),
      ...highRiskWithout.map((r) => `Trabajador crítico sin cotización registrada: ${r.employeeName}`),
    ];
    const hasCompleted = record.records.some((r) => r.contributionStatus === 'COMPLETED');
    const complete = record.records.length > 0 && !docsMissing && hasCompleted && highRiskWithout.length === 0 && incomplete.length === 0;
    record.complianceStatus = complete ? SpecialPensionComplianceStatus.COMPLIES : (record.records.length ? SpecialPensionComplianceStatus.PENDING : SpecialPensionComplianceStatus.NON_COMPLIANT);
    record.auditHistory = [...(record.auditHistory ?? []), { field: 'specialPension', oldValue: '', newValue: JSON.stringify({ enabled: record.enabled, records: record.records.length, docs: record.documents.length }), user: user.email, timestamp: new Date() }];
    await record.save();
    return record;
  }

}
