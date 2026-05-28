import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types, UpdateQuery } from 'mongoose';
import { ComplianceCredential, ComplianceCredentialDocument } from '../schemas/compliance-credential.schema';
import { CredentialAlert, CredentialAlertDocument } from '../schemas/credential-alert.schema';
import { CredentialDocument, CredentialDocumentDocument } from '../schemas/credential-document.schema';
import { CredentialHistory, CredentialHistoryDocument } from '../schemas/credential-history.schema';
import { CredentialOCRData, CredentialOCRDataDocument } from '../schemas/credential-ocr-data.schema';
import { CredentialResponsible, CredentialResponsibleDocument } from '../schemas/credential-responsible.schema';
import { CredentialValidation, CredentialValidationDocument } from '../schemas/credential-validation.schema';

@Injectable()
export class ComplianceCredentialsRepository {
  constructor(@InjectModel(ComplianceCredential.name) private readonly model: Model<ComplianceCredentialDocument>) {}

  create(payload: Partial<ComplianceCredential>) { return this.model.create(payload); }
  findByCompany(companyId: Types.ObjectId) { return this.model.find({ companyId }).sort({ expirationDate: 1, createdAt: -1 }).exec(); }
  findOne(companyId: Types.ObjectId, id: Types.ObjectId) { return this.model.findOne({ _id: id, companyId }).exec(); }
  findActiveCourse(companyId: Types.ObjectId, courseType: string, responsibleUserId?: Types.ObjectId) {
    const query: FilterQuery<ComplianceCredentialDocument> = { companyId, courseType };
    if (responsibleUserId) query.responsibleUserId = responsibleUserId;
    return this.model.find(query).sort({ courseDate: -1, createdAt: -1 }).exec();
  }
  async requireOne(companyId: Types.ObjectId, id: Types.ObjectId) {
    const credential = await this.findOne(companyId, id);
    if (!credential) throw new NotFoundException(`Credential ${id.toString()} not found`);
    return credential;
  }
  updateOne(companyId: Types.ObjectId, id: Types.ObjectId, payload: UpdateQuery<ComplianceCredentialDocument>) {
    return this.model.findOneAndUpdate({ _id: id, companyId }, payload, { new: true }).exec();
  }
}

@Injectable()
export class CredentialResponsiblesRepository {
  constructor(@InjectModel(CredentialResponsible.name) private readonly model: Model<CredentialResponsibleDocument>) {}
  create(payload: Partial<CredentialResponsible>) { return this.model.create(payload); }
  findByCompany(companyId: Types.ObjectId) { return this.model.find({ companyId }).populate('employeeId').sort({ createdAt: -1 }).exec(); }
  findActiveByCompany(companyId: Types.ObjectId) { return this.model.find({ companyId, status: 'ACTIVE' }).exec(); }
  async requireOne(companyId: Types.ObjectId, id: Types.ObjectId) {
    const responsible = await this.model.findOne({ _id: id, companyId }).exec();
    if (!responsible) throw new NotFoundException(`Responsible ${id.toString()} not found`);
    return responsible;
  }
}

@Injectable()
export class CredentialDocumentsRepository {
  constructor(@InjectModel(CredentialDocument.name) private readonly model: Model<CredentialDocumentDocument>) {}
  create(payload: Partial<CredentialDocument>) { return this.model.create(payload); }
  findByCredential(companyId: Types.ObjectId, credentialId: Types.ObjectId) { return this.model.find({ companyId, credentialId, isActive: true }).sort({ createdAt: -1 }).exec(); }
}

@Injectable()
export class CredentialOcrRepository {
  constructor(@InjectModel(CredentialOCRData.name) private readonly model: Model<CredentialOCRDataDocument>) {}
  create(payload: Partial<CredentialOCRData>) { return this.model.create(payload); }
  async requireOne(companyId: Types.ObjectId, id: Types.ObjectId) {
    const ocr = await this.model.findOne({ _id: id, companyId }).exec();
    if (!ocr) throw new NotFoundException(`OCR data ${id.toString()} not found`);
    return ocr;
  }
  findByCredential(companyId: Types.ObjectId, credentialId: Types.ObjectId) { return this.model.find({ companyId, credentialId }).sort({ createdAt: -1 }).exec(); }
}

@Injectable()
export class CredentialAlertsRepository {
  constructor(@InjectModel(CredentialAlert.name) private readonly model: Model<CredentialAlertDocument>) {}
  async createUnique(payload: Partial<CredentialAlert>) {
    const existing = await this.model.findOne({ companyId: payload.companyId, credentialId: payload.credentialId, type: payload.type, message: payload.message }).exec();
    if (existing) return existing;
    return this.model.create(payload);
  }
  findByCredential(companyId: Types.ObjectId, credentialId: Types.ObjectId) { return this.model.find({ companyId, credentialId }).sort({ dueAt: 1, createdAt: -1 }).exec(); }
}

@Injectable()
export class CredentialHistoryRepository {
  constructor(@InjectModel(CredentialHistory.name) private readonly model: Model<CredentialHistoryDocument>) {}
  create(payload: Partial<CredentialHistory>) { return this.model.create(payload); }
  findByCredential(companyId: Types.ObjectId, credentialId: Types.ObjectId) { return this.model.find({ companyId, credentialId }).sort({ createdAt: -1 }).exec(); }
}

@Injectable()
export class CredentialValidationsRepository {
  constructor(@InjectModel(CredentialValidation.name) private readonly model: Model<CredentialValidationDocument>) {}
  create(payload: Partial<CredentialValidation>) { return this.model.create(payload); }
  findByCredential(companyId: Types.ObjectId, credentialId: Types.ObjectId) { return this.model.find({ companyId, credentialId }).sort({ createdAt: -1 }).exec(); }
}
