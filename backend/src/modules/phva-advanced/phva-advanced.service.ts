import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AlertsService } from '../alerts/alerts.service';
import { AutoCommunicationService } from '../communication/auto-communication.service';
import { Company, CompanyDocument } from '../companies/schemas/company.schema';
import { CompanyProfile, CompanyProfileDoc } from '../company-profile/schemas/company-profile.schema';
import { Employee, EmployeeDocument } from '../employees/schemas/employee.schema';
import { CopasstPeriod, CopasstPeriodDocument } from '../copasst/schemas/copasst.schema';
import { AlertSeverity } from '../alerts/schemas/alert.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { UpdateResponsableSstDto } from './dto/update-responsable-sst.dto';
import {
  PhvaAdvancedResponsableSst,
  PhvaAdvancedResponsableSstDocument,
  ResponsableSstApprovalStatus,
  ResponsableSstComplianceStatus,
  ResponsableSstDocumentType,
  ResponsableSstStoredDocument,
  ResponsableSstVersion,
} from './schemas/phva-advanced-responsable-sst.schema';
import { buildResponsableSstVersion, bumpResponsableSstVersion } from './phva-advanced-versioning.utils';
import { DocumentGenerationService } from '../document-generation/services/document-generation.service';
import { SystemTemplateService } from '../document-generation/services/system-template.service';
import { ResponsibleSgsstVariableResolver } from './responsible-sgsst-variable-resolver.service';
import { CopasstVariableResolverService } from './copasst-variable-resolver.service';
import { ResponsibilitiesVariableResolverService } from './responsibilities-variable-resolver.service';
import { ResourceAssignmentVariableResolverService } from './resource-assignment-variable-resolver.service';
import { SstPolicyVariableResolverService } from './sst-policy-variable-resolver.service';
import { DocumentSourceModule } from '../document-generation/types/renderer.types';
import {
  DocumentApprovalMetadata,
  DocumentGenerationResult,
  PHVA_SOURCE_ENTITY_COPASST,
  PHVA_SOURCE_ENTITY_RESOURCE_ASSIGNMENT,
  PHVA_SOURCE_ENTITY_RESPONSIBILITIES,
  PHVA_SOURCE_ENTITY_RESPONSIBLE_SG_SST,
  PHVA_SOURCE_ENTITY_SST_POLICY,
} from '../document-generation/types/document-generation.types';
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
  ResourceAssignmentApprovalStatus,
} from './schemas/phva-advanced-resource-assignment.schema';
import { UpdateResourceAssignmentDto } from './dto/update-resource-assignment.dto';
import { UpdateArlAffiliationsDto } from './dto/update-arl-affiliations.dto';
import { ArlComplianceStatus, PhvaAdvancedArlAffiliations, PhvaAdvancedArlAffiliationsDocument } from './schemas/phva-advanced-arl-affiliations.schema';
import { SpecialPensionComplianceStatus, SpecialPensionConfiguration, SpecialPensionConfigurationDocument } from './schemas/phva-advanced-special-pension.schema';
import { TrainingManagement, TrainingManagementDocument } from './schemas/phva-advanced-training-management.schema';
import { PolicySignatureStatus, PolicySocializationStatus, SstPolicy, SstPolicyDocument, SstPolicyStatus } from './schemas/phva-advanced-sst-policy.schema';
import { PolicyTemplateService } from './policy-template.service';
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
  // NOTA normativa (Fase 1.1.1): licenseExpiresAt NO es requisito del
  // estándar. La licencia SST no posee vencimiento normativo obligatorio;
  // el campo es opcional y solo documental (soporta actos que indiquen una
  // vigencia concreta). Su ausencia es NORMAL y nunca genera incumplimiento.
  'licenseType',
  'issuingAuthority',
  'course50HoursDate',
];

const SST_LICENSE_DOCUMENT_TYPES: ResponsableSstDocumentType[] = [
  ResponsableSstDocumentType.SST_LICENSE_PDF,
  ResponsableSstDocumentType.SST_LICENSE_SCANNED,
  ResponsableSstDocumentType.SST_LICENSE_RESOLUTION,
  ResponsableSstDocumentType.SST_LICENSE_SUPPORTING,
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
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(CompanyProfile.name)
    private readonly companyProfileModel: Model<CompanyProfileDoc>,
    private readonly alertsService: AlertsService,
    private readonly autoCommService: AutoCommunicationService,
    private readonly policyTemplateService: PolicyTemplateService,
    // Fase 2 — generación documental del Responsable del SG-SST (1.1.1).
    private readonly documentGenerationService: DocumentGenerationService,
    private readonly systemTemplateService: SystemTemplateService,
    private readonly responsibleSgsstResolver: ResponsibleSgsstVariableResolver,
    // Fase 3 — generación documental del COPASST (aprobación del periodo).
    @InjectModel(CopasstPeriod.name)
    private readonly copasstPeriodModel: Model<CopasstPeriodDocument>,
    private readonly copasstResolver: CopasstVariableResolverService,
    // Fase 4 — generación documental de la Matriz de Responsabilidades (1.1.2).
    private readonly responsibilitiesResolver: ResponsibilitiesVariableResolverService,
    // Fase 5 — generación documental de la Asignación de Recursos (1.1.3).
    private readonly resourceAssignmentResolver: ResourceAssignmentVariableResolverService,
    // Fase 6 — generación documental de la Política de Seguridad y Salud en
    // el Trabajo (2.1.1).
    private readonly sstPolicyResolver: SstPolicyVariableResolverService,
  ) {}

  async findOrCreateResourceAssignment(companyId: Types.ObjectId) {
    const current = await this.resourceAssignmentModel.findOne({ companyId, itemCode: '1.1.3' }).exec();
    if (current) return current;
    return this.resourceAssignmentModel.create({ companyId, itemCode: '1.1.3' });
  }

  /**
   * Getter de lectura por identificador (sin crear registros). Usado por el
   * ResourceAssignmentHandler del Approval Workflow Core.
   */
  async findResourceAssignmentById(id: Types.ObjectId): Promise<PhvaAdvancedResourceAssignmentDocument> {
    const record = await this.resourceAssignmentModel.findById(id).exec();
    if (!record) throw new NotFoundException('Resource assignment not found');
    return record;
  }

  /**
   * Getter de lectura del registro vigente de la empresa (sin crear un
   * registro como hace findOrCreate). Usado por el handler cuando getEntity
   * llega sin entityId.
   */
  async findResourceAssignmentByCompany(companyId: Types.ObjectId): Promise<PhvaAdvancedResourceAssignmentDocument> {
    const record = await this.resourceAssignmentModel
      .findOne({ companyId, itemCode: '1.1.3' })
      .exec();
    if (!record) throw new NotFoundException('Resource assignment not found');
    return record;
  }

  async updateResourceAssignment(companyId: Types.ObjectId, user: UserDocument, dto: UpdateResourceAssignmentDto) {
    const record = await this.findOrCreateResourceAssignment(companyId);

    if (record.locked) {
      throw new BadRequestException('El módulo está bloqueado. No se puede editar.');
    }

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

  async submitResourceAssignment(companyId: Types.ObjectId, user: UserDocument) {
    const record = await this.findOrCreateResourceAssignment(companyId);

    if (record.approvalStatus === 'PENDING_APPROVAL') {
      throw new BadRequestException('El módulo ya está pendiente de aprobación.');
    }
    if (record.approvalStatus === 'APPROVED' || record.approvalStatus === 'APPROVED_AND_SIGNED') {
      throw new BadRequestException('El módulo ya está aprobado.');
    }

    // Bump version
    const currentVer = parseFloat(record.currentVersion || '1.0');
    const newVer = (currentVer + 0.1).toFixed(1);

    record.approvalStatus = ResourceAssignmentApprovalStatus.PENDING_APPROVAL;
    record.locked = true;
    record.currentVersion = newVer;
    record.submittedBy = this.resolveUserId(user);
    record.submittedAt = new Date();
    record.assignedReviewer = 'Manager';

    // Validate that at least one MANAGER exists before creating alerts
    const managers = await this.userModel.find({ companyId, role: 'manager', isActive: true }).exec();
    if (managers.length === 0) {
      throw new BadRequestException('No existe un usuario MANAGER asignado a esta empresa.');
    }

    const actionUrl = '/advanced-management/1.1.3?mode=review';
    const alertPromises = managers.map(async (mgr) => {
      try {
        await this.alertsService.create({
          companyId: companyId.toString(),
          type: 'APPROVAL_REQUEST',
          message: `📋 Nueva solicitud de aprobación — Módulo: Asignación de Recursos SG-SST (1.1.3). Enviado por: ${user.email}. Fecha: ${new Date().toLocaleDateString()}.`,
          severity: AlertSeverity.HIGH,
          targetUserId: mgr._id.toString(),
          actionUrl,
          moduleCode: '1.1.3',
          moduleName: 'Asignación de Recursos',
          submittedBy: user.email,
          submittedAt: new Date().toISOString(),
          documentId: record._id.toString(),
        });
      } catch { /* alert failure should not block */ }
    });
    await Promise.all(alertPromises);

    record.auditHistory.push({
      field: 'approvalStatus',
      oldValue: 'DRAFT',
      newValue: 'PENDING_APPROVAL',
      user: user.email,
      timestamp: new Date(),
    });

    record.updatedBy = this.resolveUserId(user);
    return record.save();
  }

  async approveResourceAssignment(companyId: Types.ObjectId, user: UserDocument) {
    const record = await this.findOrCreateResourceAssignment(companyId);

    if (record.approvalStatus !== 'PENDING_APPROVAL') {
      throw new BadRequestException('El módulo no está pendiente de aprobación.');
    }

    // Check if manager acts as legal representative
    let managerActsAsLegalRepresentative = true;
    try {
      const profile = await this.companyProfileModel.findOne({ companyId }).lean().exec();
      if (profile !== null) {
        managerActsAsLegalRepresentative = (profile as unknown as Record<string, unknown>).managerActsAsLegalRepresentative !== false;
      }
    } catch { /* use default */ }

    const newStatus = managerActsAsLegalRepresentative
      ? ResourceAssignmentApprovalStatus.APPROVED_AND_SIGNED
      : ResourceAssignmentApprovalStatus.APPROVED;

    record.approvalStatus = newStatus;
    record.locked = true;
    record.approvedBy = {
      userId: this.resolveUserId(user).toString(),
      email: user.email,
      role: user.role,
      companyId: companyId.toString(),
      timestamp: new Date().toISOString(),
    };
    record.submittedAt = undefined;

    // Also update the legacy approval field for backward compatibility
    if (managerActsAsLegalRepresentative) {
      record.approval = {
        ...record.approval,
        approved: true,
        signedBy: user.email,
        signedAt: new Date(),
        version: parseFloat(record.currentVersion || '1.0'),
      };
    }

    const auditLabel = managerActsAsLegalRepresentative
      ? 'Aprobado y firmado por Representante Legal'
      : 'APPROVED';

    record.auditHistory.push({
      field: 'approvalStatus',
      oldValue: 'PENDING_APPROVAL',
      newValue: newStatus,
      user: user.email,
      timestamp: new Date(),
    });

    // Notify ADMIN users
    const admins = await this.userModel.find({ companyId, role: { $in: ['admin', 'owner'] }, isActive: true }).exec();
    const notificationMessage = managerActsAsLegalRepresentative
      ? `✅ Solicitud aprobada y firmada — Módulo: Asignación de Recursos SG-SST (1.1.3). Aprobado por: ${user.email}. Fecha: ${new Date().toLocaleDateString()}. El MANAGER actúa como Representante Legal, por lo que la aprobación incluye la firma legal.`
      : `✅ Solicitud aprobada — Módulo: Asignación de Recursos SG-SST (1.1.3). Aprobado por: ${user.email}. Fecha: ${new Date().toLocaleDateString()}.`;

    await Promise.all(admins.map((adminUser) =>
      this.alertsService.create({
        companyId: companyId.toString(),
        type: 'RESOURCE_ASSIGNMENT_APPROVED',
        message: notificationMessage,
        severity: AlertSeverity.HIGH,
      }).catch(() => {}),
    ));

    record.updatedBy = this.resolveUserId(user);
    return record.save();
  }

  async rejectResourceAssignment(companyId: Types.ObjectId, user: UserDocument, reason: string) {
    const record = await this.findOrCreateResourceAssignment(companyId);

    if (record.approvalStatus !== 'PENDING_APPROVAL') {
      throw new BadRequestException('El módulo no está pendiente de aprobación.');
    }

    record.approvalStatus = ResourceAssignmentApprovalStatus.REJECTED;
    record.locked = false;
    record.rejectionReason = reason;
    record.submittedAt = undefined;
    record.rejectedBy = {
      userId: this.resolveUserId(user).toString(),
      email: user.email,
      role: user.role,
      companyId: companyId.toString(),
      timestamp: new Date().toISOString(),
    };

    record.auditHistory.push({
      field: 'approvalStatus',
      oldValue: 'PENDING_APPROVAL',
      newValue: 'REJECTED',
      user: user.email,
      timestamp: new Date(),
    });
    record.auditHistory.push({
      field: 'rejectionReason',
      oldValue: '',
      newValue: reason,
      user: user.email,
      timestamp: new Date(),
    });

    // Notify ADMIN users
    const admins = await this.userModel.find({ companyId, role: { $in: ['admin', 'owner'] }, isActive: true }).exec();
    await Promise.all(admins.map((adminUser) =>
      this.alertsService.create({
        companyId: companyId.toString(),
        type: 'RESOURCE_ASSIGNMENT_REJECTED',
        message: `❌ Solicitud rechazada — Módulo: Asignación de Recursos SG-SST (1.1.3). Rechazado por: ${user.email}. Motivo: ${reason}. Fecha: ${new Date().toLocaleDateString()}.`,
        severity: AlertSeverity.HIGH,
      }).catch(() => {}),
    ));

    record.updatedBy = this.resolveUserId(user);
    return record.save();
  }

  async findOrCreateResponsibilities(companyId: Types.ObjectId) {
    const current = await this.responsibilitiesModel.findOne({ companyId, itemCode: '1.1.2' }).exec();
    if (current) return current;
    return this.responsibilitiesModel.create({ companyId, itemCode: '1.1.2' });
  }

  /**
   * Getter de lectura del registro de Responsibilities (1.1.2) por id (sin
   * crear un registro como hace findOrCreate). Usado por el handler cuando
   * getEntity llega con entityId.
   */
  async findResponsibilitiesById(id: Types.ObjectId): Promise<PhvaAdvancedResponsibilitiesDocument> {
    const record = await this.responsibilitiesModel.findById(id).exec();
    if (!record) throw new NotFoundException('Responsibilities not found');
    return record;
  }

  /**
   * Getter de lectura del registro vigente de la empresa (itemCode fijo
   * '1.1.2', sin crear un registro como hace findOrCreate). Usado por el
   * handler cuando getEntity llega sin entityId.
   */
  async findResponsibilitiesByCompany(companyId: Types.ObjectId): Promise<PhvaAdvancedResponsibilitiesDocument> {
    const record = await this.responsibilitiesModel
      .findOne({ companyId, itemCode: '1.1.2' })
      .exec();
    if (!record) throw new NotFoundException('Responsibilities not found');
    return record;
  }

  /**
   * Getter de lectura del estado de aprobación del registro de
   * Responsibilities (1.1.2) sin modificar nada.
   *
   * El estado de aprobación vive dentro de la fila '__META__' del arreglo
   * responsibilities (campo category con JSON). Este getter expone únicamente
   * el approvalStatus ya embebido por el servicio (submit/approve/reject) para
   * que el handler del Approval Workflow Core NO interprete el JSON: toda la
   * lectura del __META__ queda en el servicio.
   */
  getResponsibilitiesApprovalStatus(record: PhvaAdvancedResponsibilitiesDocument): string {
    const metaIndex = record.responsibilities.findIndex((entry) => entry.title === '__META__');
    if (metaIndex < 0) return 'DRAFT';
    try {
      const meta = JSON.parse(record.responsibilities[metaIndex].category) as {
        approvalStatus?: string;
      };
      return meta.approvalStatus ?? 'DRAFT';
    } catch {
      return 'DRAFT';
    }
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

  async submitResponsibilities(companyId: Types.ObjectId, user: UserDocument) {
    const record = await this.findOrCreateResponsibilities(companyId);
    // Find the __META__ row
    const metaIndex = record.responsibilities.findIndex((entry) => entry.title === '__META__');
    let newVer = '1.1';
    let assignedReviewer = 'Manager';

    if (metaIndex >= 0) {
      try {
        const meta = JSON.parse(record.responsibilities[metaIndex].category);
        // Bump version
        const currentVer = parseFloat(meta.currentVersion || '1.0');
        newVer = (currentVer + 0.1).toFixed(1);
        meta.approvalStatus = 'PENDING_APPROVAL';
        meta.locked = true;
        meta.submittedAt = new Date().toISOString();
        meta.currentVersion = newVer;
        meta.assignedReviewer = assignedReviewer;
        // Add version entry
        const versions = meta.versions || [];
        versions.unshift({ version: newVer, createdAt: new Date().toISOString(), createdBy: user.email, approvedBy: undefined });
        meta.versions = versions;
        // Add audit trail
        const auditHistory = meta.auditHistory || [];
        auditHistory.unshift(
          { action: 'Enviado a aprobación', user: user.email, date: new Date().toISOString(), field: 'approvalStatus', previousValue: 'DRAFT', newValue: 'PENDING_APPROVAL' },
          { action: 'Versión creada (snapshot inmmutable)', user: 'Sistema', date: new Date().toISOString(), field: 'version', previousValue: (parseFloat(newVer) - 0.1).toFixed(1), newValue: newVer },
          { action: 'Notificación enviada a MANAGER', user: 'Sistema', date: new Date().toISOString(), field: 'notification', previousValue: '', newValue: `${assignedReviewer} notificado` },
        );
        meta.auditHistory = auditHistory;
        record.responsibilities[metaIndex].category = JSON.stringify(meta);
      } catch { /* ignore meta parse error */ }
    } else {
      // Create __META__ row if it doesn't exist
      const meta = {
        approvalStatus: 'PENDING_APPROVAL',
        locked: true,
        submittedAt: new Date().toISOString(),
        currentVersion: newVer,
        assignedReviewer,
        versions: [{ version: newVer, createdAt: new Date().toISOString(), createdBy: user.email }],
        auditHistory: [
          { action: 'Enviado a aprobación', user: user.email, date: new Date().toISOString(), field: 'approvalStatus', previousValue: 'DRAFT', newValue: 'PENDING_APPROVAL' },
          { action: 'Versión creada (snapshot inmmutable)', user: 'Sistema', date: new Date().toISOString(), field: 'version', previousValue: '1.0', newValue: newVer },
          { action: 'Notificación enviada a MANAGER', user: 'Sistema', date: new Date().toISOString(), field: 'notification', previousValue: '', newValue: `${assignedReviewer} notificado` },
        ],
        rejectionReason: '',
        socializedAt: null,
      };
      const metaRow: ResponsibilityAssignmentEntry = {
        title: '__META__',
        category: JSON.stringify(meta),
        role: 'SYSTEM',
        active: false,
        requiresSignature: false,
        status: 'PENDIENTE',
        signature: { accepted: false, version: 1 },
      };
      record.responsibilities.push(metaRow as never);
    }

    // Validate that at least one MANAGER exists before creating alerts
    const managers = await this.userModel.find({ companyId, role: 'manager', isActive: true }).exec();
    console.log(`[submitResponsibilities] companyId=${companyId.toString()}, managersFound=${managers.length}`);
    for (const mgr of managers) {
      console.log(`[submitResponsibilities] managerFound id=${mgr._id.toString()}, email=${mgr.email}`);
    }

    if (managers.length === 0) {
      throw new BadRequestException('No existe un usuario MANAGER asignado a esta empresa.');
    }

    const alertPromises = managers.map(async (mgr) => {
      const actionUrl = `/advanced-management/1.1.2?mode=review`;
      const alertPayload = {
        companyId: companyId.toString(),
        type: 'APPROVAL_REQUEST',
        message: `📋 Nueva solicitud de aprobación — Módulo: Responsabilidades SG-SST (1.1.2). Enviado por: ${user.email}. Fecha: ${new Date().toLocaleDateString()}.`,
        severity: AlertSeverity.HIGH,
        targetUserId: mgr._id.toString(),
        actionUrl,
        moduleCode: '1.1.2',
        moduleName: 'Responsabilidades en SG-SST',
        submittedBy: user.email,
        submittedAt: new Date().toISOString(),
      };
      console.log(`[submitResponsibilities] creatingAlert for managerId=${mgr._id.toString()}, payload=${JSON.stringify(alertPayload)}`);
      try {
        const result = await this.alertsService.create(alertPayload);
        console.log(`[submitResponsibilities] alertCreated managerId=${mgr._id.toString()}, type=${alertPayload.type}`);
      } catch (alertError) {
        console.error(`[submitResponsibilities] alertCreationFailed managerId=${mgr._id.toString()}, error=${alertError instanceof Error ? alertError.message : String(alertError)}`);
        // Alert failure should not block submission
      }
    });
    await Promise.all(alertPromises);

    record.auditHistory.push({
      userId: this.resolveUserId(user),
      userEmail: user.email,
      changedAt: new Date(),
      field: 'approvalStatus',
      oldValue: 'DRAFT',
      newValue: 'PENDING_APPROVAL',
    });
    record.updatedBy = this.resolveUserId(user);
    return record.save();
  }

  async approveResponsibilities(companyId: Types.ObjectId, user: UserDocument) {
    const record = await this.findOrCreateResponsibilities(companyId);

    // Check if legal representative signature is merged (manager acts as legal rep)
    let managerActsAsLegalRepresentative = true; // default to true
    try {
      const profile = await this.companyProfileModel.findOne({ companyId }).lean().exec();
      if (profile !== null) {
        managerActsAsLegalRepresentative = (profile as unknown as Record<string, unknown>).managerActsAsLegalRepresentative !== false;
      }
    } catch { /* use default */ }

    const approvalStatus = managerActsAsLegalRepresentative ? 'APPROVED_AND_SIGNED' : 'APPROVED';
    const auditActionLabel = managerActsAsLegalRepresentative
      ? 'Aprobado y firmado por Representante Legal'
      : 'APPROVED';

    // Update metadata embedded in responsibilities array
    const responsibilities = record.responsibilities.map((entry) => {
      if (entry.title === '__META__') {
        try {
          const meta = JSON.parse(entry.category);
          meta.approvalStatus = approvalStatus;
          meta.locked = true;
          meta.submittedAt = null;
          meta.approvedBy = { userId: this.resolveUserId(user).toString(), email: user.email, role: user.role, companyId: companyId.toString(), timestamp: new Date().toISOString() };

          // When merged, also register legal representative signature
          if (managerActsAsLegalRepresentative) {
            meta.legalRepresentativeSigned = true;
            meta.legalRepresentativeUserId = this.resolveUserId(user).toString();
            meta.legalRepresentativeName = `${(user as unknown as Record<string, string>).firstName ?? ''} ${(user as unknown as Record<string, string>).lastName ?? ''}`.trim() || user.email;
            meta.legalRepresentativeSignedAt = new Date().toISOString();
            meta.socializedAt = null; // Move to socialization pending
          }

          entry.category = JSON.stringify(meta);
        } catch { /* ignore meta parse error */ }
      }
      return entry;
    });
    record.responsibilities = responsibilities as never;
    record.auditHistory.push({
      userId: this.resolveUserId(user),
      userEmail: user.email,
      changedAt: new Date(),
      field: 'approvalStatus',
      oldValue: 'PENDING_APPROVAL',
      newValue: approvalStatus,
    });

    if (managerActsAsLegalRepresentative) {
      record.auditHistory.push({
        userId: this.resolveUserId(user),
        userEmail: user.email,
        changedAt: new Date(),
        field: 'legalRepresentativeSigned',
        oldValue: 'false',
        newValue: 'true',
      });
      record.auditHistory.push({
        userId: this.resolveUserId(user),
        userEmail: user.email,
        changedAt: new Date(),
        field: 'legalRepresentativeName',
        oldValue: '',
        newValue: `${(user as unknown as Record<string, string>).firstName ?? ''} ${(user as unknown as Record<string, string>).lastName ?? ''}`.trim() || user.email,
      });
    }

    // Notify ADMIN users
    const admins = await this.userModel.find({ companyId, role: { $in: ['admin', 'owner'] }, isActive: true }).exec();
    const notificationMessage = managerActsAsLegalRepresentative
      ? `✅ Solicitud aprobada y firmada — Módulo: Responsabilidades SG-SST (1.1.2). Aprobado por: ${user.email}. Fecha: ${new Date().toLocaleDateString()}. El MANAGER actúa como Representante Legal, por lo que la aprobación incluye la firma legal. Próximo paso: Socialización.`
      : `✅ Solicitud aprobada — Módulo: Responsabilidades SG-SST (1.1.2). Aprobado por: ${user.email}. Fecha: ${new Date().toLocaleDateString()}.`;

    await Promise.all(admins.map((adminUser) =>
      this.alertsService.create({
        companyId: companyId.toString(),
        type: 'RESPONSIBILITIES_APPROVED',
        message: notificationMessage,
        severity: AlertSeverity.HIGH,
      }).catch(() => {}),
    ));

    record.updatedBy = this.resolveUserId(user);
    return record.save();
  }

  async rejectResponsibilities(companyId: Types.ObjectId, user: UserDocument, reason: string) {
    const record = await this.findOrCreateResponsibilities(companyId);
    const responsibilities = record.responsibilities.map((entry) => {
      if (entry.title === '__META__') {
        try {
          const meta = JSON.parse(entry.category);
          meta.approvalStatus = 'REJECTED';
          meta.locked = false;
          meta.submittedAt = null;
          meta.rejectionReason = reason;
          meta.rejectedBy = { userId: this.resolveUserId(user).toString(), email: user.email, role: user.role, companyId: companyId.toString(), timestamp: new Date().toISOString() };
          entry.category = JSON.stringify(meta);
        } catch { /* ignore meta parse error */ }
      }
      return entry;
    });
    record.responsibilities = responsibilities as never;
    record.auditHistory.push({
      userId: this.resolveUserId(user),
      userEmail: user.email,
      changedAt: new Date(),
      field: 'approvalStatus',
      oldValue: 'PENDING_APPROVAL',
      newValue: 'REJECTED',
    });
    record.auditHistory.push({
      userId: this.resolveUserId(user),
      userEmail: user.email,
      changedAt: new Date(),
      field: 'rejectionReason',
      oldValue: '',
      newValue: reason,
    });

    // Notify ADMIN users
    const admins = await this.userModel.find({ companyId, role: { $in: ['admin', 'owner'] }, isActive: true }).exec();
    await Promise.all(admins.map((adminUser) =>
      this.alertsService.create({
        companyId: companyId.toString(),
        type: 'RESPONSIBILITIES_REJECTED',
        message: `❌ Solicitud rechazada — Módulo: Responsabilidades SG-SST (1.1.2). Rechazado por: ${user.email}. Motivo: ${reason}. Fecha: ${new Date().toLocaleDateString()}.`, // eslint-disable-line max-len
        severity: AlertSeverity.HIGH,
      }).catch(() => {}),
    ));

    record.updatedBy = this.resolveUserId(user);
    return record.save();
  }

  async findOrCreateResponsableSst(companyId: Types.ObjectId) {
    const current = await this.responsableSstModel.findOne({ companyId, itemCode: '1.1.1' }).exec();
    if (current) return current;

    return this.responsableSstModel.create({ companyId, itemCode: '1.1.1' });
  }

  /**
   * Getter de lectura del registro del Responsable del SG-SST (1.1.1) por id
   * (sin crear un registro como hace findOrCreate). Usado por el
   * ResponsibleSgsstHandler del Approval Workflow Core y por la generación
   * documental (Fase 2).
   */
  async findResponsableSstById(id: Types.ObjectId): Promise<PhvaAdvancedResponsableSstDocument> {
    const record = await this.responsableSstModel.findById(id).exec();
    if (!record) throw new NotFoundException('Responsable SST not found');
    return record;
  }

  /**
   * Getter de lectura del registro vigente del Responsable del SG-SST (1.1.1)
   * por empresa (itemCode fijo, sin crear registros). Usado por el handler
   * cuando getEntity llega sin entityId.
   */
  async findResponsableSstByCompany(companyId: Types.ObjectId): Promise<PhvaAdvancedResponsableSstDocument> {
    const record = await this.responsableSstModel
      .findOne({ companyId, itemCode: '1.1.1' })
      .exec();
    if (!record) throw new NotFoundException('Responsable SST not found');
    return record;
  }

  /**
   * Envía a aprobación el punto PHVA 1.1.1 (Responsable del SG-SST).
   *
   * Fase 2 — el flujo de aprobación se delega al Approval Workflow Core
   * (el controller crea el ApprovalRequest); este método solo actualiza el
   * estado local del módulo (PENDING_APPROVAL, versión, auditoría y alertas)
   * para compatibilidad con el frontend, igual que el patrón de Resource
   * Assignment (1.1.3).
   */
  async submitResponsableSst(companyId: Types.ObjectId, user: UserDocument) {
    const record = await this.findOrCreateResponsableSst(companyId);

    if (record.approvalStatus === ResponsableSstApprovalStatus.PENDING_APPROVAL) {
      throw new BadRequestException('El módulo ya está pendiente de aprobación.');
    }
    if (
      record.approvalStatus === ResponsableSstApprovalStatus.APPROVED ||
      record.approvalStatus === ResponsableSstApprovalStatus.APPROVED_AND_SIGNED
    ) {
      throw new BadRequestException('El módulo ya está aprobado.');
    }

    // Fase 8.3.C — GATE DE APROBACIÓN: el estándar solo puede enviarse a
    // aprobación si cumple TODOS los requisitos (COMPLIES). Esto garantiza el
    // invariante `APPROVED → documento generado` (generateResponsibleSgsstDocument
    // exige COMPLIES). No bloquea guardar el formulario: un DRAFT incompleto
    // sigue siendo editable.
    const compliance = this.calculateCompliance(record);
    record.complianceStatus = compliance.status;
    record.complianceReason = compliance.reason;
    if (compliance.status !== ResponsableSstComplianceStatus.COMPLIES) {
      throw new BadRequestException(
        `No se puede enviar a aprobación el estándar 1.1.1 (Responsable del SG-SST) porque no cumple todos los requisitos. Estado: ${compliance.status}. ${compliance.reason}`,
      );
    }

    // Fase B — versionado estructurado: se crea un snapshot inmutable del
    // estado que se envía a aprobación. Un reenvío tras rechazo conserva la
    // versión rechazada (con su rejectionReason) y genera una nueva versión
    // con los datos corregidos.
    const isResubmit = record.approvalStatus === ResponsableSstApprovalStatus.REJECTED;
    const newVer = bumpResponsableSstVersion(record.currentVersion);
    if (!Array.isArray(record.versions)) {
      (record as unknown as { versions: ResponsableSstVersion[] }).versions = [];
    }
    record.versions.unshift(
      buildResponsableSstVersion({
        record,
        version: newVer,
        reason: isResubmit ? 'RESUBMIT' : 'SUBMIT',
        action: isResubmit ? 'Reenviado a aprobación tras corrección' : 'Enviado a aprobación',
        createdBy: this.resolveUserId(user),
        createdByEmail: user.email,
        approvalStatus: ResponsableSstApprovalStatus.PENDING_APPROVAL,
        submittedAt: new Date(),
      }),
    );

    record.approvalStatus = ResponsableSstApprovalStatus.PENDING_APPROVAL;
    record.locked = true;
    record.currentVersion = newVer;
    record.submittedBy = this.resolveUserId(user);
    record.submittedAt = new Date();
    record.assignedReviewer = 'Manager';
    // En reenvío se limpia el rechazo del ciclo anterior (la versión
    // rechazada y la auditoría lo conservan históricamente).
    record.rejectionReason = '';

    // Validate that at least one MANAGER exists before creating alerts
    const managers = await this.userModel.find({ companyId, role: 'manager', isActive: true }).exec();
    if (managers.length === 0) {
      throw new BadRequestException('No existe un usuario MANAGER asignado a esta empresa.');
    }

    const actionUrl = '/advanced-management/1.1.1?mode=review';
    const alertPromises = managers.map(async (mgr) => {
      try {
        await this.alertsService.create({
          companyId: companyId.toString(),
          type: 'APPROVAL_REQUEST',
          message: `📋 Nueva solicitud de aprobación — Responsable del SG-SST (1.1.1). Enviado por: ${user.email}. Fecha: ${new Date().toLocaleDateString()}.`,
          severity: AlertSeverity.HIGH,
          targetUserId: mgr._id.toString(),
          actionUrl,
          moduleCode: '1.1.1',
          moduleName: 'Responsable del SG-SST',
          submittedBy: user.email,
          submittedAt: new Date().toISOString(),
          documentId: record._id.toString(),
        });
      } catch { /* alert failure should not block */ }
    });
    await Promise.all(alertPromises);

    record.auditHistory.push({
      userId: this.resolveUserId(user),
      userEmail: user.email,
      changedAt: new Date(),
      field: 'approvalStatus',
      oldValue: 'DRAFT',
      newValue: 'PENDING_APPROVAL',
    });

    record.updatedBy = this.resolveUserId(user);
    return record.save();
  }

  /**
   * Aprueba el punto PHVA 1.1.1 (Responsable del SG-SST). Reutilizado por el
   * ResponsibleSgsstHandler del Approval Workflow Core: conserva el estado
   * local (APPROVED/APPROVED_AND_SIGNED), approvedBy, auditHistory y las
   * alertas a admins.
   */
  async approveResponsableSst(companyId: Types.ObjectId, user: UserDocument) {
    const record = await this.findOrCreateResponsableSst(companyId);

    if (record.approvalStatus !== ResponsableSstApprovalStatus.PENDING_APPROVAL) {
      throw new BadRequestException('El módulo no está pendiente de aprobación.');
    }

    // Fase 8.3.C — validación defensiva: aunque el submit ya validó COMPLIES,
    // se vuelve a verificar aquí para impedir que llamadas directas o cambios
    // futuros aprueben un estado inválido (invariante `APPROVED → documento`).
    const compliance = this.calculateCompliance(record);
    if (compliance.status !== ResponsableSstComplianceStatus.COMPLIES) {
      throw new BadRequestException(
        `No se puede aprobar el estándar 1.1.1 (Responsable del SG-SST) porque no cumple todos los requisitos. Estado: ${compliance.status}. ${compliance.reason}`,
      );
    }

    // Check if manager acts as legal representative
    let managerActsAsLegalRepresentative = true;
    try {
      const profile = await this.companyProfileModel.findOne({ companyId }).lean().exec();
      if (profile !== null) {
        managerActsAsLegalRepresentative = (profile as unknown as Record<string, unknown>).managerActsAsLegalRepresentative !== false;
      }
    } catch { /* use default */ }

    const newStatus = managerActsAsLegalRepresentative
      ? ResponsableSstApprovalStatus.APPROVED_AND_SIGNED
      : ResponsableSstApprovalStatus.APPROVED;

    record.approvalStatus = newStatus;
    record.locked = true;
    record.approvedBy = {
      userId: this.resolveUserId(user).toString(),
      email: user.email,
      role: user.role,
      companyId: companyId.toString(),
      timestamp: new Date().toISOString(),
    };
    record.submittedAt = undefined;

    // Fase B — la versión aprobada queda inmutable: se marca su metadata como
    // APPROVED/APPROVED_AND_SIGNED con approvedAt (el snapshot no cambia).
    const approvedVersion = record.versions?.[0];
    if (approvedVersion) {
      approvedVersion.approvalStatus = newStatus;
      approvedVersion.approvedAt = new Date();
    }

    record.auditHistory.push({
      userId: this.resolveUserId(user),
      userEmail: user.email,
      changedAt: new Date(),
      field: 'approvalStatus',
      oldValue: 'PENDING_APPROVAL',
      newValue: newStatus,
    });

    // Notify ADMIN users
    const admins = await this.userModel.find({ companyId, role: { $in: ['admin', 'owner'] }, isActive: true }).exec();
    const notificationMessage = managerActsAsLegalRepresentative
      ? `✅ Solicitud aprobada y firmada — Responsable del SG-SST (1.1.1). Aprobado por: ${user.email}. El MANAGER actúa como Representante Legal, por lo que la aprobación incluye la firma legal.`
      : `✅ Solicitud aprobada — Responsable del SG-SST (1.1.1). Aprobado por: ${user.email}.`;

    await Promise.all(admins.map((adminUser) =>
      this.alertsService.create({
        companyId: companyId.toString(),
        type: 'RESPONSABLE_SST_APPROVED',
        message: notificationMessage,
        severity: AlertSeverity.HIGH,
      }).catch(() => {}),
    ));

    record.updatedBy = this.resolveUserId(user);
    return record.save();
  }

  /**
   * Rechaza el punto PHVA 1.1.1 (Responsable del SG-SST). Reutilizado por el
   * ResponsibleSgsstHandler del Approval Workflow Core: conserva REJECTED,
   * rejectionReason, rejectedBy y auditHistory.
   */
  async rejectResponsableSst(companyId: Types.ObjectId, user: UserDocument, reason: string) {
    const record = await this.findOrCreateResponsableSst(companyId);

    if (record.approvalStatus !== ResponsableSstApprovalStatus.PENDING_APPROVAL) {
      throw new BadRequestException('El módulo no está pendiente de aprobación.');
    }

    record.approvalStatus = ResponsableSstApprovalStatus.REJECTED;
    record.locked = false;
    record.rejectionReason = reason;
    record.submittedAt = undefined;
    record.rejectedBy = {
      userId: this.resolveUserId(user).toString(),
      email: user.email,
      role: user.role,
      companyId: companyId.toString(),
      timestamp: new Date().toISOString(),
    };

    // Fase B — la versión rechazada se conserva (snapshot inmutable) y solo
    // cambia su metadata para reflejar el rechazo.
    const rejectedVersion = record.versions?.[0];
    if (rejectedVersion) {
      rejectedVersion.approvalStatus = ResponsableSstApprovalStatus.REJECTED;
      rejectedVersion.rejectionReason = reason;
    }

    record.auditHistory.push({
      userId: this.resolveUserId(user),
      userEmail: user.email,
      changedAt: new Date(),
      field: 'approvalStatus',
      oldValue: 'PENDING_APPROVAL',
      newValue: 'REJECTED',
    });
    record.auditHistory.push({
      userId: this.resolveUserId(user),
      userEmail: user.email,
      changedAt: new Date(),
      field: 'rejectionReason',
      oldValue: '',
      newValue: reason,
    });

    // Notify ADMIN users
    const admins = await this.userModel.find({ companyId, role: { $in: ['admin', 'owner'] }, isActive: true }).exec();
    await Promise.all(admins.map((adminUser) =>
      this.alertsService.create({
        companyId: companyId.toString(),
        type: 'RESPONSABLE_SST_REJECTED',
        message: `❌ Solicitud rechazada — Responsable del SG-SST (1.1.1). Rechazado por: ${user.email}. Motivo: ${reason}.`,
        severity: AlertSeverity.HIGH,
      }).catch(() => {}),
    ));

    record.updatedBy = this.resolveUserId(user);
    return record.save();
  }

  /**
   * Genera el documento formal del Responsable del SG-SST (PHVA 1.1.1).
   *
   * Fase 2 — primer documento formal del sistema con enfoque Resolución 0312
   * de 2019. Flujo:
   *
   *   1. Validar que el registro existe y pertenece a la empresa.
   *   2. Validación completa (complianceStatus COMPLIES).
   *   3. Asegurar la plantilla de sistema (SystemTemplateService).
   *   4. Resolver variables de dominio (ResponsibleSgsstVariableResolver).
   *   5. Delegar en DocumentGenerationService.generateDocument() con
   *      sourceModule PHVA_ADVANCED, sourceEntity RESPONSIBLE_SG_SST y
   *      sourceEntityId = id del registro PHVA 1.1.1.
   *
   * @param params.companyId - Empresa propietaria.
   * @param params.sourceEntityId - Id del registro PHVA 1.1.1.
   * @param params.approval - Metadatos de aprobación (cuando se genera tras
   * la aprobación en el Approval Workflow Core).
   */
  async generateResponsibleSgsstDocument(params: {
    companyId: Types.ObjectId;
    sourceEntityId: Types.ObjectId;
    approval?: DocumentApprovalMetadata;
  }): Promise<DocumentGenerationResult> {
    const record = await this.findResponsableSstById(params.sourceEntityId);

    if (record.companyId.toString() !== params.companyId.toString()) {
      throw new NotFoundException('Responsable SST not found');
    }

    if (record.complianceStatus !== ResponsableSstComplianceStatus.COMPLIES) {
      throw new BadRequestException(
        'El punto PHVA 1.1.1 no está completo: complete la información y evidencias antes de generar el documento.',
      );
    }

    const template = await this.systemTemplateService.ensureResponsibleSgsstTemplate();
    const domainContext = await this.responsibleSgsstResolver.resolve(params.companyId, record._id);

    const context: Record<string, unknown> = {
      ...domainContext,
      document: {
        code: 'PHVA-1.1.1',
        version: record.currentVersion || '1.0',
        generatedAt: new Date().toISOString(),
      },
      // Fase 8.3.D — la aprobación legible la resuelve el resolver desde la
      // metadata del registro (record.approvedBy), que approveResponsableSst
      // guarda ANTES de que el listener del Approval Workflow genere el
      // documento. Los params (ObjectId crudo) solo son fallback. Acceso
      // defensivo: algunos specs/stubs del servicio devuelven un contexto de
      // dominio sin la rama approval.
      approval: {
        status:
          domainContext.approval?.status && domainContext.approval.status !== 'Borrador'
            ? domainContext.approval.status
            : params.approval?.status ?? 'Pendiente',
        approvedBy:
          domainContext.approval?.approvedBy &&
          domainContext.approval.approvedBy !== 'No registrado'
            ? domainContext.approval.approvedBy
            : (params.approval?.approvedBy?.toString() ?? ''),
        approvedAt:
          domainContext.approval?.approvedAt &&
          domainContext.approval.approvedAt !== 'No registrada'
            ? domainContext.approval.approvedAt
            : (params.approval?.approvedAt?.toISOString() ?? ''),
      },
    };

    return this.documentGenerationService.generateDocument({
      companyId: params.companyId,
      templateId: template._id.toString(),
      sourceModule: DocumentSourceModule.PHVA_ADVANCED,
      sourceEntity: PHVA_SOURCE_ENTITY_RESPONSIBLE_SG_SST,
      sourceEntityId: record._id,
      generatedBy: params.approval?.approvedBy,
      context,
      approval: params.approval,
    });
  }

  /**
   * Genera el acta de conformación del COPASST (Fase 3).
   *
   * Flujo (mismo patrón que generateResponsibleSgsstDocument):
   *
   *   1. Validar que el periodo COPASST existe y pertenece a la empresa.
   *   2. Asegurar la plantilla de sistema (SystemTemplateService).
   *   3. Resolver variables de dominio (CopasstVariableResolverService).
   *   4. Delegar en DocumentGenerationService.generateDocument() con
   *      sourceModule PHVA_ADVANCED, sourceEntity COPASST y
   *      sourceEntityId = id del periodo COPASST.
   *
   * Las listas del contexto (members, employerRepresentatives,
   * workerRepresentatives, functions) se entregan como texto multilínea:
   * el renderer DOCX (docxtemplater con parser de paths punto a punto) espera
   * valores escalares por placeholder, no arreglos.
   *
   * @param params.companyId - Empresa propietaria.
   * @param params.sourceEntityId - Id del periodo COPASST aprobado.
   * @param params.approval - Metadatos de aprobación (cuando se genera tras la
   * aprobación en el Approval Workflow Core).
   */
  async generateCopasstDocument(params: {
    companyId: Types.ObjectId;
    sourceEntityId: Types.ObjectId;
    approval?: DocumentApprovalMetadata;
  }): Promise<DocumentGenerationResult> {
    const period = await this.copasstPeriodModel.findById(params.sourceEntityId).exec();

    if (!period) {
      throw new NotFoundException('COPASST period not found');
    }

    if (period.companyId.toString() !== params.companyId.toString()) {
      throw new NotFoundException('COPASST period not found');
    }

    // Defensa en profundidad (patrón Fase 2 que valida COMPLIES): el acta de
    // conformación solo se genera para periodos aprobados. El listener del
    // Approval Workflow dispara DESPUÉS de approve() (que deja el periodo en
    // APPROVED / APPROVED_AND_SIGNED), por lo que una llamada directa tampoco
    // puede generar el documento de un periodo DRAFT o REJECTED.
    const periodApproved =
      period.approvalStatus === 'APPROVED' ||
      period.approvalStatus === 'APPROVED_AND_SIGNED';
    // La metadata de aprobación solo habilita la generación cuando expresa un
    // estado realmente aprobado (el generador siempre envía 'APPROVED'); así
    // un estado ajeno (REJECTED, ADJUSTMENTS_REQUESTED) no la autoriza.
    const approvalCarried =
      params.approval?.status === 'APPROVED' ||
      params.approval?.status === 'APPROVED_AND_SIGNED';
    if (!periodApproved && !approvalCarried) {
      throw new BadRequestException(
        'El periodo COPASST no está aprobado: no se puede generar el acta de conformación.',
      );
    }

    const template = await this.systemTemplateService.ensureCopasstTemplate();
    const domainContext = await this.copasstResolver.resolve(
      params.companyId,
      period._id,
    );

    const context: Record<string, unknown> = {
      ...domainContext,
      // Listas → texto multilínea para el renderer DOCX.
      members: domainContext.members.join('\n'),
      employerRepresentatives: domainContext.employerRepresentatives.join('\n'),
      workerRepresentatives: domainContext.workerRepresentatives.join('\n'),
      functions: domainContext.functions.join('\n'),
      document: {
        code: 'PHVA-COPASST',
        version: period.currentVersion || '1.0',
        generatedAt: new Date().toISOString(),
      },
      approval: {
        status: params.approval?.status ?? 'Pendiente',
        approvedBy: params.approval?.approvedBy?.toString() ?? '',
        approvedAt: params.approval?.approvedAt?.toISOString() ?? '',
      },
    };

    return this.documentGenerationService.generateDocument({
      companyId: params.companyId,
      templateId: template._id.toString(),
      sourceModule: DocumentSourceModule.PHVA_ADVANCED,
      sourceEntity: PHVA_SOURCE_ENTITY_COPASST,
      sourceEntityId: period._id,
      generatedBy: params.approval?.approvedBy,
      context,
      approval: params.approval,
    });
  }

  /**
   * Genera el documento formal de la Matriz de Responsabilidades del SG-SST
   * (PHVA 1.1.2).
   *
   * Fase 4 — mismo patrón que generateResponsibleSgsstDocument (Fase 2) y
   * generateCopasstDocument (Fase 3):
   *
   *   1. Validar que el registro existe y pertenece a la empresa.
   *   2. Validar estado aprobado (el approvalStatus vive en la fila __META__;
   *      se lee con getResponsibilitiesApprovalStatus, sin interpretar el JSON).
   *   3. Asegurar la plantilla de sistema (SystemTemplateService).
   *   4. Resolver variables de dominio (ResponsibilitiesVariableResolverService).
   *   5. Delegar en DocumentGenerationService.generateDocument() con
   *      sourceModule PHVA_ADVANCED, sourceEntity RESPONSIBILITIES y
   *      sourceEntityId = id del registro PHVA 1.1.2.
   *
   * Las listas del contexto (responsiblePersons, assignments) se entregan
   * como texto multilínea: el renderer DOCX espera valores escalares por
   * placeholder, no arreglos.
   *
   * @param params.companyId - Empresa propietaria.
   * @param params.sourceEntityId - Id del registro PHVA 1.1.2.
   * @param params.approval - Metadatos de aprobación (cuando se genera tras la
   * aprobación en el Approval Workflow Core).
   */
  async generateResponsibilitiesDocument(params: {
    companyId: Types.ObjectId;
    sourceEntityId: Types.ObjectId;
    approval?: DocumentApprovalMetadata;
  }): Promise<DocumentGenerationResult> {
    const record = await this.findResponsibilitiesById(params.sourceEntityId);

    if (record.companyId.toString() !== params.companyId.toString()) {
      throw new NotFoundException('Responsibilities not found');
    }

    // Defensa en profundidad (patrón Fase 3): el documento solo se genera para
    // registros aprobados. El listener del Approval Workflow dispara DESPUÉS
    // de approve() (que deja el __META__ en APPROVED / APPROVED_AND_SIGNED).
    const recordApproved = ['APPROVED', 'APPROVED_AND_SIGNED'].includes(
      this.getResponsibilitiesApprovalStatus(record),
    );
    // La metadata de aprobación solo habilita la generación cuando expresa un
    // estado realmente aprobado (el generador siempre envía 'APPROVED').
    const approvalCarried =
      params.approval?.status === 'APPROVED' ||
      params.approval?.status === 'APPROVED_AND_SIGNED';
    if (!recordApproved && !approvalCarried) {
      throw new BadRequestException(
        'El punto PHVA 1.1.2 no está aprobado: no se puede generar el documento de responsabilidades.',
      );
    }

    const template = await this.systemTemplateService.ensureResponsibilitiesTemplate();
    const domainContext = await this.responsibilitiesResolver.resolve(
      params.companyId,
      record._id,
    );

    const context: Record<string, unknown> = {
      ...domainContext,
      // Listas → texto multilínea para el renderer DOCX.
      responsiblePersons: domainContext.responsiblePersons.join('\n'),
      assignments: domainContext.assignments.join('\n'),
      document: {
        code: 'PHVA-1.1.2',
        date: new Date().toISOString(),
      },
      approval: {
        status: params.approval?.status ?? 'Pendiente',
        approvedBy: params.approval?.approvedBy?.toString() ?? '',
        approvedAt: params.approval?.approvedAt?.toISOString() ?? '',
      },
    };

    return this.documentGenerationService.generateDocument({
      companyId: params.companyId,
      templateId: template._id.toString(),
      sourceModule: DocumentSourceModule.PHVA_ADVANCED,
      sourceEntity: PHVA_SOURCE_ENTITY_RESPONSIBILITIES,
      sourceEntityId: record._id,
      generatedBy: params.approval?.approvedBy,
      context,
      approval: params.approval,
    });
  }

  /**
   * Genera el documento formal de la Asignación de Recursos para el SG-SST
   * (PHVA 1.1.3).
   *
   * Fase 5 — mismo patrón que generateResponsibleSgsstDocument (Fase 2),
   * generateCopasstDocument (Fase 3) y generateResponsibilitiesDocument (Fase 4):
   *
   *   1. Validar que el registro existe y pertenece a la empresa.
   *   2. Validar estado aprobado (approvalStatus APPROVED/APPROVED_AND_SIGNED).
   *   3. Asegurar la plantilla de sistema (SystemTemplateService).
   *   4. Resolver variables de dominio (ResourceAssignmentVariableResolverService).
   *   5. Delegar en DocumentGenerationService.generateDocument() con
   *      sourceModule PHVA_ADVANCED, sourceEntity RESOURCE_ASSIGNMENT y
   *      sourceEntityId = id del registro PHVA 1.1.3.
   *
   * Las listas del contexto (resources.human, resources.technical,
   * resources.financial, resources.physical) se entregan como texto
   * multilínea: el renderer DOCX espera valores escalares por placeholder, no
   * arreglos.
   *
   * @param params.companyId - Empresa propietaria.
   * @param params.sourceEntityId - Id del registro PHVA 1.1.3.
   * @param params.approval - Metadatos de aprobación (cuando se genera tras la
   * aprobación en el Approval Workflow Core).
   */
  async generateResourceAssignmentDocument(params: {
    companyId: Types.ObjectId;
    sourceEntityId: Types.ObjectId;
    approval?: DocumentApprovalMetadata;
  }): Promise<DocumentGenerationResult> {
    const record = await this.findResourceAssignmentById(params.sourceEntityId);

    if (record.companyId.toString() !== params.companyId.toString()) {
      throw new NotFoundException('Resource assignment not found');
    }

    // Defensa en profundidad (patrón Fases 3-4): el documento solo se genera
    // para registros aprobados. El listener del Approval Workflow dispara
    // DESPUÉS de approve() (que deja el registro en APPROVED /
    // APPROVED_AND_SIGNED).
    const recordApproved =
      record.approvalStatus === 'APPROVED' ||
      record.approvalStatus === 'APPROVED_AND_SIGNED';
    // La metadata de aprobación solo habilita la generación cuando expresa un
    // estado realmente aprobado (el generador siempre envía 'APPROVED').
    const approvalCarried =
      params.approval?.status === 'APPROVED' ||
      params.approval?.status === 'APPROVED_AND_SIGNED';
    if (!recordApproved && !approvalCarried) {
      throw new BadRequestException(
        'El punto PHVA 1.1.3 no está aprobado: no se puede generar el documento de asignación de recursos.',
      );
    }

    const template = await this.systemTemplateService.ensureResourceAssignmentTemplate();
    const domainContext = await this.resourceAssignmentResolver.resolve(
      params.companyId,
      record._id,
    );

    const context: Record<string, unknown> = {
      ...domainContext,
      // Listas → texto multilínea para el renderer DOCX.
      resources: {
        human: domainContext.resources.human.join('\n'),
        technical: domainContext.resources.technical.join('\n'),
        financial: domainContext.resources.financial.join('\n'),
        physical: domainContext.resources.physical.join('\n'),
      },
      document: {
        code: 'PHVA-1.1.3',
        date: new Date().toISOString(),
      },
      approval: {
        status: params.approval?.status ?? 'Pendiente',
        approvedBy: params.approval?.approvedBy?.toString() ?? '',
        approvedAt: params.approval?.approvedAt?.toISOString() ?? '',
      },
    };

    return this.documentGenerationService.generateDocument({
      companyId: params.companyId,
      templateId: template._id.toString(),
      sourceModule: DocumentSourceModule.PHVA_ADVANCED,
      sourceEntity: PHVA_SOURCE_ENTITY_RESOURCE_ASSIGNMENT,
      sourceEntityId: record._id,
      generatedBy: params.approval?.approvedBy,
      context,
      approval: params.approval,
    });
  }

  /**
   * Genera el documento formal de la Política de Seguridad y Salud en el
   * Trabajo (PHVA 2.1.1).
   *
   * Fase 6 — mismo patrón que generateResponsibleSgsstDocument (Fase 2),
   * generateCopasstDocument (Fase 3), generateResponsibilitiesDocument (Fase 4)
   * y generateResourceAssignmentDocument (Fase 5):
   *
   *   1. Validar que la política existe y pertenece a la empresa.
   *   2. Validar estado aprobado (SstPolicyStatus.APPROVED).
   *   3. Asegurar la plantilla de sistema (SystemTemplateService).
   *   4. Resolver variables de dominio (SstPolicyVariableResolverService).
   *   5. Delegar en DocumentGenerationService.generateDocument() con
   *      sourceModule PHVA_ADVANCED, sourceEntity SST_POLICY y
   *      sourceEntityId = id del registro de la política.
   *
   * @param params.companyId - Empresa propietaria.
   * @param params.sourceEntityId - Id del registro de la política (SstPolicy).
   * @param params.approval - Metadatos de aprobación (cuando se genera tras la
   * aprobación en el Approval Workflow Core).
   */
  async generateSstPolicyDocument(params: {
    companyId: Types.ObjectId;
    sourceEntityId: Types.ObjectId;
    approval?: DocumentApprovalMetadata;
  }): Promise<DocumentGenerationResult> {
    const record = await this.findSstPolicyById(params.sourceEntityId);

    if (record.companyId.toString() !== params.companyId.toString()) {
      throw new NotFoundException('SST Policy not found');
    }

    // Defensa en profundidad (patrón Fases 3-5): el documento solo se genera
    // para políticas aprobadas. El listener del Approval Workflow dispara
    // DESPUÉS de approve() (que deja el registro en SstPolicyStatus.APPROVED).
    const recordApproved = record.status === SstPolicyStatus.APPROVED;
    // La metadata de aprobación solo habilita la generación cuando expresa un
    // estado realmente aprobado (el generador siempre envía 'APPROVED').
    const approvalCarried =
      params.approval?.status === 'APPROVED' ||
      params.approval?.status === 'APPROVED_AND_SIGNED';
    if (!recordApproved && !approvalCarried) {
      throw new BadRequestException(
        'La política SST no está aprobada: no se puede generar el documento.',
      );
    }

    const template = await this.systemTemplateService.ensureSstPolicyTemplate();
    const domainContext = await this.sstPolicyResolver.resolve(
      params.companyId,
      record._id,
    );

    const context: Record<string, unknown> = {
      ...domainContext,
      document: {
        code: 'PHVA-2.1.1',
        version: record.currentVersion || '1.0',
        generatedAt: new Date().toISOString(),
      },
      approval: {
        status: params.approval?.status ?? 'Pendiente',
        approvedBy: params.approval?.approvedBy?.toString() ?? '',
        approvedAt: params.approval?.approvedAt?.toISOString() ?? '',
      },
    };

    return this.documentGenerationService.generateDocument({
      companyId: params.companyId,
      templateId: template._id.toString(),
      sourceModule: DocumentSourceModule.PHVA_ADVANCED,
      sourceEntity: PHVA_SOURCE_ENTITY_SST_POLICY,
      sourceEntityId: record._id,
      generatedBy: params.approval?.approvedBy,
      context,
      approval: params.approval,
    });
  }

  /**
   * Fase D — inmutabilidad: bloquea cualquier modificación de contenido cuando
   * el documento está aprobado o bloqueado (incluye PENDING_APPROVAL, que el
   * submit deja con locked=true). Operaciones administrativas que no toquen el
   * contenido aprobado no pasan por este guard.
   */
  private assertResponsableSstEditable(record: PhvaAdvancedResponsableSstDocument) {
    if (
      record.approvalStatus === ResponsableSstApprovalStatus.APPROVED ||
      record.approvalStatus === ResponsableSstApprovalStatus.APPROVED_AND_SIGNED ||
      record.locked
    ) {
      throw new BadRequestException('El módulo está bloqueado. No se puede modificar un documento aprobado.');
    }
  }

  async updateResponsableSst(companyId: Types.ObjectId, user: UserDocument, dto: UpdateResponsableSstDto) {
    const record = await this.findOrCreateResponsableSst(companyId);
    this.assertResponsableSstEditable(record);
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

  async attachLicenseDocument(params: {
    companyId: Types.ObjectId;
    user: UserDocument;
    type: ResponsableSstDocumentType;
    fileName: string;
    fileUrl: string;
    ocrLicenseNumber?: string;
    ocrIssueDate?: string;
    ocrExpirationDate?: string;
    ocrIssuingAuthority?: string;
    ocrLicenseHolder?: string;
    rawOcrText?: string;
  }) {
    if (!SST_LICENSE_DOCUMENT_TYPES.includes(params.type)) {
      throw new BadRequestException('El tipo de documento no es una licencia SST válida.');
    }
    const record = await this.findOrCreateResponsableSst(params.companyId);
    this.assertResponsableSstEditable(record);
    const previousDocument = record.documents.find((document) => document.type === params.type);

    const storedDocument: ResponsableSstStoredDocument = {
      type: params.type,
      fileName: params.fileName,
      fileUrl: params.fileUrl,
      detectedDate: params.ocrIssueDate ? this.parseOptionalDate(params.ocrIssueDate, 'ocrIssueDate') : undefined,
      uploadedBy: this.resolveUserId(params.user),
      uploadedAt: new Date(),
    };

    record.documents = [
      ...record.documents.filter((document) => document.type !== params.type),
      storedDocument,
    ];

    // Store OCR entry
    const detectedIssueDate = params.ocrIssueDate ? this.parseOptionalDate(params.ocrIssueDate, 'ocrIssueDate') : this.detectDateFromFileName(params.fileName);
    const detectedExpirationDate = params.ocrExpirationDate ? this.parseOptionalDate(params.ocrExpirationDate, 'ocrExpirationDate') : undefined;
    const ocrEntry = {
      detectedLicenseNumber: params.ocrLicenseNumber || this.detectLicenseNumberFromText(params.fileName + ' ' + (params.rawOcrText || '')),
      detectedIssueDate,
      detectedExpirationDate,
      detectedIssuingAuthority: params.ocrIssuingAuthority,
      detectedLicenseHolder: params.ocrLicenseHolder,
      documentId: storedDocument.fileName,
      sourceFileName: params.fileName,
      rawOcrText: params.rawOcrText,
      confidence: params.ocrLicenseNumber || params.ocrIssueDate || params.ocrExpirationDate ? 0.9 : 0.35,
      hasManualModification: false,
    };
    record.licenseOcrEntries.push(ocrEntry as never);

    // Auto-populate license fields from OCR if not set
    // NOTA normativa (Fase 1.1.1): la fecha detectada por OCR se conserva como
    // dato documental (detectedExpirationDate en licenseOcrEntries) pero NO se
    // auto-asigna a licenseExpiresAt. Solo una corrección manual explícita
    // (registerLicenseOcrModification) puede poblar el campo documental.
    if (params.ocrLicenseNumber && !record.sstLicenseNumber) record.sstLicenseNumber = params.ocrLicenseNumber;
    if (detectedIssueDate && !record.licenseIssueDate) record.licenseIssueDate = detectedIssueDate;
    if (params.ocrIssuingAuthority && !record.issuingAuthority) record.issuingAuthority = params.ocrIssuingAuthority;
    if (params.ocrLicenseHolder && !record.fullName) record.fullName = params.ocrLicenseHolder;

    // Audit: document upload
    record.auditHistory.push({
      userId: this.resolveUserId(params.user),
      userEmail: params.user.email,
      changedAt: new Date(),
      field: `documents.${params.type}`,
      oldValue: previousDocument?.fileName ?? '',
      newValue: params.fileName,
    });

    // Audit: OCR auto-population
    if (params.ocrLicenseNumber || params.ocrIssueDate || params.ocrExpirationDate) {
      record.auditHistory.push({
        userId: this.resolveUserId(params.user),
        userEmail: params.user.email,
        changedAt: new Date(),
        field: 'license.ocr',
        oldValue: '',
        newValue: JSON.stringify({
          licenseNumber: params.ocrLicenseNumber || '—',
          issueDate: params.ocrIssueDate || '—',
          expirationDate: params.ocrExpirationDate || '—',
          authority: params.ocrIssuingAuthority || '—',
          holder: params.ocrLicenseHolder || '—',
        }),
        warning: 'Valores detectados automáticamente mediante OCR.',
      });
    }

    this.resolveLicenseStatus(record);
    const compliance = this.calculateCompliance(record);
    record.complianceStatus = compliance.status;
    record.complianceReason = compliance.reason;
    record.alerts = this.buildAlertSchedule(record);
    record.updatedBy = this.resolveUserId(params.user);

    await record.save();
    await this.generateAlerts(record);
    return record;
  }

  async registerLicenseOcrModification(companyId: Types.ObjectId, user: UserDocument, ocrIndex: number, modifiedValues: {
    licenseNumber?: string;
    issueDate?: string;
    expirationDate?: string;
    issuingAuthority?: string;
  }) {
    const record = await this.findOrCreateResponsableSst(companyId);
    // Fase D — la corrección manual de datos OCR modifica contenido aprobado
    // (sstLicenseNumber, licenseIssueDate, licenseExpiresAt, issuingAuthority),
    // por lo que también queda bloqueada cuando el documento está aprobado.
    this.assertResponsableSstEditable(record);
    const ocrEntry = record.licenseOcrEntries[ocrIndex];
    if (!ocrEntry) throw new NotFoundException('Entrada OCR no encontrada');

    const auditEntries = [];

    if (modifiedValues.licenseNumber !== undefined && modifiedValues.licenseNumber !== ocrEntry.detectedLicenseNumber) {
      auditEntries.push({
        userId: this.resolveUserId(user),
        userEmail: user.email,
        changedAt: new Date(),
        field: 'licenseNumber',
        oldValue: ocrEntry.detectedLicenseNumber || '',
        newValue: modifiedValues.licenseNumber,
        warning: 'El usuario modificó el número de licencia detectado por OCR.',
      });
      ocrEntry.modifiedLicenseNumber = modifiedValues.licenseNumber;
      record.sstLicenseNumber = modifiedValues.licenseNumber;
    }

    if (modifiedValues.issueDate !== undefined) {
      const oldDate = ocrEntry.detectedIssueDate?.toISOString().slice(0, 10) || '';
      const newDate = modifiedValues.issueDate;
      if (oldDate !== newDate) {
        auditEntries.push({
          userId: this.resolveUserId(user),
          userEmail: user.email,
          changedAt: new Date(),
          field: 'licenseIssueDate',
          oldValue: oldDate,
          newValue: newDate,
          warning: 'El usuario modificó la fecha de expedición detectada por OCR.',
        });
        ocrEntry.modifiedIssueDate = this.parseOptionalDate(newDate, 'modifiedIssueDate');
        record.licenseIssueDate = ocrEntry.modifiedIssueDate;
      }
    }

    if (modifiedValues.expirationDate !== undefined) {
      const oldDate = ocrEntry.detectedExpirationDate?.toISOString().slice(0, 10) || '';
      const newDate = modifiedValues.expirationDate;
      if (oldDate !== newDate) {
        auditEntries.push({
          userId: this.resolveUserId(user),
          userEmail: user.email,
          changedAt: new Date(),
          field: 'licenseExpiresAt',
          oldValue: oldDate,
          newValue: newDate,
          warning: 'El usuario modificó la fecha de vencimiento detectada por OCR.',
        });
        ocrEntry.modifiedExpirationDate = this.parseOptionalDate(newDate, 'modifiedExpirationDate');
        record.licenseExpiresAt = ocrEntry.modifiedExpirationDate;
      }
    }

    if (modifiedValues.issuingAuthority !== undefined && modifiedValues.issuingAuthority !== ocrEntry.detectedIssuingAuthority) {
      auditEntries.push({
        userId: this.resolveUserId(user),
        userEmail: user.email,
        changedAt: new Date(),
        field: 'issuingAuthority',
        oldValue: ocrEntry.detectedIssuingAuthority || '',
        newValue: modifiedValues.issuingAuthority,
        warning: 'El usuario modificó la autoridad emisora detectada por OCR.',
      });
      ocrEntry.modifiedIssuingAuthority = modifiedValues.issuingAuthority;
      record.issuingAuthority = modifiedValues.issuingAuthority;
    }

    ocrEntry.hasManualModification = true;
    ocrEntry.modifiedBy = this.resolveUserId(user);
    ocrEntry.modifiedAt = new Date();

    // Security notification for OCR modifications
    if (auditEntries.length > 0) {
      record.auditHistory.push(...auditEntries);

      // Notify OWNER and MANAGER about OCR changes
      await this.alertsService.createUnique({
        companyId,
        type: 'SST_LICENSE_OCR_MODIFICATION',
        message: `Se modificaron valores OCR de la licencia SST. Campos: ${auditEntries.map((e) => e.field).join(', ')}. Usuario: ${user.email}.`,
        severity: AlertSeverity.MEDIUM,
      });
    }

    this.resolveLicenseStatus(record);
    const compliance = this.calculateCompliance(record);
    record.complianceStatus = compliance.status;
    record.complianceReason = compliance.reason;
    record.alerts = this.buildAlertSchedule(record);
    record.updatedBy = this.resolveUserId(user);

    await record.save();
    await this.generateAlerts(record);
    return record;
  }

  private detectLicenseNumberFromText(text: string): string | undefined {
    // Common patterns: license numbers, resolutions, etc.
    const patterns = [
      /(?:licencia|lic|license|no\.?|nro\.?|número|num)\s*[:#-]?\s*([A-Z0-9-]{6,})/i,
      /(?:resolución|res|resolution)\s*[:#-]?\s*(\d{4,})/i,
      /(?:matrícula|mat|registration)\s*[:#-]?\s*([A-Z0-9-]{6,})/i,
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[1];
    }
    return undefined;
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
    this.assertResponsableSstEditable(record);
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

  /**
   * Calcula el estado de cumplimiento del punto PHVA 1.1.1.
   *
   * Semántica de estados (Fase 8.3.C):
   * - PENDING        = información insuficiente (campos o evidencias aún no
   *                    aportadas; no hay un hecho que permita decidir).
   * - NON_COMPLIANT  = incumplimiento DEMOSTRABLE: existe un hecho evaluable
   *                    que incumple (curso 50h por encima del umbral sin
   *                    actualización 20h; licencia de perfil exigido sin
   *                    evidencia documental).
   * - COMPLIES       = todos los requisitos demostrados.
   *
   * NOTA normativa (Fase 1.1.1, corrección previa): la licencia SST NO tiene
   * vencimiento obligatorio. La ausencia de licenseExpiresAt es NORMAL y una
   * fecha documental antigua NUNCA genera incumplimiento por sí sola.
   */
  private calculateCompliance(record: PhvaAdvancedResponsableSstDocument): { status: ResponsableSstComplianceStatus; reason: string } {
    const missingFields = REQUIRED_TEXT_FIELDS.filter((field) => !String((record as unknown as Record<string, unknown>)[field] ?? '').trim());
    const hasDiploma = record.documents.some((document) => document.type === ResponsableSstDocumentType.DIPLOMA);
    const has50HourCertificate = record.documents.some((document) => document.type === ResponsableSstDocumentType.FIFTY_HOUR_CERTIFICATE);
    const has20HourCertificate = record.documents.some((document) => document.type === ResponsableSstDocumentType.TWENTY_HOUR_UPDATE_CERTIFICATE);
    const courseExpired = this.isCourseOlderThanThreeYears(record.course50HoursDate);

    // Licencia: solo la exigencia DOCUMENTAL por perfil (regla existente).
    const licenseRequiresDoc = ['Tecnólogo SST', 'Profesional SST', 'Especialista SST'].includes(record.licenseType);
    const hasLicenseDocument = record.documents.some((document) =>
      document.type === ResponsableSstDocumentType.SST_LICENSE_PDF ||
      document.type === ResponsableSstDocumentType.SST_LICENSE_SCANNED
    );
    const licenseMissing = licenseRequiresDoc && !hasLicenseDocument;

    // Designación (Fase 8.3.C): fecha + quien designa + cargo de quien designa
    // (número opcional). La evidencia DESIGNATION es obligatoria.
    const designationDataComplete = Boolean(
      record.designationDate &&
      String(record.designationIssuerName ?? '').trim() &&
      String(record.designationIssuerPosition ?? '').trim(),
    );
    const hasDesignationDocument = record.documents.some((document) => document.type === ResponsableSstDocumentType.DESIGNATION);

    // Estado documental de la licencia (informativo; nunca afecta compliance).
    this.resolveLicenseStatus(record);

    // ── NON_COMPLIANT: incumplimientos demostrables ────────────────────────
    // Solo se declara incumplimiento cuando la BASE del registro está completa
    // (campos requeridos presentes): si faltan datos base → PENDING (Caso C,
    // "datos faltantes no se convierten automáticamente en NON_COMPLIANT").
    const nonCompliantReasons: string[] = [];
    if (missingFields.length === 0) {
      // Caso A — curso 50h supera el umbral y no hay actualización 20h válida.
      if (courseExpired && (!record.course20HoursDate || !has20HourCertificate)) {
        nonCompliantReasons.push('El curso de 50 horas supera el umbral y no se registró la actualización de 20 horas.');
      }
      // Caso B — el perfil exige documentalmente la licencia y no está cargada.
      if (licenseMissing) {
        nonCompliantReasons.push(`Licencia SST requerida para el tipo "${record.licenseType}" pero no cargada.`);
      }
    }
    if (nonCompliantReasons.length > 0) {
      return { status: ResponsableSstComplianceStatus.NON_COMPLIANT, reason: nonCompliantReasons.join(' ') };
    }

    // ── PENDING: información insuficiente ──────────────────────────────────
    const pendingReasons = [
      missingFields.length ? `Campos requeridos pendientes: ${missingFields.join(', ')}` : '',
      !hasDiploma ? 'Diploma pendiente.' : '',
      !has50HourCertificate ? 'Certificado de curso 50 horas pendiente.' : '',
      !designationDataComplete ? 'Designación incompleta (fecha de designación, nombre y cargo de quien designa).' : '',
      !hasDesignationDocument ? 'Documento de designación pendiente.' : '',
    ].filter(Boolean);

    if (pendingReasons.length > 0) {
      return { status: ResponsableSstComplianceStatus.PENDING, reason: pendingReasons.join(' ') };
    }

    // ── COMPLIES: todos los requisitos demostrados ─────────────────────────
    return { status: ResponsableSstComplianceStatus.COMPLIES, reason: 'Cumple validaciones avanzadas del responsable SG-SST.' };
  }

  /**
   * Estado documental de la licencia SST.
   *
   * NOTA normativa (Fase 1.1.1): la licencia SST NO posee un vencimiento
   * normativo obligatorio. La ausencia de licenseExpiresAt es NORMAL y se
   * expone como 'Pendiente' (sin interpretación de vencimiento). Solo cuando
   * existe una fecha explícita proveniente de un documento/acto se calcula un
   * estado informativo (Vigente/Próxima a vencer/Vencida) sin que ello afecte
   * jamás el compliance del estándar (ver calculateCompliance).
   */
  private resolveLicenseStatus(record: PhvaAdvancedResponsableSstDocument) {
    if (!record.licenseExpiresAt) {
      record.licenseStatus = 'Pendiente';
      return;
    }
    const today = this.startOfToday();
    const daysUntilExpiry = Math.ceil((record.licenseExpiresAt.getTime() - today.getTime()) / 86_400_000);
    if (record.licenseExpiresAt < today) {
      record.licenseStatus = 'Vencida';
    } else if (daysUntilExpiry <= 30) {
      record.licenseStatus = 'Próxima a vencer';
    } else {
      record.licenseStatus = 'Vigente';
    }
  }

  private buildAlertSchedule(record: PhvaAdvancedResponsableSstDocument) {
    const alerts: Array<{ type: string; message: string; severity: string; dueAt: Date; generated: boolean }> = [];
    // NOTA normativa (Fase 1.1.1): NO se generan alertas de vencimiento de
    // licencia SST basadas en el paso del tiempo. La licencia no posee
    // vencimiento normativo obligatorio; una fecha documental opcional no se
    // convierte en regla universal de alertas. La única alerta de licencia es
    // documental: documento requerido no cargado para tipos que lo exigen.
    const licenseRequiresDoc = ['Tecnólogo SST', 'Profesional SST', 'Especialista SST'].includes(record.licenseType);
    const hasLicenseDocument = record.documents.some((document) =>
      document.type === ResponsableSstDocumentType.SST_LICENSE_PDF ||
      document.type === ResponsableSstDocumentType.SST_LICENSE_SCANNED
    );
    if (licenseRequiresDoc && !hasLicenseDocument) {
      alerts.push({
        type: 'PHVA_RESPONSABLE_SST_LICENSE_DOC_MISSING',
        message: `Documento de licencia SST requerido para tipo "${record.licenseType}" no ha sido cargado.`,
        severity: AlertSeverity.HIGH,
        dueAt: new Date(),
        generated: false,
      });
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
    // If the value already contains time info (ISO format like '2027-06-23T12:00:00.000Z'),
    // parse it directly instead of appending T00:00:00.000Z
    const isoString = value.includes('T') ? value : `${value}T00:00:00.000Z`;
    const parsed = new Date(isoString);
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

  /**
   * Sector-specific risk language for policy generation.
   */
  private sectorRiskLanguage(sector: string = ''): string[] {
    const sectorLower = sector.toLowerCase();
    
    // Default risks that apply to all sectors
    const baseRisks = [
      '• Identificación de peligros y valoración de riesgos en todos los procesos',
      '• Implementación de controles operacionales para prevenir accidentes y enfermedades laborales',
    ];
    
    // Sector-specific risks
    const sectorRisks: Record<string, string[]> = {
      construcción: [
        '• Trabajo en alturas: uso obligatorio de arnés de seguridad, líneas de vida y anclajes certificados',
        '• Manipulación de equipos pesados: excavadoras, montacargas y grúas con operadores certificados',
        '• Excavaciones y zanjas: apuntalamiento, señalización y protección contra derrumbes',
        '• Riesgos eléctricos: bloqueo y etiquetado (LOTO), distancias de seguridad y equipos dielectricos',
        '• Exposición a ruido, polvo y vibraciones: EPP auditivo, respiradores y monitoreo ambiental',
      ],
      manufactura: [
        '• Riesgos mecánicos en maquinaria industrial: guardas de seguridad, paros de emergencia y LOTO',
        '• Manipulación manual de cargas: ergonomía, ayudas mecánicas y rotación de puestos',
        '• Exposición a sustancias químicas: hojas de seguridad (SDS), ventilación y EPP específico',
        '• Riesgo de incendio y explosión: sistemas de detección, extinción y plan de emergencia',
        '• Ruido industrial: programas de conservación auditiva y monitoreo periódico',
      ],
      comercio: [
        '• Riesgos ergonómicos por movimientos repetitivos y posturas prolongadas',
        '• Manipulación y almacenamiento de mercancías: estanterías seguras y levantamiento seguro',
        '• Atención al público: medidas de seguridad ciudadana y prevención de robos',
        '• Riesgo eléctrico en instalaciones comerciales',
        '• Iluminación, ventilación y condiciones ambientales en locales comerciales',
      ],
      servicios: [
        '• Riesgos psicosociales: carga mental, estrés laboral, acoso y violencia en el trabajo',
        '• Trabajo en oficinas: ergonomía de puestos con pantallas de visualización de datos',
        '• Desplazamientos laborales: seguridad vial y prevención de accidentes in itinere',
        '• Trabajo remoto: condiciones de seguridad y salud en teletrabajo',
        '• Relaciones interpersonales: promoción de convivencia laboral y prevención de acoso',
      ],
      transporte: [
        '• Seguridad vial: programas de conducción segura, fatiga al volante y tiempos de conducción',
        '• Gestión de fatiga del conductor: pausas activas, rotación y monitoreo',
        '• Mantenimiento preventivo de vehículos: frenos, llantas, luces y sistemas de seguridad',
        '• Carga y descarga de mercancías: técnicas seguras, amarre y estabilización',
        '• Emergencias en carretera: kit de emergencia, comunicaciones y procedimientos',
      ],
      salud: [
        '• Exposición biológica: agentes infecciosos, sangre y fluidos corporales, precauciones universales',
        '• Manejo de residuos peligrosos: clasificación, almacenamiento y disposición final',
        '• Riesgo de cortopunzantes: uso seguro de agujas, bisturís y eliminación en guardián',
        '• Manipulación de pacientes: biomecánica corporal, ayudas mecánicas y prevención de lesiones',
        '• Control de infecciones: higiene de manos, aislamiento y protocolos de bioseguridad',
      ],
      educación: [
        '• Riesgos psicosociales: estrés laboral docente, violencia escolar y acoso',
        '• Condiciones de infraestructura: aulas, laboratorios y áreas recreativas seguras',
        '• Gestión de emergencias escolares: simulacros, rutas de evacuación y brigadas',
        '• Exposición a agentes biológicos en laboratorios',
        '• Manipulación de sustancias químicas en laboratorios educativos',
      ],
      tecnología: [
        '• Riesgos ergonómicos: puestos de trabajo con pantallas, pausas activas y mobiliario ajustable',
        '• Riesgos psicosociales: trabajo bajo presión, jornadas extendidas y teletrabajo',
        '• Riesgo eléctrico en equipos de cómputo y centros de datos',
        '• Exposición a campos electromagnéticos',
        '• Condiciones de iluminación y clima laboral en entornos tecnológicos',
      ],
      agricultura: [
        '• Exposición a plaguicidas y agroquímicos: manejo seguro, EPP y vigilancia epidemiológica',
        '• Riesgos con maquinaria agrícola: tractores, cosechadoras y equipos de labranza',
        '• Trabajo a la intemperie: golpe de calor, protección solar e hidratación',
        '• Manipulación manual de cargas y posturas forzadas',
        '• Riesgos biológicos: zoonosis, mordeduras y picaduras',
      ],
      minería: [
        '• Riesgos geotécnicos: deslizamientos, derrumbes y estabilidad de taludes',
        '• Ventilación en espacios confinados: monitoreo de gases y atmósferas peligrosas',
        '• Exposición a polvo de sílice y material particulado: control ambiental y EPP respiratorio',
        '• Ruido y vibraciones en equipos mineros',
        '• Manipulación de explosivos: almacenamiento, transporte y detonación segura',
      ],
      petróleo: [
        '• Trabajo en espacios confinados: monitoreo de atmósferas peligrosas y permisos de entrada',
        '• Manejo de hidrocarburos y sustancias inflamables: prevención de incendio y explosión',
        '• Trabajo en alturas y plataformas: sistemas de detención de caídas y anclajes',
        '• Operaciones de perforación y extracción: controles de seguridad críticos',
        '• Emergencias ambientales: planes de contingencia y respuesta a derrames',
      ],
      pesca: [
        '• Riesgos biológicos en ambientes húmedos y mojados',
        '• Manipulación manual de cargas y sobreesfuerzos',
        '• Operaciones en cadena de frío: hipotermia y condiciones térmicas extremas',
        '• Trabajo en embarcaciones: seguridad marítima y equipos de flotación',
        '• Corte y procesamiento: uso seguro de herramientas cortantes',
      ],
    };
    
    // Find matching sector
    for (const [key, risks] of Object.entries(sectorRisks)) {
      if (sectorLower.includes(key)) {
        return [...baseRisks, ...risks];
      }
    }
    
    // Generic risks for unrecognized sectors
    return [
      ...baseRisks,
      '• Identificación y control de peligros específicos según la actividad económica',
      '• Implementación de medidas preventivas acordes a la naturaleza del trabajo',
      '• Promoción de estilos de vida saludables y prevención de enfermedades laborales',
    ];
  }

  async generateSstPolicy(companyId: Types.ObjectId, user: UserDocument) {
    const record = await this.findOrCreateSstPolicy(companyId);
    const company = await this.companyModel.findById(companyId).exec();
    const employeesCount = await this.employeeModel.countDocuments({ companyId }).exec();
    const representative = record.signatures.find((signature) => signature.role === 'Representante legal')?.signerName || 'Representante legal';
    const economicSector = company?.economicSector || 'Actividad económica general';
    const ciiuCode = (company as unknown as Record<string, string>)?.ciiuCode || 'No registrado';
    const arlRiskLevel: string = (company as unknown as Record<string, string>)?.arlRiskLevel || 'No definido';
    const riskLabel: Record<string, string> = { I: 'Mínimo', II: 'Bajo', III: 'Medio', IV: 'Alto', V: 'Máximo' };
    const companySize = employeesCount <= 10 ? 'Microempresa' : employeesCount <= 50 ? 'Pequeña empresa' : employeesCount <= 200 ? 'Mediana empresa' : 'Gran empresa';
    // Fetch sector template from database, fall back to hardcoded
    let sectorRisks = this.sectorRiskLanguage(economicSector);
    let sectorCommitments: string[] = [];
    let legalReferences: string[] = [];
    let recommendedResponsibilities: string[] = [];
    try {
      await this.policyTemplateService.seedDefaults();
      const template = await this.policyTemplateService.findBySector(economicSector).catch(() => null);
      if (template) {
        sectorRisks = template.sectorRisks.length > 0
          ? [
              '• Identificación de peligros y valoración de riesgos en todos los procesos',
              '• Implementación de controles operacionales para prevenir accidentes y enfermedades laborales',
              ...template.sectorRisks.map((r: string) => `• ${r}`),
            ]
          : sectorRisks;
        sectorCommitments = template.sectorCommitments.map((c: string) => `• ${c}`);
        legalReferences = template.legalReferences;
        recommendedResponsibilities = template.recommendedResponsibilities.map((r: string) => `• ${r}`);
      }
    } catch (e) {
      // Fallback to hardcoded sector risks
      console.error('Failed to load policy template from database, using defaults:', (e as Error).message);
    }
    
    record.documentName = record.documentName || 'Política de Seguridad y Salud en el Trabajo';
    record.content = [
      '========================================================',
      `POLÍTICA DE SEGURIDAD Y SALUD EN EL TRABAJO (SST)`,
      '========================================================',
      '',
      `EMPRESA: ${company?.name ?? 'Nombre empresa'}`,
      `NIT: ${company?.nit ?? 'No registrado'}`,
      `REPRESENTANTE LEGAL: ${representative}`,
      `ACTIVIDAD ECONÓMICA: ${economicSector}`,
      `Código CIIU: ${ciiuCode}`,
      `NIVEL DE RIESGO ARL: ${riskLabel[arlRiskLevel] || arlRiskLevel} (${arlRiskLevel})`,
      `TAMAÑO DE EMPRESA: ${companySize}`,
      `NÚMERO DE TRABAJADORES: ${employeesCount}`,
      '',
      '--------------------------------------------------------',
      '1. INTRODUCCIÓN',
      '--------------------------------------------------------',
      '',
      `La empresa ${company?.name || 'Nombre empresa'}, identificada con NIT ${company?.nit || 'NIT'}, dedicada a ${economicSector}, se compromete a establecer, implementar, mantener y mejorar continuamente un Sistema de Gestión de Seguridad y Salud en el Trabajo (SG-SST), conforme a los requisitos legales aplicables y a la normatividad colombiana vigente (Ley 1562 de 2012, Decreto Único Reglamentario 1072 de 2015, Resolución 0312 de 2019 y demás disposiciones).`,
      '',
      '--------------------------------------------------------',
      '2. ALCANCE',
      '--------------------------------------------------------',
      '',
      'Esta política aplica a todos los centros de trabajo, procesos, actividades, trabajadores directos, contratistas, subcontratistas, practicantes, aprendices y cualquier persona que preste servicios en nombre de la organización, en todas las ubicaciones donde la empresa desarrolla sus operaciones.',
      '',
      '--------------------------------------------------------',
      '3. COMPROMISO DE LA ALTA DIRECCIÓN',
      '--------------------------------------------------------',
      '',
      'La alta dirección se compromete a:',
      '• Proveer los recursos financieros, técnicos y humanos necesarios para la implementación y mantenimiento del SG-SST',
      '• Liderar con el ejemplo en materia de seguridad y salud en el trabajo',
      '• Garantizar la participación activa de todos los niveles de la organización',
      '• Revisar periódicamente el desempeño del SG-SST',
      '• Asignar responsabilidades claras en SST para todos los cargos',
      '• Promover una cultura de prevención y autocuidado',
      ...(sectorCommitments.length > 0
        ? ['', 'Compromisos específicos del sector:', ...sectorCommitments]
        : []),
      '',
      '--------------------------------------------------------',
      '4. CUMPLIMIENTO LEGAL',
      '--------------------------------------------------------',
      '',
      'La organización se compromete a cumplir con todas las disposiciones legales y reglamentarias en materia de seguridad y salud en el trabajo, así como con otros requisitos que la organización suscriba. Se mantendrá una matriz legal actualizada para identificar, evaluar y dar seguimiento al cumplimiento normativo.',
      '',
      ...(legalReferences.length > 0
        ? ['Normatividad específica del sector:', ...legalReferences.map((r: string) => `• ${r}`)]
        : []),
      '',
      '--------------------------------------------------------',
      '5. IDENTIFICACIÓN DE PELIGROS Y RIESGOS ESPECÍFICOS DEL SECTOR',
      '--------------------------------------------------------',
      '',
      `Considerando la actividad económica de ${economicSector} y el nivel de riesgo ARL ${arlRiskLevel}, la empresa identifica los siguientes peligros y riesgos prioritarios a gestionar:`,
      '',
      ...sectorRisks,
      '',
      '--------------------------------------------------------',
      '6. PREVENCIÓN DE RIESGOS',
      '--------------------------------------------------------',
      '',
      'La empresa implementará las siguientes estrategias de prevención:',
      '• Jerarquía de controles: eliminación, sustitución, controles de ingeniería, señalización y EPP',
      '• Programas de vigilancia epidemiológica según los riesgos prioritarios',
      '• Inspecciones planeadas y observaciones de comportamiento seguro',
      '• Investigación de incidentes, accidentes y enfermedades laborales',
      '• Planes de emergencia y contingencia adaptados al sector',
      '• Capacitación continua en identificación de peligros y control de riesgos',
      '',
      '--------------------------------------------------------',
      '7. PARTICIPACIÓN DE LOS TRABAJADORES',
      '--------------------------------------------------------',
      '',
      'La organización garantizará la participación efectiva de todos los trabajadores y sus representantes en:',
      '• La consulta sobre cambios que afecten la seguridad y salud',
      '• La elección de representantes ante el COPASST y Comité de Convivencia',
      '• La identificación de peligros y reporte de condiciones inseguras',
      '• Las investigaciones de incidentes y accidentes de trabajo',
      '• Las actividades de promoción de la salud y prevención de la enfermedad',
      '• La socialización de esta política y sus actualizaciones',
      '',
      '--------------------------------------------------------',
      '8. MEJORA CONTINUA',
      '--------------------------------------------------------',
      '',
      'La empresa se compromete a la mejora continua del SG-SST mediante:',
      '• Revisión periódica de indicadores de gestión y resultados',
      '• Auditorías internas y externas del sistema',
      '• Análisis de tendencias de incidentes y enfermedades',
      '• Evaluación de la efectividad de los controles implementados',
      '• Actualización de la política y objetivos según cambios organizacionales',
      '',
      '--------------------------------------------------------',
      '9. RESPONSABILIDADES',
      '--------------------------------------------------------',
      '',
      'La responsabilidad del SG-SST se distribuye de la siguiente manera:',
      '• GERENCIA: Aprobar política, asignar recursos y revisar resultados',
      '• RESPONSABLE SST: Implementar, coordinar y hacer seguimiento al sistema',
      '• MANDOS MEDIOS: Aplicar controles y velar por el cumplimiento en sus áreas',
      '• TRABAJADORES: Cumplir normas, usar EPP y reportar condiciones inseguras',
      '• COPASST: Vigilar y promover la seguridad y salud en la organización',
      ...(recommendedResponsibilities.length > 0
        ? ['', 'Responsabilidades recomendadas para el sector:', ...recommendedResponsibilities]
        : []),
      '',
      '--------------------------------------------------------',
      '10. REVISIÓN Y ACTUALIZACIÓN',
      '--------------------------------------------------------',
      '',
      'Esta política será revisada como mínimo una vez al año (o antes si ocurren cambios significativos en la organización, la normatividad o los riesgos) y actualizada cuando sea necesario. Su vigencia es de 12 meses a partir de la fecha de aprobación.',
      '',
      'La presente política se comunica, publica y socializa a todos los niveles de la organización. Todo trabajador debe leer, comprender y firmar su conocimiento de esta política como parte del proceso de inducción y socialización.',
      '',
      '========================================================',
      '',
      `Fecha de emisión: ${new Date().toISOString().slice(0, 10)}`,
      `Próxima revisión: ${new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10)}`,
      '',
      `_________________________`,
      `${representative}`,
      `Representante legal`,
      `${company?.name ?? ''}`,
    ].join('\n');
    
    // Set expiration to 1 year from now — set directly on the version instead of calling updateSstPolicy
    // to avoid re-fetching the record and losing the content that was just built in memory
    const expiresAtDate = new Date(Date.now() + 365 * 86400000);
    const existingVersion = this.currentPolicyVersion(record);
    if (existingVersion) {
      existingVersion.expiresAt ??= expiresAtDate;
    } else if (record.content) {
      record.versions.push({
        version: record.currentVersion,
        content: record.content,
        status: record.status,
        issuedAt: new Date(),
        expiresAt: expiresAtDate,
        archived: false,
        createdBy: this.resolveUserId(user),
      } as never);
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
    const saved = await this.saveSstPolicyWithCompliance(record);
    // Auto-generate communication for policy update
    if (saved.status === SstPolicyStatus.APPROVED) {
      await this.autoCommService.generateCommunication({
        companyId,
        title: `Actualización de Política SST: ${saved.documentName}`,
        body: `La política de seguridad y salud en el trabajo "${saved.documentName}" ha sido actualizada a la versión ${saved.currentVersion}. Por favor revisar los cambios y confirmar su conocimiento.`,
        communicationType: 'POLICY_COMMUNICATION',
        priority: 'IMPORTANT',
        targetAudience: 'ALL_COMPANY',
        requiresSignature: true,
        sourceModule: 'POLICY_UPDATED',
        sourceEntityId: saved._id.toString(),
        linkedDocumentIds: [saved._id.toString()],
      }).catch((err) => {
        console.error('Auto-communication generation failed for policy update:', err.message);
      });
    }
    return saved;
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

  /**
   * Getter de lectura de una política SST por id (sin crear un registro como
   * hace findOrCreate). Usado por el handler cuando getEntity llega con
   * entityId.
   */
  async findSstPolicyById(id: Types.ObjectId): Promise<SstPolicyDocument> {
    const record = await this.sstPolicyModel.findById(id).exec();
    if (!record) throw new NotFoundException('SST Policy not found');
    return record;
  }

  /**
   * Getter de lectura de la política vigente de la empresa (itemCode fijo
   * '2.1.1', sin crear un registro como hace findOrCreate). Usado por el
   * handler cuando getEntity llega sin entityId.
   */
  async findSstPolicyByCompany(companyId: Types.ObjectId): Promise<SstPolicyDocument> {
    const record = await this.sstPolicyModel
      .findOne({ companyId, itemCode: '2.1.1' })
      .exec();
    if (!record) throw new NotFoundException('SST Policy not found');
    return record;
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
    const saved = await this.saveSstPolicyWithCompliance(record);
    // Auto-generate communication for new/updated policy
    await this.autoCommService.generateCommunication({
      companyId: companyId,
      title: `Política SST aprobada: ${saved.documentName}`,
      body: `La política de seguridad y salud en el trabajo "${saved.documentName}" (${saved.documentCode}) ha sido aprobada y está vigente. Por favor leer y confirmar su conocimiento.`,
      communicationType: 'POLICY_COMMUNICATION',
      priority: 'IMPORTANT',
      targetAudience: 'ALL_COMPANY',
      requiresSignature: true,
      sourceModule: 'POLICY_CREATED',
      sourceEntityId: saved._id.toString(),
      linkedDocumentIds: [saved._id.toString()],
    }).catch((err) => {
      // Log but don't fail the main operation
      console.error('Auto-communication generation failed for policy:', err.message);
    });
    return saved;
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
      // Scheduled alerts at 30, 15, 5, and 1 day(s) before review/expiration
      alerts.push({ type: 'PROXIMA_REVISION_30', message: 'Política SST próxima a revisión en 30 días. Programe la revisión y actualización.', recipients, dueAt: this.addDays(current.expiresAt, -30), generated: false });
      alerts.push({ type: 'PROXIMA_REVISION_15', message: 'Política SST próxima a revisión en 15 días. Prepare los cambios necesarios.', recipients, dueAt: this.addDays(current.expiresAt, -15), generated: false });
      alerts.push({ type: 'PROXIMA_REVISION_5', message: 'Política SST próxima a revisión en 5 días. Acción requerida para evitar vencimiento.', recipients, dueAt: this.addDays(current.expiresAt, -5), generated: false });
      alerts.push({ type: 'PROXIMA_REVISION_1', message: '¡Urgente! Política SST vence mañana. Debe ser revisada y actualizada.', recipients, dueAt: this.addDays(current.expiresAt, -1), generated: false });
      if (current.expiresAt < this.startOfToday()) alerts.push({ type: 'POLITICA_VENCIDA', message: '¡Política SST vencida! Debe ser revisada y actualizada inmediatamente.', recipients, dueAt: new Date(), generated: false });
    }
    if (record.signatures.some((signature) => signature.required && signature.status !== PolicySignatureStatus.SIGNED)) alerts.push({ type: 'FALTA_FIRMA', message: 'Falta firma obligatoria de Política SST (Manager o Representante legal).', recipients, dueAt: new Date(), generated: false });
    if (record.status === SstPolicyStatus.APPROVED && record.socializations.some((entry) => entry.status !== PolicySocializationStatus.DIGITALLY_SIGNED)) alerts.push({ type: 'FALTA_SOCIALIZACION', message: 'Falta socialización completa de Política SST. Los trabajadores deben leer y firmar.', recipients, dueAt: new Date(), generated: false });
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

  /**
   * Getter de lectura por identificador (sin crear registros). Usado por el
   * TrainingManagementHandler del Approval Workflow Core.
   */
  async findTrainingManagementById(id: Types.ObjectId): Promise<TrainingManagementDocument> {
    const record = await this.trainingManagementModel.findById(id).exec();
    if (!record) throw new NotFoundException('Training management not found');
    return record;
  }

  /**
   * Getter de lectura del registro vigente de la empresa (sin crear un
   * registro como hace findOrCreate). Usado por el handler cuando getEntity
   * llega sin entityId.
   */
  async findTrainingManagementByCompany(companyId: Types.ObjectId): Promise<TrainingManagementDocument> {
    const record = await this.trainingManagementModel
      .findOne({ companyId, itemCode: '1.2.1' })
      .exec();
    if (!record) throw new NotFoundException('Training management not found');
    return record;
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
