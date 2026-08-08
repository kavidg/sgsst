import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Company } from '../companies/schemas/company.schema';
import { CompanyProfile, CompanyProfileDoc } from './schemas/company-profile.schema';

/**
 * Campos obligatorios que determinan la completitud del perfil de empresa.
 * Fuente única de verdad para calculateCompletion y para el
 * CompanyInfoProvider del Implementation Validator Engine.
 */
export const COMPANY_PROFILE_REQUIRED_FIELDS: Array<keyof CompanyProfile> = [
  'companyName', 'legalName', 'nit', 'economicSector', 'verificationDigit', 'companySize', 'riskLevel', 'companyType',
  'address', 'city', 'department', 'phone', 'email',
  'totalEmployees', 'directEmployees', 'arlName', 'sstStartDate', 'implementationStatus',
];

@Injectable()
export class CompanyProfileService {
  constructor(
    @InjectModel(CompanyProfile.name) private readonly profileModel: Model<CompanyProfileDoc>,
    @InjectModel(Company.name) private readonly companyModel: Model<Company>,
  ) {}

  private async syncCompanyFields(profile: CompanyProfileDoc): Promise<CompanyProfileDoc> {
    const company = await this.companyModel.findById(profile.companyId).lean().exec();
    if (company) {
      let changed = false;
      if (profile.companyName !== company.name) { profile.companyName = company.name; changed = true; }
      if (profile.nit !== company.nit) { profile.nit = company.nit; changed = true; }
      if (profile.economicSector !== company.economicSector) { profile.economicSector = company.economicSector; changed = true; }
      if (changed) await profile.save();
    }
    return profile;
  }

  async findOrCreate(companyId: Types.ObjectId): Promise<CompanyProfileDoc> {
    let profile = await this.profileModel.findOne({ companyId }).exec();
    if (profile) {
      return this.syncCompanyFields(profile);
    }
    const created = await this.profileModel.create({ companyId });
    await this.syncCompanyFields(created);
    return this.calculateCompletion(created);
  }

  async getProfile(companyId: Types.ObjectId): Promise<CompanyProfileDoc> {
    return this.findOrCreate(companyId);
  }

  async updateProfile(companyId: Types.ObjectId, payload: Record<string, unknown>, userId: string, userEmail?: string): Promise<CompanyProfileDoc> {
    const profile = await this.findOrCreate(companyId);

    // Track history for changed fields
    const trackedFields = new Set([
      'companyName', 'legalName', 'verificationDigit', 'companySize', 'riskLevel', 'companyType',
      'address', 'city', 'department', 'country', 'phone', 'email', 'website', 'logoUrl',
      'totalEmployees', 'directEmployees', 'contractors', 'apprentices', 'temporaryWorkers',
      'maleEmployees', 'femaleEmployees', 'otherGenderEmployees',
      'ageUnder18', 'age18to25', 'age26to35', 'age36to45', 'age46to60', 'ageOver60',
      'workSchedules', 'arlName', 'arlAffiliateNumber', 'sstStartDate', 'implementationStatus',
      'managerActsAsLegalRepresentative',
    ]);

    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined) continue;
      const oldVal = JSON.stringify((profile as unknown as Record<string, unknown>)[key]);
      const newVal = JSON.stringify(value);
      if (oldVal !== newVal && trackedFields.has(key)) {
        profile.history.push({
          userId,
          userEmail,
          action: 'UPDATE',
          field: key,
          previousValue: oldVal,
          newValue: newVal,
          timestamp: new Date().toISOString(),
        } as never);
      }
      (profile as unknown as Record<string, unknown>)[key] = value;
    }

    await profile.save();
    return this.calculateCompletion(profile);
  }

  // ============ WORK CENTERS ============
  async addWorkCenter(companyId: Types.ObjectId, data: { name: string; address?: string; city?: string; riskLevel?: string; employeeCount?: number }, userId: string) {
    const profile = await this.findOrCreate(companyId);
    profile.workCenters.push({ ...data, employeeCount: data.employeeCount ?? 0, active: true } as never);
    profile.history.push({ userId, action: 'CREATE', field: 'workCenters', newValue: data.name, timestamp: new Date().toISOString() } as never);
    await profile.save();
    return this.calculateCompletion(profile);
  }

  async updateWorkCenter(companyId: Types.ObjectId, index: number, data: Record<string, unknown>, userId: string) {
    const profile = await this.findOrCreate(companyId);
    if (!profile.workCenters[index]) throw new NotFoundException('Work center not found');
    Object.assign(profile.workCenters[index], data);
    profile.history.push({ userId, action: 'UPDATE', field: `workCenters[${index}]`, newValue: data.name as string || String(index), timestamp: new Date().toISOString() } as never);
    await profile.save();
    return this.calculateCompletion(profile);
  }

  async removeWorkCenter(companyId: Types.ObjectId, index: number, userId: string) {
    const profile = await this.findOrCreate(companyId);
    if (!profile.workCenters[index]) throw new NotFoundException('Work center not found');
    profile.workCenters.splice(index, 1);
    profile.history.push({ userId, action: 'DELETE', field: 'workCenters', newValue: `Removed index ${index}`, timestamp: new Date().toISOString() } as never);
    await profile.save();
    return this.calculateCompletion(profile);
  }

  // ============ CONTACTS ============
  async upsertContact(companyId: Types.ObjectId, data: { type: string; name: string; position?: string; phone?: string; email?: string }, userId: string) {
    const profile = await this.findOrCreate(companyId);
    const idx = profile.contacts.findIndex((c) => c.type === data.type);
    if (idx >= 0) {
      Object.assign(profile.contacts[idx], data);
    } else {
      profile.contacts.push(data as never);
    }
    profile.history.push({ userId, action: idx >= 0 ? 'UPDATE' : 'CREATE', field: `contacts.${data.type}`, newValue: data.name, timestamp: new Date().toISOString() } as never);
    await profile.save();
    return this.calculateCompletion(profile);
  }

  // ============ COMPANY DOCUMENTS ============
  async addDocument(companyId: Types.ObjectId, data: { type: string; name: string; fileUrl?: string }, userId: string) {
    const profile = await this.findOrCreate(companyId);
    profile.companyDocuments.push({ ...data, isVerified: false, uploadedAt: new Date().toISOString() } as never);
    profile.history.push({ userId, action: 'CREATE', field: `documents.${data.type}`, newValue: data.name, timestamp: new Date().toISOString() } as never);
    await profile.save();
    return this.calculateCompletion(profile);
  }

  async removeDocument(companyId: Types.ObjectId, index: number, userId: string) {
    const profile = await this.findOrCreate(companyId);
    if (!profile.companyDocuments[index]) throw new NotFoundException('Document not found');
    profile.companyDocuments.splice(index, 1);
    profile.history.push({ userId, action: 'DELETE', field: 'companyDocuments', newValue: `Removed index ${index}`, timestamp: new Date().toISOString() } as never);
    await profile.save();
    return this.calculateCompletion(profile);
  }

  // ============ SST RESPONSIBLE ============
  async setSstResponsible(companyId: Types.ObjectId, userId: Types.ObjectId, userEmail: string) {
    const profile = await this.findOrCreate(companyId);
    profile.responsibleSstUserId = userId;
    profile.history.push({ userId: userEmail, action: 'UPDATE', field: 'responsibleSstUserId', newValue: userEmail, timestamp: new Date().toISOString() } as never);
    await profile.save();
    return this.calculateCompletion(profile);
  }

  // ============ COMPLETION CALCULATION ============
  async calculateCompletion(profile: CompanyProfileDoc): Promise<CompanyProfileDoc> {
    const requiredFields = COMPANY_PROFILE_REQUIRED_FIELDS;

    let filled = 0;
    for (const field of requiredFields) {
      const val = profile[field];
      if (val !== undefined && val !== null && val !== '' && val !== 0) {
        filled++;
      }
    }

    // Extra points for optional but valuable fields
    const extraFields: Array<keyof CompanyProfile> = [
      'website', 'logoUrl', 'maleEmployees', 'femaleEmployees',
      'contractors', 'apprentices', 'temporaryWorkers',
    ];
    let extra = 0;
    for (const field of extraFields) {
      const val = profile[field];
      if (val !== undefined && val !== null && val !== '' && val !== 0) {
        extra++;
      }
    }

    // Points for work centers, contacts, documents
    const hasWorkCenters = profile.workCenters.length > 0;
    const hasContacts = profile.contacts.length > 0;
    const hasDocuments = profile.companyDocuments.length > 0;
    const hasSstResponsible = !!profile.responsibleSstUserId;

    const totalPoints = requiredFields.length + extraFields.length + 4; // + WC, contacts, docs, SST
    let earned = filled + extra;
    if (hasWorkCenters) earned++;
    if (hasContacts) earned++;
    if (hasDocuments) earned++;
    if (hasSstResponsible) earned++;

    profile.completionPercentage = Math.min(100, Math.round((earned / totalPoints) * 100));
    return profile;
  }
}
