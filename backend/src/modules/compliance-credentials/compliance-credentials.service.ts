import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AlertsService } from '../alerts/alerts.service';
import { AlertSeverity } from '../alerts/schemas/alert.schema';
import { Employee, EmployeeDocument } from '../employees/schemas/employee.schema';
import { UserDocument } from '../users/schemas/user.schema';
import { CreateCredentialDto } from './dto/create-credential.dto';
import { CreateCredentialDocumentDto } from './dto/create-document.dto';
import { ManualOcrDateDto } from './dto/manual-ocr-date.dto';
import { CreateResponsibleDto, UpdateResponsibleDto } from './dto/responsible.dto';
import { UpdateCredentialDto } from './dto/update-credential.dto';
import {
  CredentialAlertType,
  CredentialCourseType,
  CredentialHistoryAction,
  CredentialStatus,
  CredentialValidationStatus,
  PhvaComplianceStatus,
  ResponsibleStatus,
} from './enums/credential.enums';
import {
  ComplianceCredentialsRepository,
  CredentialAlertsRepository,
  CredentialDocumentsRepository,
  CredentialHistoryRepository,
  CredentialOcrRepository,
  CredentialResponsiblesRepository,
  CredentialValidationsRepository,
} from './repositories/compliance-credentials.repository';
import { ComplianceCredentialDocument } from './schemas/compliance-credential.schema';

@Injectable()
export class ComplianceCredentialsService {
  constructor(
    private readonly credentialsRepository: ComplianceCredentialsRepository,
    private readonly responsiblesRepository: CredentialResponsiblesRepository,
    private readonly documentsRepository: CredentialDocumentsRepository,
    private readonly ocrRepository: CredentialOcrRepository,
    private readonly alertsRepository: CredentialAlertsRepository,
    private readonly historyRepository: CredentialHistoryRepository,
    private readonly validationsRepository: CredentialValidationsRepository,
    @InjectModel(Employee.name) private readonly employeeModel: Model<EmployeeDocument>,
    private readonly alertsService: AlertsService,
  ) {}

  findAll(companyId: Types.ObjectId) {
    return this.credentialsRepository.findByCompany(companyId);
  }

  async findOne(companyId: Types.ObjectId, id: string) {
    const credentialId = this.toObjectId(id, 'credentialId');
    const credential = await this.credentialsRepository.requireOne(companyId, credentialId);
    const [documents, ocrData, alerts, validations, history] = await Promise.all([
      this.documentsRepository.findByCredential(companyId, credentialId),
      this.ocrRepository.findByCredential(companyId, credentialId),
      this.alertsRepository.findByCredential(companyId, credentialId),
      this.validationsRepository.findByCredential(companyId, credentialId),
      this.historyRepository.findByCredential(companyId, credentialId),
    ]);
    return { credential, documents, ocrData, alerts, validations, history };
  }

  async create(companyId: Types.ObjectId, user: UserDocument, dto: CreateCredentialDto) {
    const userId = this.resolveUserId(user);
    const responsibleUserId = dto.responsibleUserId ? this.toObjectId(dto.responsibleUserId, 'responsibleUserId') : undefined;
    if (responsibleUserId) await this.assertEmployeeBelongsToCompany(companyId, responsibleUserId);

    const courseDate = this.parseDate(dto.courseDate);
    const expirationDate = this.parseDate(dto.expirationDate) ?? (courseDate ? this.addYears(courseDate, 3) : undefined);
    const credential = await this.credentialsRepository.create({
      companyId,
      itemCode: '1.2.3',
      responsibleUserId,
      courseType: dto.courseType,
      trainingEntity: dto.trainingEntity ?? '',
      certificateNumber: dto.certificateNumber ?? '',
      courseDate,
      expirationDate,
      status: this.resolveCredentialStatus(expirationDate),
      comments: dto.comments ?? '',
      relatedFiftyHourCredentialId: dto.relatedFiftyHourCredentialId ? this.toObjectId(dto.relatedFiftyHourCredentialId, 'relatedFiftyHourCredentialId') : undefined,
      createdBy: userId,
      updatedBy: userId,
    });

    await this.recordHistory(companyId, credential._id, CredentialHistoryAction.EDIT, 'credential', undefined, JSON.stringify(dto), userId, 'Credential created');
    await this.recalculateCredential(companyId, credential._id, userId);
    return this.credentialsRepository.requireOne(companyId, credential._id);
  }

  async update(companyId: Types.ObjectId, user: UserDocument, id: string, dto: UpdateCredentialDto) {
    const credentialId = this.toObjectId(id, 'credentialId');
    const credential = await this.credentialsRepository.requireOne(companyId, credentialId);
    const userId = this.resolveUserId(user);
    const before = this.snapshotCredential(credential);

    if (dto.responsibleUserId !== undefined) {
      credential.responsibleUserId = this.toObjectId(dto.responsibleUserId, 'responsibleUserId');
      await this.assertEmployeeBelongsToCompany(companyId, credential.responsibleUserId);
    }
    if (dto.trainingEntity !== undefined) credential.trainingEntity = dto.trainingEntity;
    if (dto.certificateNumber !== undefined) credential.certificateNumber = dto.certificateNumber;
    if (dto.comments !== undefined) credential.comments = dto.comments;
    if (dto.courseType !== undefined) credential.courseType = dto.courseType;
    if (dto.relatedFiftyHourCredentialId !== undefined) credential.relatedFiftyHourCredentialId = this.toObjectId(dto.relatedFiftyHourCredentialId, 'relatedFiftyHourCredentialId');
    if (dto.courseDate !== undefined) credential.courseDate = this.parseDate(dto.courseDate);
    if (dto.expirationDate !== undefined || dto.courseDate !== undefined) {
      credential.expirationDate = this.parseDate(dto.expirationDate) ?? (credential.courseDate ? this.addYears(credential.courseDate, 3) : undefined);
      await this.recordHistory(companyId, credentialId, CredentialHistoryAction.EXPIRATION_UPDATE, 'expirationDate', before.expirationDate, credential.expirationDate?.toISOString(), userId);
    }
    credential.status = this.resolveCredentialStatus(credential.expirationDate);
    credential.updatedBy = userId;
    await credential.save();
    await this.recordHistory(companyId, credentialId, CredentialHistoryAction.EDIT, 'credential', JSON.stringify(before), JSON.stringify(this.snapshotCredential(credential)), userId);
    await this.recalculateCredential(companyId, credentialId, userId);
    return this.credentialsRepository.requireOne(companyId, credentialId);
  }

  async listResponsibles(companyId: Types.ObjectId) {
    return this.responsiblesRepository.findByCompany(companyId);
  }

  async addResponsible(companyId: Types.ObjectId, user: UserDocument, dto: CreateResponsibleDto) {
    const employeeId = this.toObjectId(dto.employeeId, 'employeeId');
    await this.assertEmployeeBelongsToCompany(companyId, employeeId);
    const userId = this.resolveUserId(user);
    const responsible = await this.responsiblesRepository.create({
      companyId,
      employeeId,
      responsibleType: dto.responsibleType,
      status: ResponsibleStatus.ACTIVE,
      comments: dto.comments ?? '',
      createdBy: userId,
      updatedBy: userId,
    });
    await this.recordHistory(companyId, undefined, CredentialHistoryAction.RESPONSIBLE_CHANGE, 'responsible', undefined, JSON.stringify(dto), userId, 'Responsible added');
    await this.recalculateCompanyPhva(companyId, userId);
    return responsible;
  }

  async updateResponsible(companyId: Types.ObjectId, user: UserDocument, id: string, dto: UpdateResponsibleDto) {
    const responsible = await this.responsiblesRepository.requireOne(companyId, this.toObjectId(id, 'responsibleId'));
    const before = JSON.stringify({ type: responsible.responsibleType, comments: responsible.comments });
    if (dto.responsibleType) responsible.responsibleType = dto.responsibleType;
    if (dto.comments !== undefined) responsible.comments = dto.comments;
    responsible.updatedBy = this.resolveUserId(user);
    await responsible.save();
    await this.recordHistory(companyId, undefined, CredentialHistoryAction.RESPONSIBLE_CHANGE, 'responsible', before, JSON.stringify(dto), responsible.updatedBy, 'Responsible updated');
    await this.recalculateCompanyPhva(companyId, responsible.updatedBy);
    return responsible;
  }

  async deactivateResponsible(companyId: Types.ObjectId, user: UserDocument, id: string) {
    const responsible = await this.responsiblesRepository.requireOne(companyId, this.toObjectId(id, 'responsibleId'));
    responsible.status = ResponsibleStatus.INACTIVE;
    responsible.updatedBy = this.resolveUserId(user);
    await responsible.save();
    await this.recordHistory(companyId, undefined, CredentialHistoryAction.RESPONSIBLE_CHANGE, 'responsible.status', ResponsibleStatus.ACTIVE, ResponsibleStatus.INACTIVE, responsible.updatedBy, 'Responsible deactivated');
    await this.recalculateCompanyPhva(companyId, responsible.updatedBy);
    return responsible;
  }

  async removeResponsible(companyId: Types.ObjectId, user: UserDocument, id: string) {
    const responsible = await this.responsiblesRepository.requireOne(companyId, this.toObjectId(id, 'responsibleId'));
    await responsible.deleteOne();
    const userId = this.resolveUserId(user);
    await this.recordHistory(companyId, undefined, CredentialHistoryAction.RESPONSIBLE_CHANGE, 'responsible', responsible._id.toString(), undefined, userId, 'Responsible removed');
    await this.recalculateCompanyPhva(companyId, userId);
  }

  async attachDocument(companyId: Types.ObjectId, user: UserDocument, dto: CreateCredentialDocumentDto) {
    const credentialId = this.toObjectId(dto.credentialId, 'credentialId');
    const credential = await this.credentialsRepository.requireOne(companyId, credentialId);
    const userId = this.resolveUserId(user);
    const document = await this.documentsRepository.create({
      companyId,
      credentialId,
      courseType: credential.courseType,
      fileName: dto.fileName,
      fileUrl: dto.fileUrl,
      storagePath: dto.storagePath,
      mimeType: dto.mimeType,
      uploadedBy: userId,
      createdBy: userId,
      updatedBy: userId,
    });

    const extracted = this.extractOcrValues(dto, document.fileName);
    const ocr = await this.ocrRepository.create({
      companyId,
      credentialId,
      documentId: document._id,
      extractedCourseDate: extracted.courseDate,
      extractedCertificateNumber: extracted.certificateNumber,
      extractedTrainingEntity: extracted.trainingEntity,
      rawText: dto.rawOcrText,
      originalOCRDate: extracted.courseDate,
      confidence: extracted.confidence,
      createdBy: userId,
      updatedBy: userId,
    });

    const changed: Partial<ComplianceCredentialDocument> = {};
    if (extracted.courseDate && !credential.courseDate) changed.courseDate = extracted.courseDate;
    if (extracted.certificateNumber && !credential.certificateNumber) changed.certificateNumber = extracted.certificateNumber;
    if (extracted.trainingEntity && !credential.trainingEntity) changed.trainingEntity = extracted.trainingEntity;
    if (Object.keys(changed).length) {
      Object.assign(credential, changed);
      credential.expirationDate = credential.courseDate ? this.addYears(credential.courseDate, 3) : credential.expirationDate;
      credential.status = this.resolveCredentialStatus(credential.expirationDate);
      credential.updatedBy = userId;
      await credential.save();
    }

    await this.recordHistory(companyId, credentialId, CredentialHistoryAction.UPLOAD, 'document', undefined, document.fileName, userId, `Document uploaded with OCR ${ocr._id.toString()}`);
    await this.recalculateCredential(companyId, credentialId, userId);
    return { document, ocr };
  }

  async registerManualOcrDateChange(companyId: Types.ObjectId, user: UserDocument, dto: ManualOcrDateDto) {
    const userId = this.resolveUserId(user);
    const ocr = await this.ocrRepository.requireOne(companyId, this.toObjectId(dto.ocrDataId, 'ocrDataId'));
    const modifiedDate = this.parseRequiredDate(dto.modifiedDate, 'modifiedDate');
    const oldDate = ocr.extractedCourseDate ?? ocr.originalOCRDate;
    ocr.originalOCRDate = ocr.originalOCRDate ?? ocr.extractedCourseDate;
    ocr.modifiedDate = modifiedDate;
    ocr.modifiedBy = userId;
    ocr.modifiedAt = new Date();
    ocr.hasManualDateModification = true;
    ocr.updatedBy = userId;
    await ocr.save();

    const credential = await this.credentialsRepository.requireOne(companyId, ocr.credentialId);
    credential.courseDate = modifiedDate;
    credential.expirationDate = this.addYears(modifiedDate, 3);
    credential.status = this.resolveCredentialStatus(credential.expirationDate);
    credential.updatedBy = userId;
    await credential.save();

    await this.recordHistory(companyId, credential._id, CredentialHistoryAction.OCR_CHANGE, 'courseDate', oldDate?.toISOString(), modifiedDate.toISOString(), userId, 'Manual OCR date modification');
    await this.createCredentialAlert(companyId, credential._id, CredentialAlertType.MANUAL_OCR_MODIFICATION, `Fecha OCR modificada manualmente para certificado ${credential.certificateNumber || credential._id.toString()}.`, 'warning', new Date(), ['owner', 'manager'], userId);
    await this.recalculateCredential(companyId, credential._id, userId);
    return ocr;
  }

  async recalculateCredential(companyId: Types.ObjectId, credentialId: Types.ObjectId, userId?: Types.ObjectId) {
    const credential = await this.credentialsRepository.requireOne(companyId, credentialId);
    credential.expirationDate = credential.courseDate ? this.addYears(credential.courseDate, 3) : credential.expirationDate;
    credential.status = this.resolveCredentialStatus(credential.expirationDate);
    credential.requires20HourCourse = credential.courseType === CredentialCourseType.COURSE_50_HOURS && this.isOlderThanYears(credential.courseDate, 3);

    const [activeResponsibles, documents] = await Promise.all([
      this.responsiblesRepository.findActiveByCompany(companyId),
      this.documentsRepository.findByCredential(companyId, credentialId),
    ]);
    const hasActiveResponsible = activeResponsibles.length > 0;
    const hasDocuments = documents.length > 0;
    const hasRequired20HourCourse = !credential.requires20HourCourse || await this.hasTwentyHourCourse(companyId, credential);
    const status = this.resolveValidationStatus(credential, hasDocuments, hasRequired20HourCourse);
    const phva = hasActiveResponsible && credential.courseType === CredentialCourseType.COURSE_50_HOURS && hasDocuments && status === CredentialValidationStatus.VALID && hasRequired20HourCourse
      ? PhvaComplianceStatus.COMPLIES
      : (hasActiveResponsible || hasDocuments || credential.courseDate ? PhvaComplianceStatus.PENDING : PhvaComplianceStatus.NON_COMPLIANT);
    const reason = this.buildValidationReason(hasActiveResponsible, hasDocuments, credential, hasRequired20HourCourse, status);

    credential.validationStatus = status;
    credential.phvaComplianceStatus = phva;
    credential.phvaComplianceReason = reason;
    credential.updatedBy = userId;
    await credential.save();

    await this.validationsRepository.create({ companyId, credentialId, status, reason, requires20HourCourse: credential.requires20HourCourse, hasRequired20HourCourse, hasDocuments, hasActiveResponsible, phvaComplianceStatus: phva, createdBy: userId, updatedBy: userId });
    await this.recordHistory(companyId, credentialId, CredentialHistoryAction.VALIDATION_CHANGE, 'validationStatus', undefined, status, userId, reason);
    await this.generateAutomaticAlerts(companyId, credential, hasDocuments, hasRequired20HourCourse, userId);
    return credential;
  }

  private async recalculateCompanyPhva(companyId: Types.ObjectId, userId?: Types.ObjectId) {
    const credentials = await this.credentialsRepository.findByCompany(companyId);
    await Promise.all(credentials.map((credential) => this.recalculateCredential(companyId, credential._id, userId)));
  }

  private async generateAutomaticAlerts(companyId: Types.ObjectId, credential: ComplianceCredentialDocument, hasDocuments: boolean, hasRequired20HourCourse: boolean, userId?: Types.ObjectId) {
    if (!hasDocuments) {
      await this.createCredentialAlert(companyId, credential._id, CredentialAlertType.MISSING_DOCUMENTS, 'Falta cargar el certificado del curso SG-SST.', 'warning', new Date(), ['owner', 'admin', 'manager'], userId);
    }
    if (!hasRequired20HourCourse) {
      await this.createCredentialAlert(companyId, credential._id, CredentialAlertType.MISSING_20H_COURSE, 'El curso de 50 horas supera 3 años y requiere curso de actualización de 20 horas.', 'critical', new Date(), ['owner', 'admin', 'manager'], userId);
    }
    if (!credential.expirationDate) return;

    for (const days of [30, 15, 5, 1]) {
      await this.createCredentialAlert(companyId, credential._id, CredentialAlertType.EXPIRATION, `Curso SG-SST vence en ${days} día(s).`, days <= 5 ? 'critical' : 'warning', this.addDays(credential.expirationDate, -days), ['owner', 'admin', 'manager'], userId);
    }
    if (credential.status === CredentialStatus.VENCIDO) {
      await this.createCredentialAlert(companyId, credential._id, CredentialAlertType.EXPIRATION, 'Curso SG-SST vencido.', 'critical', credential.expirationDate, ['owner', 'admin', 'manager'], userId);
    }
  }

  private async createCredentialAlert(companyId: Types.ObjectId, credentialId: Types.ObjectId | undefined, type: CredentialAlertType, message: string, severity: 'warning' | 'critical' | 'info', dueAt: Date, targetRoles: string[], userId?: Types.ObjectId) {
    await this.alertsRepository.createUnique({ companyId, credentialId, type, message, severity, dueAt, generated: true, targetRoles, createdBy: userId, updatedBy: userId });
    await this.alertsService.createUnique({ companyId, type: `credential_${type}`, message, severity: severity === 'critical' ? AlertSeverity.HIGH : severity === 'warning' ? AlertSeverity.MEDIUM : AlertSeverity.LOW });
  }

  private resolveValidationStatus(credential: ComplianceCredentialDocument, hasDocuments: boolean, hasRequired20HourCourse: boolean) {
    if (!hasDocuments) return CredentialValidationStatus.MISSING_DOCUMENTS;
    if (!credential.courseDate || !credential.expirationDate) return CredentialValidationStatus.INVALID;
    if (!hasRequired20HourCourse) return CredentialValidationStatus.PENDING_20H;
    if (credential.status === CredentialStatus.VENCIDO) return CredentialValidationStatus.INVALID;
    return CredentialValidationStatus.VALID;
  }

  private buildValidationReason(hasActiveResponsible: boolean, hasDocuments: boolean, credential: ComplianceCredentialDocument, hasRequired20HourCourse: boolean, status: CredentialValidationStatus) {
    const pending: string[] = [];
    if (!hasActiveResponsible) pending.push('no hay responsable SST activo');
    if (!hasDocuments) pending.push('faltan documentos');
    if (!credential.courseDate) pending.push('falta fecha del curso');
    if (credential.status === CredentialStatus.VENCIDO) pending.push('curso vencido');
    if (!hasRequired20HourCourse) pending.push('falta curso de 20 horas');
    if (!pending.length && status === CredentialValidationStatus.VALID) return 'Cumple: responsable, curso de 50 horas, documentos, vigencia y actualización de 20 horas cuando aplica.';
    return `Pendiente: ${pending.join(', ')}.`;
  }

  private async hasTwentyHourCourse(companyId: Types.ObjectId, credential: ComplianceCredentialDocument) {
    if (credential.relatedTwentyHourCredentialId) {
      const relatedDocuments = await this.documentsRepository.findByCredential(companyId, credential.relatedTwentyHourCredentialId);
      return relatedDocuments.length > 0;
    }

    const courses = await this.credentialsRepository.findActiveCourse(companyId, CredentialCourseType.COURSE_20_HOURS, credential.responsibleUserId);
    for (const course of courses) {
      if (course.status === CredentialStatus.VENCIDO || !course.courseDate) continue;
      const documents = await this.documentsRepository.findByCredential(companyId, course._id);
      if (documents.length > 0) return true;
    }
    return false;
  }

  private async assertEmployeeBelongsToCompany(companyId: Types.ObjectId, employeeId: Types.ObjectId) {
    const employee = await this.employeeModel.findOne({ _id: employeeId, companyId }).exec();
    if (!employee) throw new NotFoundException(`Employee ${employeeId.toString()} not found in company`);
  }

  private extractOcrValues(dto: CreateCredentialDocumentDto, fileName: string) {
    const inferredDate = dto.ocrCourseDate ? this.parseRequiredDate(dto.ocrCourseDate, 'ocrCourseDate') : this.detectDate(fileName.concat(' ', dto.rawOcrText ?? ''));
    return {
      courseDate: inferredDate,
      certificateNumber: dto.ocrCertificateNumber ?? this.detectCertificateNumber(fileName.concat(' ', dto.rawOcrText ?? '')),
      trainingEntity: dto.ocrTrainingEntity,
      confidence: dto.ocrCourseDate || dto.ocrCertificateNumber || dto.ocrTrainingEntity ? 0.9 : 0.35,
    };
  }

  private detectDate(text: string) {
    const match = text.match(/(20\d{2})[-_/](0?[1-9]|1[0-2])[-_/](0?[1-9]|[12]\d|3[01])|((0?[1-9]|[12]\d|3[01])[-_/](0?[1-9]|1[0-2])[-_/](20\d{2}))/);
    if (!match) return undefined;
    if (match[1]) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return new Date(Number(match[7]), Number(match[6]) - 1, Number(match[5]));
  }

  private detectCertificateNumber(text: string) {
    const match = text.match(/(?:cert(?:ificado)?|certificate|no\.?|nro\.?)\s*[:#-]?\s*([A-Z0-9-]{4,})/i);
    return match?.[1];
  }

  private resolveCredentialStatus(expirationDate?: Date) {
    if (!expirationDate) return CredentialStatus.VIGENTE;
    const now = new Date();
    if (expirationDate < now) return CredentialStatus.VENCIDO;
    return this.daysBetween(now, expirationDate) <= 30 ? CredentialStatus.PROXIMO_A_VENCER : CredentialStatus.VIGENTE;
  }

  private isOlderThanYears(date: Date | undefined, years: number) {
    return Boolean(date && this.addYears(date, years) < new Date());
  }

  private parseDate(value?: string) { return value ? this.parseRequiredDate(value, 'date') : undefined; }
  private parseRequiredDate(value: string, field: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException(`Invalid ${field}`);
    return date;
  }
  private addYears(date: Date, years: number) { const copy = new Date(date); copy.setFullYear(copy.getFullYear() + years); return copy; }
  private addDays(date: Date, days: number) { const copy = new Date(date); copy.setDate(copy.getDate() + days); return copy; }
  private daysBetween(start: Date, end: Date) { return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)); }
  private toObjectId(id: string, field: string) { if (!Types.ObjectId.isValid(id)) throw new BadRequestException(`Invalid ${field}`); return new Types.ObjectId(id); }
  private resolveUserId(user: UserDocument) { return (user as unknown as { _id: Types.ObjectId })._id; }
  private snapshotCredential(credential: ComplianceCredentialDocument) {
    return {
      responsibleUserId: credential.responsibleUserId?.toString(), trainingEntity: credential.trainingEntity, courseType: credential.courseType,
      certificateNumber: credential.certificateNumber, courseDate: credential.courseDate?.toISOString(), expirationDate: credential.expirationDate?.toISOString(),
      status: credential.status, comments: credential.comments,
    };
  }
  private recordHistory(companyId: Types.ObjectId, credentialId: Types.ObjectId | undefined, action: CredentialHistoryAction, field: string, oldValue: string | undefined, newValue: string | undefined, userId?: Types.ObjectId, details?: string) {
    return this.historyRepository.create({ companyId, credentialId, action, field, oldValue, newValue, details, createdBy: userId, updatedBy: userId });
  }
}
