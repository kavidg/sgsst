import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AlertsService } from '../alerts/alerts.service';
import { Company, CompanyDocument } from '../companies/schemas/company.schema';
import { Employee, EmployeeDocument } from '../employees/schemas/employee.schema';
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
import { TrainingManagement, TrainingManagementDocument } from './schemas/phva-advanced-training-management.schema';
import { PolicySignatureStatus, PolicySocializationStatus, SstPolicy, SstPolicyDocument, SstPolicyStatus } from './schemas/phva-advanced-sst-policy.schema';

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
    @InjectModel(TrainingManagement.name)
    private readonly trainingManagementModel: Model<TrainingManagementDocument>,
    @InjectModel(SstPolicy.name)
    private readonly sstPolicyModel: Model<SstPolicyDocument>,
    @InjectModel(Company.name)
    private readonly companyModel: Model<CompanyDocument>,
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
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



  async findOrCreateSstPolicy(companyId: Types.ObjectId) {
    const current = await this.sstPolicyModel.findOne({ companyId, itemCode: '2.1.1' }).exec();
    if (current) return this.refreshSstPolicyCompliance(current);
    const documentCode = await this.nextPolicyCode(companyId);
    const record = await this.sstPolicyModel.create({
      companyId,
      itemCode: '2.1.1',
      documentCode,
      documentName: 'Política de Seguridad y Salud en el Trabajo',
      currentVersion: '1.0',
      status: SstPolicyStatus.DRAFT,
      signatures: this.defaultPolicySignatures(),
      history: [{ action: 'CREATE', date: new Date(), newValue: documentCode }],
    });
    return this.refreshSstPolicyCompliance(record);
  }

  async generateSstPolicy(companyId: Types.ObjectId, user: UserDocument) {
    const record = await this.findOrCreateSstPolicy(companyId);
    const company = await this.companyModel.findById(companyId).exec();
    const employeesCount = await this.employeeModel.countDocuments({ companyId }).exec();
    const representative = record.signatures.find((signature) => signature.role === 'Representante legal')?.signerName || 'Representante legal';
    record.documentName = record.documentName || 'Política de Seguridad y Salud en el Trabajo';
    record.content = [
      `POLÍTICA DE SEGURIDAD Y SALUD EN EL TRABAJO`,
      `Empresa: ${company?.name ?? 'Nombre empresa'} · NIT: ${company?.nit ?? 'NIT'}`,
      `Representante legal: ${representative}`,
      `Actividad económica: Actividad económica de la empresa`,
      `Número de trabajadores: ${employeesCount}`,
      '',
      'La alta dirección se compromete con la protección de la seguridad y salud de todos los trabajadores, contratistas y partes interesadas, mediante la identificación de peligros, valoración y control de riesgos, prevención de accidentes y enfermedades laborales, cumplimiento de la normatividad aplicable y mejora continua del SG-SST.',
      '',
      'Esta política será comunicada, publicada, revisada como mínimo una vez al año y actualizada cuando cambien las condiciones de la organización o los requisitos legales aplicables.',
    ].join('\n');
    if (!record.versions.some((version) => version.version === record.currentVersion)) {
      record.versions.push({ version: record.currentVersion, content: record.content, status: record.status, issuedAt: new Date(), archived: false, createdBy: this.resolveUserId(user) } as never);
    }
    this.pushPolicyHistory(record, user, 'GENERATE_TEMPLATE', '', record.content);
    return this.saveSstPolicyWithCompliance(record);
  }

  async updateSstPolicy(companyId: Types.ObjectId, user: UserDocument, dto: Partial<SstPolicy> & { issuedAt?: string; approvedAt?: string; expiresAt?: string }) {
    const record = await this.findOrCreateSstPolicy(companyId);
    const before = JSON.stringify({ documentCode: record.documentCode, documentName: record.documentName, version: record.currentVersion, status: record.status });
    if (dto.documentCode) record.documentCode = dto.documentCode;
    if (dto.documentName) record.documentName = dto.documentName;
    if (dto.currentVersion) record.currentVersion = dto.currentVersion;
    if (dto.status) record.status = dto.status as SstPolicyStatus;
    if (dto.content !== undefined) record.content = dto.content;
    const currentVersion = this.currentPolicyVersion(record);
    if (currentVersion) {
      currentVersion.content = record.content ?? currentVersion.content;
      currentVersion.status = record.status;
      currentVersion.issuedAt = this.parseOptionalDate(dto.issuedAt, 'issuedAt') ?? currentVersion.issuedAt;
      currentVersion.approvedAt = this.parseOptionalDate(dto.approvedAt, 'approvedAt') ?? currentVersion.approvedAt;
      currentVersion.expiresAt = this.parseOptionalDate(dto.expiresAt, 'expiresAt') ?? currentVersion.expiresAt;
    } else {
      record.versions.push({
        version: record.currentVersion,
        content: record.content ?? '',
        status: record.status,
        issuedAt: this.parseOptionalDate(dto.issuedAt, 'issuedAt'),
        approvedAt: this.parseOptionalDate(dto.approvedAt, 'approvedAt'),
        expiresAt: this.parseOptionalDate(dto.expiresAt, 'expiresAt'),
        archived: false,
        createdBy: this.resolveUserId(user),
      } as never);
    }
    this.pushPolicyHistory(record, user, 'UPDATE', before, JSON.stringify({ documentCode: record.documentCode, documentName: record.documentName, version: record.currentVersion, status: record.status }));
    return this.saveSstPolicyWithCompliance(record);
  }

  async createSstPolicyVersion(companyId: Types.ObjectId, user: UserDocument) {
    const record = await this.findOrCreateSstPolicy(companyId);
    const current = this.currentPolicyVersion(record);
    if (current) current.archived = true;
    const next = this.incrementVersion(record.currentVersion);
    record.currentVersion = next;
    record.status = SstPolicyStatus.DRAFT;
    record.signatures = this.defaultPolicySignatures();
    record.socializations = [];
    record.versions.push({ version: next, content: record.content ?? '', status: SstPolicyStatus.DRAFT, issuedAt: new Date(), archived: false, createdBy: this.resolveUserId(user) } as never);
    this.pushPolicyHistory(record, user, 'NEW_VERSION', current?.version ?? '', next);
    return this.saveSstPolicyWithCompliance(record);
  }

  async archiveSstPolicyVersion(companyId: Types.ObjectId, user: UserDocument, version: string) {
    const record = await this.findOrCreateSstPolicy(companyId);
    const target = record.versions.find((entry) => entry.version === version);
    if (!target) throw new NotFoundException('Versión de política no encontrada');
    target.archived = true;
    target.status = SstPolicyStatus.ARCHIVED;
    if (record.currentVersion === version) record.status = SstPolicyStatus.ARCHIVED;
    this.pushPolicyHistory(record, user, 'ARCHIVE_VERSION', version, 'Archivado');
    return this.saveSstPolicyWithCompliance(record);
  }

  async updateSstPolicySignature(companyId: Types.ObjectId, user: UserDocument, dto: { role: string; signerName?: string; signerEmail?: string; required?: boolean; status?: PolicySignatureStatus; evidence?: string; rejectionReason?: string }) {
    const record = await this.findOrCreateSstPolicy(companyId);
    const signature = record.signatures.find((entry) => entry.role === dto.role);
    if (!signature) {
      record.signatures.push({ role: dto.role, signerName: dto.signerName || dto.role, signerEmail: dto.signerEmail || user.email, required: dto.required ?? false, status: dto.status ?? PolicySignatureStatus.PENDING, signedAt: dto.status === PolicySignatureStatus.SIGNED ? new Date() : undefined, evidence: dto.evidence, rejectionReason: dto.rejectionReason } as never);
    } else {
      Object.assign(signature, { ...dto, signedAt: dto.status === PolicySignatureStatus.SIGNED ? new Date() : signature.signedAt });
    }
    this.pushPolicyHistory(record, user, 'SIGNATURE', dto.role, dto.status ?? 'Actualizada');
    return this.saveSstPolicyWithCompliance(record);
  }

  async approveSstPolicy(companyId: Types.ObjectId, user: UserDocument) {
    const record = await this.findOrCreateSstPolicy(companyId);
    const missingRequired = record.signatures.filter((signature) => signature.required && signature.status !== PolicySignatureStatus.SIGNED);
    if (missingRequired.length) throw new BadRequestException('La política no puede aprobarse sin firmas obligatorias.');
    record.status = SstPolicyStatus.APPROVED;
    const current = this.currentPolicyVersion(record);
    if (current) {
      current.status = SstPolicyStatus.APPROVED;
      current.approvedAt = new Date();
      current.expiresAt = current.expiresAt ?? this.addYears(new Date(), 1);
      current.approvedBy = this.resolveUserId(user);
    }
    await this.ensurePolicySocialization(record);
    this.pushPolicyHistory(record, user, 'APPROVE', '', record.currentVersion);
    return this.saveSstPolicyWithCompliance(record);
  }

  async assignSstPolicySocialization(companyId: Types.ObjectId, user: UserDocument, dto: { mode?: 'all' | 'selected' | 'area'; employeeIds?: string[]; area?: string }) {
    const record = await this.findOrCreateSstPolicy(companyId);
    const query: Record<string, unknown> = { companyId, status: 'Activo' };
    if (dto.mode === 'selected') query._id = { $in: (dto.employeeIds ?? []).map((id) => new Types.ObjectId(id)) };
    if (dto.mode === 'area' && dto.area) query.area = dto.area;
    const employees = await this.employeeModel.find(query).exec();
    const existing = new Set(record.socializations.map((entry) => entry.employeeId?.toString()).filter(Boolean));
    for (const employee of employees) {
      const employeeId = (employee as unknown as { _id: Types.ObjectId })._id;
      if (existing.has(employeeId.toString())) continue;
      record.socializations.push({ employeeId, employeeName: employee.name, area: employee.area, status: PolicySocializationStatus.PENDING } as never);
    }
    this.pushPolicyHistory(record, user, 'SOCIALIZATION_ASSIGN', '', `${employees.length} trabajadores`);
    return this.saveSstPolicyWithCompliance(record);
  }

  async updateSstPolicySocialization(companyId: Types.ObjectId, user: UserDocument, dto: { employeeId: string; status: PolicySocializationStatus; evidence?: string }) {
    const record = await this.findOrCreateSstPolicy(companyId);
    const entry = record.socializations.find((item) => item.employeeId?.toString() === dto.employeeId);
    if (!entry) throw new NotFoundException('Trabajador no asignado a socialización');
    entry.status = dto.status;
    if (dto.status === PolicySocializationStatus.READ) entry.readAt = new Date();
    if (dto.status === PolicySocializationStatus.DIGITALLY_SIGNED) entry.signedAt = new Date();
    if (dto.evidence) entry.evidence = dto.evidence;
    this.pushPolicyHistory(record, user, 'SOCIALIZATION', entry.employeeName, dto.status);
    return this.saveSstPolicyWithCompliance(record);
  }

  async getSstPolicyMasterList(companyId: Types.ObjectId) {
    const record = await this.findOrCreateSstPolicy(companyId);
    return record.versions.map((version) => ({
      code: record.documentCode,
      document: record.documentName,
      version: version.version,
      status: version.status,
      issuedAt: version.issuedAt,
      expiresAt: version.expiresAt,
      responsible: 'Coordinador SST',
    }));
  }

  private async saveSstPolicyWithCompliance(record: SstPolicyDocument) {
    this.refreshSstPolicyCompliance(record);
    record.alerts = this.buildPolicyAlerts(record);
    await record.save();
    await Promise.all(record.alerts.filter((alert) => alert.dueAt <= this.startOfToday()).map((alert) => this.alertsService.createUnique({ companyId: record.companyId, type: `SST_POLICY_${alert.type}`, message: alert.message, severity: AlertSeverity.HIGH })));
    return record;
  }

  private refreshSstPolicyCompliance(record: SstPolicyDocument) {
    const current = this.currentPolicyVersion(record);
    const isExpired = Boolean(current?.expiresAt && current.expiresAt < this.startOfToday());
    if (isExpired) record.status = SstPolicyStatus.EXPIRED;
    const hasApproved = record.status === SstPolicyStatus.APPROVED && current?.status === SstPolicyStatus.APPROVED;
    const signed = record.signatures.filter((signature) => signature.required).every((signature) => signature.status === PolicySignatureStatus.SIGNED);
    const socialized = record.socializations.length > 0 && record.socializations.every((entry) => entry.status === PolicySocializationStatus.DIGITALLY_SIGNED);
    if (hasApproved && signed && socialized && !isExpired) {
      record.complianceStatus = 'COMPLIES';
      record.complianceReason = 'Cumple: política aprobada, firmada, socializada y vigente.';
    } else if (record.content || record.versions.length || record.signatures.some((signature) => signature.status === PolicySignatureStatus.SIGNED) || record.socializations.length) {
      record.complianceStatus = 'PENDING';
      record.complianceReason = 'Pendiente completar aprobación, firmas, socialización o vigencia.';
    } else {
      record.complianceStatus = 'NON_COMPLIANT';
      record.complianceReason = 'No existe política SST gestionada.';
    }
    return record;
  }

  private currentPolicyVersion(record: SstPolicyDocument) {
    return record.versions.find((version) => version.version === record.currentVersion);
  }

  private buildPolicyAlerts(record: SstPolicyDocument) {
    const current = this.currentPolicyVersion(record);
    const alerts = [] as Array<{ type: string; message: string; recipients: string[]; dueAt: Date; generated: boolean }>;
    const recipients = ['ADMIN', 'MANAGER', 'OWNER'];
    if (current?.expiresAt) {
      alerts.push({ type: 'PROXIMA_REVISION_30', message: 'Política SST próxima a revisión en 30 días.', recipients, dueAt: this.addDays(current.expiresAt, -30), generated: false });
      alerts.push({ type: 'PROXIMA_REVISION_15', message: 'Política SST próxima a revisión en 15 días.', recipients, dueAt: this.addDays(current.expiresAt, -15), generated: false });
      if (current.expiresAt < this.startOfToday()) alerts.push({ type: 'POLITICA_VENCIDA', message: 'Política SST vencida.', recipients, dueAt: new Date(), generated: false });
    }
    if (record.signatures.some((signature) => signature.required && signature.status !== PolicySignatureStatus.SIGNED)) alerts.push({ type: 'FALTA_FIRMA', message: 'Falta firma obligatoria de Política SST.', recipients, dueAt: new Date(), generated: false });
    if (record.status === SstPolicyStatus.APPROVED && record.socializations.some((entry) => entry.status !== PolicySocializationStatus.DIGITALLY_SIGNED)) alerts.push({ type: 'FALTA_SOCIALIZACION', message: 'Falta socialización completa de Política SST.', recipients, dueAt: new Date(), generated: false });
    return alerts;
  }

  private async ensurePolicySocialization(record: SstPolicyDocument) {
    if (record.socializations.length) return;
    const employees = await this.employeeModel.find({ companyId: record.companyId, status: 'Activo' }).exec();
    record.socializations = employees.map((employee) => ({ employeeId: (employee as unknown as { _id: Types.ObjectId })._id, employeeName: employee.name, area: employee.area, status: PolicySocializationStatus.PENDING })) as never;
  }

  private defaultPolicySignatures() {
    return [
      { role: 'Manager', signerName: 'Gerencia', signerEmail: 'manager@empresa.com', required: true, status: PolicySignatureStatus.PENDING },
      { role: 'Representante legal', signerName: 'Representante legal', signerEmail: 'legal@empresa.com', required: true, status: PolicySignatureStatus.PENDING },
      { role: 'Líder SST', signerName: 'Líder SST', signerEmail: 'sst@empresa.com', required: false, status: PolicySignatureStatus.PENDING },
      { role: 'Coordinador SST', signerName: 'Coordinador SST', signerEmail: 'coordinador.sst@empresa.com', required: false, status: PolicySignatureStatus.PENDING },
    ];
  }

  private async nextPolicyCode(companyId: Types.ObjectId) {
    const count = await this.sstPolicyModel.countDocuments({ companyId }).exec();
    return `POL-SST-${String(count + 1).padStart(3, '0')}`;
  }

  private incrementVersion(version: string) {
    const [majorRaw, minorRaw] = version.split('.').map((part) => Number(part));
    const major = Number.isFinite(majorRaw) ? majorRaw : 1;
    const minor = Number.isFinite(minorRaw) ? minorRaw : 0;
    return `${major}.${minor + 1}`;
  }

  private pushPolicyHistory(record: SstPolicyDocument, user: UserDocument, action: string, previousValue?: string, newValue?: string) {
    record.history.push({ userId: this.resolveUserId(user).toString(), userEmail: user.email, action, date: new Date(), previousValue, newValue } as never);
    record.updatedBy = this.resolveUserId(user);
  }

  async findOrCreateTrainingManagement(companyId: Types.ObjectId) {
    const current = await this.trainingManagementModel.findOne({ companyId, itemCode: '1.2.1' }).exec();
    if (current) return current;
    return this.trainingManagementModel.create({ companyId, itemCode: '1.2.1' });
  }

  async updateTrainingManagement(companyId: Types.ObjectId, user: UserDocument, dto: Partial<TrainingManagement>) {
    const record = await this.findOrCreateTrainingManagement(companyId);
    Object.assign(record, dto);
    const hasProgram = (record.annualProgram || []).length > 0;
    const approved = record.approval?.status === 'APPROVED';
    const executed = (record.trainings || []).some((item) => item.status === 'Finalizada');
    const evidences = (record.trainings || []).some((item) => (item.evidences || []).length > 0);
    const attendance = (record.attendanceEvidence || []).length > 0 || (record.signatureEvidence || []).length > 0;
    const validExp = !(record.trainings || []).some((item) => item.expirationDate && item.expirationDate < new Date());
    record.complianceStatus = hasProgram && approved && executed && evidences && attendance && validExp ? 'COMPLIES' : (hasProgram ? 'PENDING' : 'NON_COMPLIANT');
    record.complianceReason = record.complianceStatus === 'COMPLIES' ? 'Cumple validaciones automáticas de capacitación SST.' : 'Pendiente aprobación, ejecución, evidencias o vigencia.';
    record.history.push({ action: 'UPDATE', createdBy: user.email, createdAt: new Date(), details: 'Actualización integral de gestión avanzada capacitación SST' } as never);
    return record.save();
  }

  async approveTrainingManagement(companyId: Types.ObjectId, user: UserDocument, payload: { status: 'APPROVED'|'REJECTED'|'ADJUSTMENTS_REQUESTED'; comments?: string; }) {
    const record = await this.findOrCreateTrainingManagement(companyId);
    record.approval = {
      ...record.approval,
      status: payload.status,
      comments: payload.comments,
      approvedBy: user.email,
      approvedAt: new Date(),
      version: (record.approval?.version || 0) + 1,
    } as never;
    record.history.push({ action: `APPROVAL_${payload.status}`, createdBy: user.email, createdAt: new Date(), details: payload.comments } as never);
    return record.save();
  }

}
