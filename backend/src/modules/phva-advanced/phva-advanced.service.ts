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
import { SstObjectives, SstObjectivesDocument, SstObjectiveActivityStatus, SstObjectiveAutomaticSource, SstObjectiveMeasurementMethod, SstObjectiveStatus, SstObjectiveTaskPriority } from './schemas/phva-advanced-sst-objective.schema';
import { Training, TrainingDocument } from '../trainings/schemas/training.schema';
import { InspectionActivity, InspectionActivityDocument } from '../inspections/schemas/inspection-activity.schema';
import { Incident, IncidentDocument } from '../incidents/schemas/incident.schema';

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
    @InjectModel(SstObjectives.name)
    private readonly sstObjectivesModel: Model<SstObjectivesDocument>,
    @InjectModel(Training.name)
    private readonly trainingModel: Model<TrainingDocument>,
    @InjectModel(InspectionActivity.name)
    private readonly inspectionActivityModel: Model<InspectionActivityDocument>,
    @InjectModel(Incident.name)
    private readonly incidentModel: Model<IncidentDocument>,
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


  async findOrCreateSstObjectives(companyId: Types.ObjectId, itemCode = '2.2.1') {
    const current = await this.sstObjectivesModel.findOne({ companyId, itemCode }).exec();
    if (current) return this.saveSstObjectivesWithCompliance(current, false);
    const annualPlan = itemCode === '2.4.1';
    const record = await this.sstObjectivesModel.create({
      companyId,
      itemCode,
      objectives: annualPlan ? this.defaultAnnualWorkPlanObjectives() : this.defaultSstObjectives(),
      history: [{ action: 'CREATE', objectiveId: 'system', field: annualPlan ? 'annualWorkPlan' : 'objectives', date: new Date(), newValue: annualPlan ? 'Plan anual de trabajo inicial' : 'Objetivos SST iniciales' }],
    });
    return this.saveSstObjectivesWithCompliance(record, false);
  }

  async findOrCreateAnnualWorkPlan(companyId: Types.ObjectId) {
    return this.findOrCreateSstObjectives(companyId, '2.4.1');
  }

  async updateSstObjectives(companyId: Types.ObjectId, user: UserDocument, dto: Partial<SstObjectives>, itemCode = '2.2.1') {
    const record = await this.findOrCreateSstObjectives(companyId, itemCode);
    const incomingObjectives = (dto.objectives ?? []) as never[];
    const previousById = new Map((record.objectives ?? []).map((objective) => [(objective as { objectiveId?: string }).objectiveId, JSON.stringify(objective)]));
    if (dto.objectives) {
      record.objectives = incomingObjectives.map((objective: Record<string, unknown>) => this.normalizeSstObjective(objective)) as never;
      for (const objective of record.objectives as never[]) {
        const normalized = objective as { objectiveId: string; name: string };
        const before = previousById.get(normalized.objectiveId) ?? '';
        const after = JSON.stringify(objective);
        if (before !== after) this.pushSstObjectiveHistory(record, user, before ? 'UPDATE_OBJECTIVE' : 'CREATE_OBJECTIVE', normalized.objectiveId, normalized.name, before, after);
        this.pushNestedAnnualWorkPlanHistory(record, user, before ? JSON.parse(before) as Record<string, unknown> : undefined, objective as Record<string, unknown>);
      }
    }
    return this.saveSstObjectivesWithCompliance(record, true);
  }

  async updateAnnualWorkPlan(companyId: Types.ObjectId, user: UserDocument, dto: Partial<SstObjectives>) {
    return this.updateSstObjectives(companyId, user, dto, '2.4.1');
  }

  async updateSstObjectiveProgress(companyId: Types.ObjectId, user: UserDocument, objectiveId: string, dto: { currentProgress?: number; targetProgress?: number; currentValue?: number; targetValue?: number; indicator?: string }) {
    const record = await this.findOrCreateSstObjectives(companyId);
    const objective = (record.objectives as never[]).find((item) => (item as { objectiveId: string }).objectiveId === objectiveId) as Record<string, unknown> | undefined;
    if (!objective) throw new NotFoundException('Objetivo SST no encontrado');
    if (objective.measurementMethod !== SstObjectiveMeasurementMethod.MANUAL && objective.measurementMethod !== SstObjectiveMeasurementMethod.AUTOMATIC) {
      throw new BadRequestException('Este objetivo se actualiza desde actividades.');
    }
    for (const field of ['currentProgress', 'targetProgress', 'currentValue', 'targetValue', 'indicator'] as const) {
      if (dto[field] === undefined) continue;
      const before = String(objective[field] ?? '');
      objective[field] = dto[field] as never;
      this.pushSstObjectiveHistory(record, user, field === 'indicator' ? 'INDICATOR_CHANGE' : 'PROGRESS_UPDATE', objectiveId, field, before, String(dto[field] ?? ''));
    }
    objective.lastUpdatedAt = new Date();
    return this.saveSstObjectivesWithCompliance(record, true);
  }

  async updateSstObjectiveActivities(companyId: Types.ObjectId, user: UserDocument, objectiveId: string, activities: unknown[], itemCode = '2.2.1') {
    const record = await this.findOrCreateSstObjectives(companyId, itemCode);
    const objective = (record.objectives as never[]).find((item) => (item as { objectiveId: string }).objectiveId === objectiveId) as Record<string, unknown> | undefined;
    if (!objective) throw new NotFoundException('Objetivo SST no encontrado');
    const before = JSON.stringify(objective.activities ?? []);
    objective.activities = activities as never;
    objective.measurementMethod = SstObjectiveMeasurementMethod.ACTIVITY_BASED;
    objective.lastUpdatedAt = new Date();
    this.pushSstObjectiveHistory(record, user, 'ACTIVITY_COMPLETION', objectiveId, 'activities', before, JSON.stringify(activities));
    return this.saveSstObjectivesWithCompliance(record, true);
  }

  async updateAnnualWorkPlanActivities(companyId: Types.ObjectId, user: UserDocument, objectiveId: string, activities: unknown[]) {
    return this.updateSstObjectiveActivities(companyId, user, objectiveId, activities, '2.4.1');
  }

  private async saveSstObjectivesWithCompliance(record: SstObjectivesDocument, emitAlerts: boolean) {
    await this.refreshAutomaticObjectiveValues(record);
    this.refreshSstObjectiveProgress(record);
    this.refreshSstObjectiveCompliance(record);
    record.alerts = this.buildSstObjectiveAlerts(record) as never;
    await record.save();
    if (emitAlerts) {
      await Promise.all(record.alerts.filter((alert) => alert.dueAt <= this.startOfToday()).map((alert) => this.alertsService.createUnique({ companyId: record.companyId, type: `SST_OBJECTIVE_${alert.type}_${alert.objectiveId}`, message: alert.message, severity: AlertSeverity.HIGH })));
    }
    return record;
  }

  private async refreshAutomaticObjectiveValues(record: SstObjectivesDocument) {
    const automaticObjectives = (record.objectives as never[]).filter((objective) => (objective as { measurementMethod: string }).measurementMethod === SstObjectiveMeasurementMethod.AUTOMATIC);
    if (!automaticObjectives.length) return;
    const [trainings, inspections, employees, incidents] = await Promise.all([
      this.trainingModel.countDocuments({ companyId: record.companyId }).exec(),
      this.inspectionActivityModel.countDocuments({ companyId: record.companyId, status: { $in: ['completada', 'Completada', 'Completed', 'completed'] } }).exec(),
      this.employeeModel.countDocuments({ companyId: record.companyId, status: 'Activo' }).exec(),
      this.incidentModel.countDocuments({ companyId: record.companyId }).exec(),
    ]);
    const sourceValues: Record<string, number> = {
      [SstObjectiveAutomaticSource.TRAININGS]: trainings,
      [SstObjectiveAutomaticSource.INSPECTIONS]: inspections,
      [SstObjectiveAutomaticSource.EMPLOYEES]: employees,
      [SstObjectiveAutomaticSource.INCIDENTS]: incidents,
    };
    for (const objective of automaticObjectives as Record<string, unknown>[]) {
      const source = String(objective.automaticSource ?? SstObjectiveAutomaticSource.MANUAL);
      if (sourceValues[source] !== undefined) objective.currentValue = sourceValues[source];
    }
  }

  private refreshSstObjectiveProgress(record: SstObjectivesDocument) {
    const today = this.startOfToday();
    for (const objective of record.objectives as unknown as Record<string, unknown>[]) {
      for (const activity of (objective.activities ?? []) as Record<string, unknown>[]) {
        for (const task of (activity.tasks ?? []) as Record<string, unknown>[]) {
          const status = String(task.status ?? SstObjectiveActivityStatus.PENDING);
          const progress = Number(task.progress ?? 0);
          const dueDate = task.dueDate ? new Date(task.dueDate as string) : undefined;
          if (status !== SstObjectiveActivityStatus.COMPLETED && status !== SstObjectiveActivityStatus.CANCELLED && dueDate && dueDate < today) task.status = SstObjectiveActivityStatus.DELAYED;
          if (progress >= 100) task.status = SstObjectiveActivityStatus.COMPLETED;
          if (progress > 0 && progress < 100 && task.status !== SstObjectiveActivityStatus.DELAYED) task.status = SstObjectiveActivityStatus.IN_PROGRESS;
          if (progress <= 0 && task.status !== SstObjectiveActivityStatus.DELAYED && task.status !== SstObjectiveActivityStatus.CANCELLED) task.status = SstObjectiveActivityStatus.PENDING;
        }
        const tasks = (activity.tasks ?? []) as Array<{ status?: string; progress?: number }>;
        if (tasks.length) {
          const done = tasks.filter((task) => task.status === SstObjectiveActivityStatus.COMPLETED || Number(task.progress ?? 0) >= 100).length;
          if (done === tasks.length) activity.status = SstObjectiveActivityStatus.COMPLETED;
          else if (tasks.some((task) => task.status === SstObjectiveActivityStatus.DELAYED)) activity.status = SstObjectiveActivityStatus.DELAYED;
          else if (tasks.some((task) => Number(task.progress ?? 0) > 0)) activity.status = SstObjectiveActivityStatus.IN_PROGRESS;
        }
      }
      if (objective.measurementMethod === SstObjectiveMeasurementMethod.AUTOMATIC) {
        const targetValue = Number(objective.targetValue ?? 0);
        const currentValue = Number(objective.currentValue ?? 0);
        objective.currentProgress = targetValue > 0 ? Math.min(100, Math.round((currentValue / targetValue) * 100)) : 0;
        objective.targetProgress = 100;
      }
      if (objective.measurementMethod === SstObjectiveMeasurementMethod.ACTIVITY_BASED) {
        const activities = (objective.activities ?? []) as Array<{ status?: string; tasks?: Array<{ progress?: number; status?: string }> }>;
        const taskProgress = activities.flatMap((activity) => activity.tasks ?? []).map((task) => Number(task.progress ?? (task.status === SstObjectiveActivityStatus.COMPLETED ? 100 : 0)));
        if (taskProgress.length) objective.currentProgress = Math.round(taskProgress.reduce((sum, value) => sum + value, 0) / taskProgress.length);
        else {
          const completed = activities.filter((activity) => activity.status === SstObjectiveActivityStatus.COMPLETED).length;
          objective.currentProgress = activities.length ? Math.round((completed / activities.length) * 100) : 0;
        }
        objective.targetProgress = 100;
      }
      const progress = Number(objective.currentProgress ?? 0);
      const dueDate = objective.dueDate ? new Date(objective.dueDate as string) : undefined;
      if (progress <= 0) objective.status = SstObjectiveStatus.NOT_STARTED;
      if (progress > 0 && progress < 100) objective.status = SstObjectiveStatus.IN_PROGRESS;
      if (progress >= 100) objective.status = SstObjectiveStatus.COMPLETED;
      if (progress < 100 && dueDate && dueDate < today) objective.status = SstObjectiveStatus.DELAYED;
    }
  }

  private refreshSstObjectiveCompliance(record: SstObjectivesDocument) {
    const activeObjectives = (record.objectives ?? []).filter((objective) => (objective as { active?: boolean }).active !== false);
    if (record.itemCode === '2.4.1') {
      const tasks = this.flattenAnnualWorkPlanTasks(record);
      const completedTasks = tasks.filter((task) => task.status === SstObjectiveActivityStatus.COMPLETED || Number(task.progress ?? 0) >= 100).length;
      const delayedTasks = tasks.filter((task) => task.status === SstObjectiveActivityStatus.DELAYED).length;
      const justifiedDelayed = tasks.filter((task) => task.status === SstObjectiveActivityStatus.DELAYED && ((task.justifications as unknown[] | undefined) ?? []).length > 0).length;
      const tasksWithEvidence = tasks.filter((task) => ((task.evidence as unknown[] | undefined) ?? []).length > 0).length;
      const activityCount = activeObjectives.reduce((sum, objective) => sum + (((objective as { activities?: unknown[] }).activities ?? []).length), 0);
      const completedActivities = activeObjectives.reduce((sum, objective) => sum + (((objective as { activities?: Array<{ status?: string }> }).activities ?? []).filter((activity) => activity.status === SstObjectiveActivityStatus.COMPLETED).length), 0);
      const completion = tasks.length ? completedTasks / tasks.length : 0;
      const activityCompletion = activityCount ? completedActivities / activityCount : 0;
      const evidenceCoverage = tasks.length ? tasksWithEvidence / tasks.length : 0;
      const justifiedDelayCoverage = delayedTasks ? justifiedDelayed / delayedTasks : 1;
      const compliance = Math.round(((completion * 0.45) + (activityCompletion * 0.25) + (evidenceCoverage * 0.2) + (justifiedDelayCoverage * 0.1)) * 100);
      if (tasks.length && compliance >= 85) {
        record.complianceStatus = 'COMPLIES';
        record.complianceReason = `Cumple: plan anual con ${completedTasks}/${tasks.length} tareas completadas, evidencias cargadas y retrasos justificados (${compliance}%).`;
      } else if (tasks.length) {
        record.complianceStatus = 'PENDING';
        record.complianceReason = `Pendiente: cumplimiento automático ${compliance}%; revise tareas atrasadas, evidencias y justificaciones.`;
      } else {
        record.complianceStatus = 'NON_COMPLIANT';
        record.complianceReason = 'No existen tareas en el plan anual de trabajo.';
      }
      return;
    }
    const compliantObjectives = activeObjectives.filter((objective) => {
      const item = objective as { indicator?: string; targetValue?: number; targetProgress?: number; currentProgress?: number; lastUpdatedAt?: Date; activities?: unknown[] };
      return Boolean((item.targetValue && item.targetValue > 0) || (item.targetProgress && item.targetProgress > 0))
        && Boolean(item.indicator)
        && Number.isFinite(Number(item.currentProgress))
        && (Boolean(item.lastUpdatedAt) || (item.activities ?? []).length > 0);
    });
    if (activeObjectives.length && compliantObjectives.length === activeObjectives.length && record.history.length > 0) {
      record.complianceStatus = 'COMPLIES';
      record.complianceReason = 'Cumple: objetivos activos con meta, indicador, avance medible y registros de seguimiento.';
    } else if (activeObjectives.length) {
      record.complianceStatus = 'PENDING';
      record.complianceReason = 'Pendiente completar meta, indicador, avance medible o registros de seguimiento en todos los objetivos activos.';
    } else {
      record.complianceStatus = 'NON_COMPLIANT';
      record.complianceReason = 'No existen objetivos SST activos.';
    }
  }

  private buildSstObjectiveAlerts(record: SstObjectivesDocument) {
    const today = this.startOfToday();
    const alerts: Array<{ type: string; objectiveId: string; message: string; recipients: string[]; dueAt: Date; generated: boolean }> = [];
    const dueWarningDays = [30, 15, 5, 1];
    for (const objective of record.objectives as unknown as Array<{ objectiveId: string; name: string; dueDate?: Date; currentProgress?: number; lastUpdatedAt?: Date; activities?: Array<{ activityId?: string; name: string; dueDate?: Date; status?: string; tasks?: Array<Record<string, unknown>> }> }>) {
      const progress = Number(objective.currentProgress ?? 0);
      const dueDate = objective.dueDate ? new Date(objective.dueDate) : undefined;
      if (dueDate) {
        const elapsed = this.expectedObjectiveProgress(dueDate);
        if (progress < elapsed) alerts.push({ type: 'PROGRESS_BELOW_EXPECTED', objectiveId: objective.objectiveId, message: `Objetivo SST con progreso inferior al esperado: ${objective.name}.`, recipients: ['ADMIN', 'MANAGER'], dueAt: today, generated: false });
        if (progress < 100 && dueDate < today) alerts.push({ type: 'OBJECTIVE_OVERDUE', objectiveId: objective.objectiveId, message: `Objetivo SST vencido: ${objective.name}.`, recipients: ['ADMIN', 'MANAGER'], dueAt: today, generated: false });
      }
      const lastUpdatedAt = objective.lastUpdatedAt ? new Date(objective.lastUpdatedAt) : undefined;
      if (!lastUpdatedAt || this.addDays(lastUpdatedAt, 30) < today) alerts.push({ type: 'NO_UPDATES_30_DAYS', objectiveId: objective.objectiveId, message: `Objetivo SST sin actualizaciones en 30 días: ${objective.name}.`, recipients: ['ADMIN', 'MANAGER'], dueAt: today, generated: false });
      for (const activity of objective.activities ?? []) {
        if (activity.status !== SstObjectiveActivityStatus.COMPLETED && activity.dueDate && new Date(activity.dueDate) < today) {
          alerts.push({ type: 'ACTIVITY_OVERDUE', objectiveId: objective.objectiveId, message: `Actividad vencida en ${objective.name}: ${activity.name}.`, recipients: ['ADMIN', 'MANAGER'], dueAt: today, generated: false });
        }
        for (const task of (activity.tasks ?? []) as Array<Record<string, unknown>>) {
          const taskDueDate = task.dueDate ? new Date(task.dueDate as string) : undefined;
          const taskName = String(task.name ?? 'Tarea');
          const taskId = String(task.taskId ?? taskName);
          const responsible = String(task.responsibleUser ?? 'Sin responsable');
          if (!taskDueDate || task.status === SstObjectiveActivityStatus.COMPLETED || task.status === SstObjectiveActivityStatus.CANCELLED) continue;
          const daysUntilDue = Math.ceil((taskDueDate.getTime() - today.getTime()) / 86_400_000);
          if (dueWarningDays.includes(daysUntilDue)) alerts.push({ type: `TASK_DUE_${daysUntilDue}_DAYS`, objectiveId: objective.objectiveId, message: `Tarea próxima a vencer (${daysUntilDue} días): ${taskName}. Responsable: ${responsible}.`, recipients: ['ASSIGNED_USER', 'ADMIN'], dueAt: today, generated: false });
          if (taskDueDate < today) {
            const daysOverdue = Math.max(1, Math.ceil((today.getTime() - taskDueDate.getTime()) / 86_400_000));
            alerts.push({ type: `TASK_OVERDUE_${taskId}`, objectiveId: objective.objectiveId, message: `Escalación MANAGER: ${taskName}. Responsable: ${responsible}. Vence: ${taskDueDate.toISOString().slice(0, 10)}. Días vencida: ${daysOverdue}.`, recipients: ['RESPONSIBLE_USER', 'ADMIN', 'MANAGER'], dueAt: today, generated: false });
            if (!((task.justifications as unknown[] | undefined) ?? []).length) alerts.push({ type: `MISSING_JUSTIFICATION_${taskId}`, objectiveId: objective.objectiveId, message: `Justificación requerida: ${taskName} no fue completada en fecha.`, recipients: ['RESPONSIBLE_USER', 'ADMIN'], dueAt: today, generated: false });
          }
        }
      }
    }
    return alerts;
  }

  private expectedObjectiveProgress(dueDate: Date) {
    const daysUntilDue = Math.max(0, Math.ceil((dueDate.getTime() - this.startOfToday().getTime()) / 86_400_000));
    if (daysUntilDue > 90) return 25;
    if (daysUntilDue > 30) return 50;
    if (daysUntilDue > 0) return 75;
    return 100;
  }

  private normalizeSstObjective(objective: Record<string, unknown>) {
    return {
      objectiveId: String(objective.objectiveId || new Types.ObjectId().toString()),
      name: String(objective.name || 'Objetivo SST'),
      responsible: String(objective.responsible || 'Responsable SST'),
      dueDate: this.parseOptionalDate(objective.dueDate as string, 'dueDate') ?? this.addDays(new Date(), 90),
      active: objective.active !== false,
      measurementMethod: (objective.measurementMethod as SstObjectiveMeasurementMethod) || SstObjectiveMeasurementMethod.MANUAL,
      status: (objective.status as SstObjectiveStatus) || SstObjectiveStatus.NOT_STARTED,
      currentProgress: Number(objective.currentProgress ?? 0),
      targetProgress: Number(objective.targetProgress ?? 100),
      indicator: String(objective.indicator || 'Avance del objetivo'),
      targetValue: Number(objective.targetValue ?? 0),
      currentValue: Number(objective.currentValue ?? 0),
      automaticSource: (objective.automaticSource as SstObjectiveAutomaticSource) || SstObjectiveAutomaticSource.MANUAL,
      activities: ((objective.activities ?? []) as Record<string, unknown>[]).map((activity) => this.normalizeSstObjectiveActivity(activity)),
      executionLog: ((objective.executionLog ?? []) as Record<string, unknown>[]).map((log) => ({
        logId: String(log.logId || new Types.ObjectId().toString()),
        userId: log.userId ? String(log.userId) : undefined,
        userEmail: log.userEmail ? String(log.userEmail) : undefined,
        date: this.parseOptionalDate(log.date as string, 'date') ?? new Date(),
        progressNotes: String(log.progressNotes ?? ''),
        achievements: String(log.achievements ?? ''),
        difficulties: String(log.difficulties ?? ''),
        observations: String(log.observations ?? ''),
        nextActions: String(log.nextActions ?? ''),
      })),
      lastUpdatedAt: objective.lastUpdatedAt ? new Date(objective.lastUpdatedAt as string) : new Date(),
    } as never;
  }

  private normalizeSstObjectiveActivity(activity: Record<string, unknown>) {
    return {
      activityId: String(activity.activityId || new Types.ObjectId().toString()),
      name: String(activity.name || 'Nueva actividad'),
      responsible: String(activity.responsible || 'Responsable SST'),
      dueDate: this.parseOptionalDate(activity.dueDate as string, 'dueDate') ?? this.addDays(new Date(), 30),
      status: (activity.status as SstObjectiveActivityStatus) || SstObjectiveActivityStatus.PENDING,
      completedAt: activity.completedAt ? new Date(activity.completedAt as string) : undefined,
      tasks: ((activity.tasks ?? []) as Record<string, unknown>[]).map((task) => this.normalizeSstObjectiveTask(task, String(activity.activityId || activity.name || ''))),
    };
  }

  private normalizeSstObjectiveTask(task: Record<string, unknown>, activityId: string) {
    const progress = this.nearestAllowedProgress(Number(task.progress ?? 0));
    return {
      taskId: String(task.taskId || new Types.ObjectId().toString()),
      name: String(task.name || 'Nueva tarea'),
      description: String(task.description ?? ''),
      relatedObjective: String(task.relatedObjective ?? ''),
      relatedActivity: String(task.relatedActivity || activityId),
      responsibleUser: String(task.responsibleUser || 'ADMIN'),
      assignmentDate: this.parseOptionalDate(task.assignmentDate as string, 'assignmentDate') ?? new Date(),
      dueDate: this.parseOptionalDate(task.dueDate as string, 'dueDate') ?? this.addDays(new Date(), 30),
      priority: (task.priority as SstObjectiveTaskPriority) || SstObjectiveTaskPriority.MEDIUM,
      estimatedCost: Number(task.estimatedCost ?? 0),
      notes: String(task.notes ?? ''),
      status: (task.status as SstObjectiveActivityStatus) || SstObjectiveActivityStatus.PENDING,
      progress,
      subtasks: ((task.subtasks ?? []) as Record<string, unknown>[]).map((subtask) => ({ subtaskId: String(subtask.subtaskId || new Types.ObjectId().toString()), name: String(subtask.name || 'Nueva subtarea'), description: String(subtask.description ?? ''), status: (subtask.status as SstObjectiveActivityStatus) || SstObjectiveActivityStatus.PENDING, progress: this.nearestAllowedProgress(Number(subtask.progress ?? 0)) })),
      evidence: ((task.evidence ?? []) as Record<string, unknown>[]).map((evidence) => ({ evidenceId: String(evidence.evidenceId || new Types.ObjectId().toString()), fileName: String(evidence.fileName || 'Evidencia'), fileUrl: String(evidence.fileUrl ?? ''), fileType: String(evidence.fileType || 'document'), uploadedBy: String(evidence.uploadedBy ?? ''), uploadedAt: this.parseOptionalDate(evidence.uploadedAt as string, 'uploadedAt') ?? new Date() })),
      justifications: ((task.justifications ?? []) as Record<string, unknown>[]).map((justification) => ({ justificationId: String(justification.justificationId || new Types.ObjectId().toString()), reason: String(justification.reason || 'Other'), comments: String(justification.comments ?? ''), userId: String(justification.userId ?? ''), userEmail: String(justification.userEmail ?? ''), date: this.parseOptionalDate(justification.date as string, 'date') ?? new Date() })),
      reschedules: ((task.reschedules ?? []) as Record<string, unknown>[]).map((request) => ({ requestId: String(request.requestId || new Types.ObjectId().toString()), newDueDate: this.parseOptionalDate(request.newDueDate as string, 'newDueDate') ?? this.addDays(new Date(), 30), correctiveAction: String(request.correctiveAction || 'Acción correctiva'), comments: String(request.comments ?? ''), status: String(request.status || 'Pending Manager Approval'), managerComments: String(request.managerComments ?? ''), reviewedBy: String(request.reviewedBy ?? ''), reviewedAt: request.reviewedAt ? new Date(request.reviewedAt as string) : undefined })),
      lastProgressAt: task.lastProgressAt ? new Date(task.lastProgressAt as string) : (progress > 0 ? new Date() : undefined),
    };
  }

  private nearestAllowedProgress(progress: number) {
    const allowed = [0, 25, 50, 75, 100];
    return allowed.reduce((closest, value) => Math.abs(value - progress) < Math.abs(closest - progress) ? value : closest, 0);
  }

  private defaultSstObjectives() {
    const dueDate = this.addDays(new Date(), 90);
    return [
      { objectiveId: new Types.ObjectId().toString(), name: 'Mejorar la cultura de seguridad', responsible: 'Coordinador SST', dueDate, active: true, measurementMethod: SstObjectiveMeasurementMethod.MANUAL, status: SstObjectiveStatus.NOT_STARTED, currentProgress: 0, targetProgress: 100, indicator: 'Porcentaje de avance cualitativo', targetValue: 100, currentValue: 0, automaticSource: SstObjectiveAutomaticSource.MANUAL, activities: [], executionLog: [], lastUpdatedAt: new Date() },
      { objectiveId: new Types.ObjectId().toString(), name: 'Capacitar trabajadores en SST', responsible: 'Líder SST', dueDate, active: true, measurementMethod: SstObjectiveMeasurementMethod.AUTOMATIC, status: SstObjectiveStatus.NOT_STARTED, currentProgress: 0, targetProgress: 100, indicator: 'Capacitaciones registradas', targetValue: 12, currentValue: 0, automaticSource: SstObjectiveAutomaticSource.TRAININGS, activities: [], executionLog: [], lastUpdatedAt: new Date() },
      { objectiveId: new Types.ObjectId().toString(), name: 'Ejecutar plan de actividades preventivas', responsible: 'Manager SST', dueDate, active: true, measurementMethod: SstObjectiveMeasurementMethod.ACTIVITY_BASED, status: SstObjectiveStatus.NOT_STARTED, currentProgress: 0, targetProgress: 100, indicator: 'Actividades completadas', targetValue: 3, currentValue: 0, automaticSource: SstObjectiveAutomaticSource.MANUAL, activities: [
        { activityId: new Types.ObjectId().toString(), name: 'Definir responsables', responsible: 'Manager SST', dueDate: this.addDays(new Date(), 15), status: SstObjectiveActivityStatus.PENDING, tasks: [] },
        { activityId: new Types.ObjectId().toString(), name: 'Socializar metas', responsible: 'Coordinador SST', dueDate: this.addDays(new Date(), 30), status: SstObjectiveActivityStatus.PENDING, tasks: [] },
        { activityId: new Types.ObjectId().toString(), name: 'Revisar cierre', responsible: 'Líder SST', dueDate: this.addDays(new Date(), 60), status: SstObjectiveActivityStatus.PENDING, tasks: [] },
      ], executionLog: [], lastUpdatedAt: new Date() },
    ] as never[];
  }

  private defaultAnnualWorkPlanObjectives() {
    const objectiveId = new Types.ObjectId().toString();
    const activityId = new Types.ObjectId().toString();
    return [{
      objectiveId,
      name: 'Ejecutar el Plan Anual de Trabajo SG-SST',
      responsible: 'MANAGER',
      dueDate: this.addDays(new Date(), 365),
      active: true,
      measurementMethod: SstObjectiveMeasurementMethod.ACTIVITY_BASED,
      status: SstObjectiveStatus.NOT_STARTED,
      currentProgress: 0,
      targetProgress: 100,
      indicator: 'Cumplimiento de tareas del plan anual',
      targetValue: 100,
      currentValue: 0,
      automaticSource: SstObjectiveAutomaticSource.MANUAL,
      executionLog: [],
      activities: [{
        activityId,
        name: 'Gestión preventiva anual',
        responsible: 'ADMIN',
        dueDate: this.addDays(new Date(), 90),
        status: SstObjectiveActivityStatus.PENDING,
        tasks: [{
          taskId: new Types.ObjectId().toString(),
          name: 'Definir cronograma anual SG-SST',
          description: 'Consolidar actividades, responsables, presupuesto e indicadores de ejecución.',
          relatedObjective: objectiveId,
          relatedActivity: activityId,
          responsibleUser: 'ADMIN',
          assignmentDate: new Date(),
          dueDate: this.addDays(new Date(), 30),
          priority: SstObjectiveTaskPriority.HIGH,
          estimatedCost: 0,
          notes: 'Tarea inicial sugerida por el sistema.',
          status: SstObjectiveActivityStatus.PENDING,
          progress: 0,
          subtasks: [],
          evidence: [],
          justifications: [],
          reschedules: [],
        }],
      }],
      lastUpdatedAt: new Date(),
    }] as never[];
  }

  private flattenAnnualWorkPlanTasks(record: SstObjectivesDocument) {
    return (record.objectives as unknown as Array<{ activities?: Array<{ tasks?: Array<Record<string, unknown>> }> }>).flatMap((objective) => (objective.activities ?? []).flatMap((activity) => activity.tasks ?? []));
  }

  private pushNestedAnnualWorkPlanHistory(record: SstObjectivesDocument, user: UserDocument, before: Record<string, unknown> | undefined, after: Record<string, unknown>) {
    if (record.itemCode !== '2.4.1') return;
    const beforeActivities = ((before?.activities ?? []) as Array<Record<string, unknown>>);
    for (const activity of (after.activities ?? []) as Array<Record<string, unknown>>) {
      const oldActivity = beforeActivities.find((item) => item.activityId === activity.activityId);
      if (!oldActivity) this.pushSstObjectiveHistory(record, user, 'CREATE_ACTIVITY', String(after.objectiveId), 'activity', '', String(activity.name ?? ''));
      const oldTasks = ((oldActivity?.tasks ?? []) as Array<Record<string, unknown>>);
      for (const task of (activity.tasks ?? []) as Array<Record<string, unknown>>) {
        const oldTask = oldTasks.find((item) => item.taskId === task.taskId);
        if (!oldTask) this.pushSstObjectiveHistory(record, user, 'CREATE_TASK', String(after.objectiveId), String(task.name ?? 'task'), '', JSON.stringify(task));
        else {
          for (const field of ['responsibleUser', 'dueDate', 'priority', 'status', 'progress', 'evidence', 'justifications', 'reschedules', 'subtasks'] as const) {
            if (JSON.stringify(oldTask[field]) !== JSON.stringify(task[field])) this.pushSstObjectiveHistory(record, user, this.historyActionForTaskField(field), String(after.objectiveId), String(field), JSON.stringify(oldTask[field] ?? ''), JSON.stringify(task[field] ?? ''));
          }
        }
      }
    }
  }

  private historyActionForTaskField(field: string) {
    const actionByField: Record<string, string> = { responsibleUser: 'ASSIGNMENT', dueDate: 'RESCHEDULE', priority: 'UPDATE_TASK', status: 'PROGRESS_UPDATE', progress: 'PROGRESS_UPDATE', evidence: 'EVIDENCE_UPLOAD', justifications: 'JUSTIFICATION', reschedules: 'MANAGER_APPROVAL', subtasks: 'UPDATE_SUBTASK' };
    return actionByField[field] ?? 'UPDATE_TASK';
  }

  private pushSstObjectiveHistory(record: SstObjectivesDocument, user: UserDocument, action: string, objectiveId: string, field: string, previousValue?: string, newValue?: string) {
    record.history.push({ userId: this.resolveUserId(user).toString(), userEmail: user.email, action, objectiveId, field, date: new Date(), previousValue, newValue } as never);
    record.updatedBy = this.resolveUserId(user);
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
