import { BadRequestException, ForbiddenException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Company } from '../companies/schemas/company.schema';
import { CompanyProfile, CompanyProfileDoc } from './schemas/company-profile.schema';
import { StorageService } from '../document-generation/services/storage.service';

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

/** DOC-UPLOAD — Formatos aceptados para documentos de empresa (por MIME). */
export const COMPANY_DOCUMENT_ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

/** DOC-UPLOAD — Límite por archivo (20 MB, mismo tope que el resto de uploads del proyecto). */
export const COMPANY_DOCUMENT_MAX_SIZE_BYTES = 20 * 1024 * 1024;

@Injectable()
export class CompanyProfileService {
  constructor(
    @InjectModel(CompanyProfile.name) private readonly profileModel: Model<CompanyProfileDoc>,
    @InjectModel(Company.name) private readonly companyModel: Model<Company>,
    /** DOC-UPLOAD — Opcional: presente cuando el módulo importa DocumentGenerationModule. */
    private readonly storageService?: StorageService,
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
      const synced = await this.syncCompanyFields(profile);
      // BUGFIX completionPercentage — Derivar SIEMPRE el % de los datos reales
      // del perfil (fuente de verdad), sin persistir durante la lectura: los
      // perfiles antiguos quedaron con 0 almacenado porque las escrituras
      // calculaban después de save(). El GET devuelve el % derivado aunque el
      // valor materializado aún esté desactualizado; se repara solo con la
      // próxima escritura (que ya persiste el % calculado).
      return this.calculateCompletion(synced);
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

    await this.calculateCompletion(profile);
    await profile.save();
    return profile;
  }

  // ============ WORK CENTERS ============
  async addWorkCenter(companyId: Types.ObjectId, data: { name: string; address?: string; city?: string; riskLevel?: string; employeeCount?: number }, userId: string) {
    const profile = await this.findOrCreate(companyId);
    profile.workCenters.push({ ...data, employeeCount: data.employeeCount ?? 0, active: true } as never);
    profile.history.push({ userId, action: 'CREATE', field: 'workCenters', newValue: data.name, timestamp: new Date().toISOString() } as never);
    await this.calculateCompletion(profile);
    await profile.save();
    return profile;
  }

  async updateWorkCenter(companyId: Types.ObjectId, index: number, data: Record<string, unknown>, userId: string) {
    const profile = await this.findOrCreate(companyId);
    if (!profile.workCenters[index]) throw new NotFoundException('Work center not found');
    Object.assign(profile.workCenters[index], data);
    profile.history.push({ userId, action: 'UPDATE', field: `workCenters[${index}]`, newValue: data.name as string || String(index), timestamp: new Date().toISOString() } as never);
    await this.calculateCompletion(profile);
    await profile.save();
    return profile;
  }

  async removeWorkCenter(companyId: Types.ObjectId, index: number, userId: string) {
    const profile = await this.findOrCreate(companyId);
    if (!profile.workCenters[index]) throw new NotFoundException('Work center not found');
    profile.workCenters.splice(index, 1);
    profile.history.push({ userId, action: 'DELETE', field: 'workCenters', newValue: `Removed index ${index}`, timestamp: new Date().toISOString() } as never);
    await this.calculateCompletion(profile);
    await profile.save();
    return profile;
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
    await this.calculateCompletion(profile);
    await profile.save();
    return profile;
  }

  // ============ COMPANY DOCUMENTS ============
  /**
   * DOC-UPLOAD — Registra un documento de empresa subiendo el archivo REAL a
   * storage vía la abstracción StorageService → StorageProvider (ninguna URL
   * proviene del cliente). Ruta: companies/{companyId}/company-documents/.
   * El nombre documental se deriva de file.originalname.
   *
   * FASE 1: con provider privado (R2) `fileUrl` queda '' y la LECTURA se hace
   * con getDocumentSignedUrl() → la signed URL NUNCA se persiste.
   */
  async addDocumentFile(
    companyId: Types.ObjectId,
    file: Express.Multer.File | undefined,
    type: string,
    userId: string,
    userEmail?: string,
  ) {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('El archivo es obligatorio');
    }
    if (!type) {
      throw new BadRequestException('El tipo de documento es obligatorio');
    }
    if (file.size > COMPANY_DOCUMENT_MAX_SIZE_BYTES) {
      throw new BadRequestException('El archivo excede el tamaño máximo permitido (20 MB)');
    }
    // Validación por MIME real (no solo por la extensión del nombre del cliente).
    const normalizedType = (file.mimetype || '').toLowerCase();
    if (!COMPANY_DOCUMENT_ALLOWED_MIME_TYPES.has(normalizedType)) {
      throw new BadRequestException('Formato no soportado. Use PDF, JPG, PNG, DOC, DOCX, XLS o XLSX.');
    }
    if (!this.storageService) {
      throw new InternalServerErrorException('Storage no disponible');
    }

    const profile = await this.findOrCreate(companyId);
    const folder = `companies/${companyId.toString()}/company-documents`;
    // FASE 1 — el facade delega en el StorageProvider activo (legacy Firebase
    // o R2 privado). En R2 fileUrl es '' y solo se guarda storagePath.
    const { fileUrl, storagePath } = await this.storageService.upload(file.buffer, file.originalname, folder, {
      contentType: file.mimetype,
    });
    const documentName = file.originalname;

    profile.companyDocuments.push({
      type,
      name: documentName,
      fileUrl,
      storagePath,
      isVerified: false,
      uploadedAt: new Date().toISOString(),
    } as never);
    profile.history.push({ userId, userEmail, action: 'CREATE', field: `documents.${type}`, newValue: documentName, timestamp: new Date().toISOString() } as never);
    await this.calculateCompletion(profile);
    await profile.save();
    return profile;
  }

  /**
   * FASE 1 — Visualización segura de un documento de empresa.
   *
   * Devuelve una URL firmada TEMPORAL generada bajo demanda (nunca persistida).
   * Autorización: la empresa SIEMPRE viene del guard (companyId) y el documento
   * se busca por índice DENTRO de ese perfil; como defensa en profundidad se
   * valida además que el storagePath pertenezca a la carpeta de la empresa,
   * de modo que un registro corrupto nunca exponga archivos de otra empresa.
   * Los registros históricos sin storagePath (solo fileUrl pública) no pasan
   * por storage y reciben un error controlado: el frontend los abre por fileUrl.
   */
  async getDocumentSignedUrl(companyId: Types.ObjectId, index: number) {
    if (!this.storageService) {
      throw new InternalServerErrorException('Storage no disponible');
    }
    const profile = await this.profileModel
      .findOne({ companyId })
      .exec();
    const document = profile?.companyDocuments?.[index];
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    if (!document.storagePath) {
      throw new BadRequestException(
        'El documento no tiene archivo en storage (registro histórico): ábralo con su fileUrl original.',
      );
    }
    const companyPrefix = `companies/${companyId.toString()}/company-documents/`;
    if (!document.storagePath.startsWith(companyPrefix)) {
      // Aislamiento tenant: el path de la BD debe vivir en la carpeta de la
      // empresa activa; si no, es un dato corrupto y NO se firma.
      throw new ForbiddenException('El documento no pertenece a la empresa activa');
    }
    return this.storageService.getSignedUrl(document.storagePath);
  }

  async addDocument(companyId: Types.ObjectId, data: { type: string; name: string; fileUrl?: string }, userId: string) {
    const profile = await this.findOrCreate(companyId);
    profile.companyDocuments.push({ ...data, isVerified: false, uploadedAt: new Date().toISOString() } as never);
    profile.history.push({ userId, action: 'CREATE', field: `documents.${data.type}`, newValue: data.name, timestamp: new Date().toISOString() } as never);
    await this.calculateCompletion(profile);
    await profile.save();
    return profile;
  }

  async removeDocument(companyId: Types.ObjectId, index: number, userId: string, userEmail?: string) {
    const profile = await this.findOrCreate(companyId);
    if (!profile.companyDocuments[index]) throw new NotFoundException('Document not found');
    const document = profile.companyDocuments[index];
    // DOC-UPLOAD — Eliminar también el archivo físico cuando el documento lo
    // referencia. Los históricos (solo fileUrl) se eliminan sin tocar Storage.
    if (document.storagePath && this.storageService) {
      try {
        await this.storageService.delete(document.storagePath);
      } catch {
        // El fallo al borrar el archivo físico no debe impedir eliminar el
        // registro (consistente con la tolerancia del resto del módulo).
      }
    }
    profile.companyDocuments.splice(index, 1);
    profile.history.push({ userId, userEmail, action: 'DELETE', field: 'companyDocuments', newValue: `Removed index ${index}`, timestamp: new Date().toISOString() } as never);
    await this.calculateCompletion(profile);
    await profile.save();
    return profile;
  }

  // ============ SST RESPONSIBLE ============
  async setSstResponsible(companyId: Types.ObjectId, userId: Types.ObjectId, userEmail: string) {
    const profile = await this.findOrCreate(companyId);
    profile.responsibleSstUserId = userId;
    profile.history.push({ userId: userEmail, action: 'UPDATE', field: 'responsibleSstUserId', newValue: userEmail, timestamp: new Date().toISOString() } as never);
    await this.calculateCompletion(profile);
    await profile.save();
    return profile;
  }

  // ============ COMPLETION CALCULATION ============
  /**
   * Calcula el porcentaje de completitud del perfil a partir de sus campos
   * reales (única fuente de verdad). Cálculo PURO en memoria: NO persiste.
   * Contrato: en operaciones de ESCRITURA debe llamarse ANTES de profile.save()
   * para que el documento persistido lleve el % correcto; en LECTURA
   * (findOrCreate/getProfile) se llama sin guardar para no introducir
   * escrituras en el GET.
   */
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
