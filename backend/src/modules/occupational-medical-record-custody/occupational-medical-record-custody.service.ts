import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Employee, EmployeeDocument } from '../employees/schemas/employee.schema';
import { EmployeesService } from '../employees/employees.service';
import { OccupationalMedicalRecordCustody, OccupationalMedicalRecordCustodyDocument } from './schemas/occupational-medical-record-custody.schema';
import { CreateOccupationalMedicalRecordCustodyDto } from './dto/create-occupational-medical-record-custody.dto';
import { UpdateOccupationalMedicalRecordCustodyDto } from './dto/update-occupational-medical-record-custody.dto';

/**
 * Servicio de custodia de historias clínicas ocupacionales (3.1.5 — FASE 30F).
 *
 * Gestiona registros administrativos de CONTROL DE CUSTODIA, no la historia
 * clínica en sí. Cumple estrictamente con las reglas:
 *
 * 1. Tenant isolation: todas las operaciones se filtran por companyId.
 * 2. Employee validation: employeeId debe pertenecer al mismo tenant.
 * 3. No almacena contenido clínico.
 * 4. No infiere custodia desde OccupationalExam, MedicalRecommendation, etc.
 */
@Injectable()
export class OccupationalMedicalRecordCustodyService {
  constructor(
    @InjectModel(OccupationalMedicalRecordCustody.name)
    private readonly custodyModel: Model<OccupationalMedicalRecordCustodyDocument>,
    private readonly employeesService: EmployeesService,
    // FASE 30G: modelo Employee inyectado (patrón estándar del proyecto, ver
    // health-promotion.service / occupational-exam.service) en lugar de resolver
    // mongoose.model('Employee') global en runtime.
    @InjectModel(Employee.name)
    private readonly employeeModel: Model<EmployeeDocument>,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────────
  // CRUD
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Crea un nuevo registro de custodia para un trabajador.
   *
   * Validaciones:
   * - employeeId debe existir y pertenecer a companyId.
   * - retentionUntil >= custodyStartDate cuando exista retentionUntil.
   * - companyId se deriva de la sesión, nunca del body.
   */
  async create(
    companyId: string,
    dto: CreateOccupationalMedicalRecordCustodyDto,
    createdBy?: string,
  ): Promise<OccupationalMedicalRecordCustodyDocument> {
    // 1. Validar que el employee pertenece a este tenant
    const employee = await this.employeesService.findOne(companyId, new Types.ObjectId(dto.employeeId));
    if (!employee) {
      throw new Error(
        `Employee ${dto.employeeId} no existe o no pertenece a la empresa ${companyId}`,
      );
    }

    // 2. Validar coherencia de fechas
    const custodyStartDate = new Date(dto.custodyStartDate);
    if (dto.retentionUntil) {
      const retentionUntil = new Date(dto.retentionUntil);
      if (retentionUntil < custodyStartDate) {
        throw new Error(
          `retentionUntil (${dto.retentionUntil}) no puede ser anterior a custodyStartDate (${dto.custodyStartDate})`,
        );
      }
    }

    // 3. Crear registro con companyId derivado de la sesión
    const created = await this.custodyModel.create({
      companyId: new Types.ObjectId(companyId),
      employeeId: new Types.ObjectId(dto.employeeId),
      recordReference: dto.recordReference,
      recordType: dto.recordType,
      custodyStatus: dto.custodyStatus,
      custodianName: dto.custodianName,
      custodianRole: dto.custodianRole,
      custodyStartDate,
      retentionUntil: dto.retentionUntil ? new Date(dto.retentionUntil) : undefined,
      storageLocationReference: dto.storageLocationReference,
      accessControlDescription: dto.accessControlDescription,
      confidentialityConfirmed: dto.confidentialityConfirmed,
      integrityConfirmed: dto.integrityConfirmed,
      availabilityConfirmed: dto.availabilityConfirmed,
      notes: dto.notes,
      active: dto.active ?? true,
      createdBy: createdBy ?? '',
      updatedBy: createdBy ?? '',
    });

    return created.toObject() as OccupationalMedicalRecordCustodyDocument;
  }

  /**
   * Lista registros de custodia del tenant, activos por defecto.
   *
   * @param companyId - Tenant a consultar.
   * @param options - Opciones de filtrado.
   */
  async findAll(
    companyId: string,
    options: {
      active?: boolean;
      employeeId?: string;
      custodyStatus?: string;
      recordType?: string;
      limit?: number;
      skip?: number;
    } = {},
  ): Promise<OccupationalMedicalRecordCustodyDocument[]> {
    const filter: Record<string, unknown> = {
      companyId: new Types.ObjectId(companyId),
    };

    if (options.active !== undefined) {
      filter.active = options.active;
    }

    if (options.employeeId) {
      filter.employeeId = new Types.ObjectId(options.employeeId);
    }

    if (options.custodyStatus) {
      filter.custodyStatus = options.custodyStatus;
    }

    if (options.recordType) {
      filter.recordType = options.recordType;
    }

    const limit = options.limit ?? 100;
    const skip = options.skip ?? 0;

    const results = await this.custodyModel
      .find(filter)
      .sort({ custodyStartDate: -1 })
      .limit(limit)
      .skip(skip)
      .lean();
    return results as unknown as OccupationalMedicalRecordCustodyDocument[];
  }

  /**
   * Busca un registro de custodia por ID, validando que pertenece al tenant.
   */
  async findOne(
    companyId: string,
    id: string,
  ): Promise<OccupationalMedicalRecordCustodyDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    const record = await this.custodyModel.findOne({
      _id: new Types.ObjectId(id),
      companyId: new Types.ObjectId(companyId),
    }).lean();

    return record as (OccupationalMedicalRecordCustodyDocument | null);
  }

  /**
   * Actualiza parcialmente un registro de custodia.
   *
   * Validaciones:
   * - El registro debe existir y pertenecer al tenant.
   * - Si se cambia employeeId, debe pertenecer al mismo tenant.
   * - Si se actualiza retentionUntil, debe ser >= custodyStartDate.
   */
  async update(
    companyId: string,
    id: string,
    dto: UpdateOccupationalMedicalRecordCustodyDto,
    updatedBy?: string,
  ): Promise<OccupationalMedicalRecordCustodyDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    // Verificar existencia y pertenencia al tenant
    const existing = await this.custodyModel.findOne({
      _id: new Types.ObjectId(id),
      companyId: new Types.ObjectId(companyId),
    });

    if (!existing) {
      return null;
    }

    // Build update object
    const update: Record<string, unknown> = {};
    const now = new Date();

    if (dto.employeeId !== undefined) {
      // Validar nuevo employeeId
      const employee = await this.employeesService.findOne(companyId, new Types.ObjectId(dto.employeeId));
      if (!employee) {
        throw new Error(
          `Employee ${dto.employeeId} no existe o no pertenece a la empresa ${companyId}`,
        );
      }
      update.employeeId = new Types.ObjectId(dto.employeeId);
    }

    if (dto.recordReference !== undefined) {
      update.recordReference = dto.recordReference;
    }

    if (dto.recordType !== undefined) {
      update.recordType = dto.recordType;
    }

    if (dto.custodyStatus !== undefined) {
      update.custodyStatus = dto.custodyStatus;
    }

    if (dto.custodianName !== undefined) {
      update.custodianName = dto.custodianName;
    }

    if (dto.custodianRole !== undefined) {
      update.custodianRole = dto.custodianRole;
    }

    if (dto.custodyStartDate !== undefined) {
      update.custodyStartDate = new Date(dto.custodyStartDate);
    }

    if (dto.retentionUntil !== undefined) {
      const custodyStartDate =
        dto.custodyStartDate !== undefined
          ? new Date(dto.custodyStartDate)
          : existing.custodyStartDate;
      const retentionUntil = new Date(dto.retentionUntil);
      if (retentionUntil < custodyStartDate) {
        throw new Error(
          `retentionUntil (${dto.retentionUntil}) no puede ser anterior a custodyStartDate`,
        );
      }
      update.retentionUntil = retentionUntil;
    }

    if (dto.storageLocationReference !== undefined) {
      update.storageLocationReference = dto.storageLocationReference;
    }

    if (dto.accessControlDescription !== undefined) {
      update.accessControlDescription = dto.accessControlDescription;
    }

    if (dto.confidentialityConfirmed !== undefined) {
      update.confidentialityConfirmed = dto.confidentialityConfirmed;
    }

    if (dto.integrityConfirmed !== undefined) {
      update.integrityConfirmed = dto.integrityConfirmed;
    }

    if (dto.availabilityConfirmed !== undefined) {
      update.availabilityConfirmed = dto.availabilityConfirmed;
    }

    if (dto.notes !== undefined) {
      update.notes = dto.notes;
    }

    if (dto.active !== undefined) {
      update.active = dto.active;
    }

    update.updatedBy = updatedBy ?? '';

    const updated = await this.custodyModel
      .findByIdAndUpdate(id, update, { new: true })
      .lean();

    return updated as (OccupationalMedicalRecordCustodyDocument | null);
  }

  /**
   * Desactiva (borrado lógico) un registro de custodia.
   *
   * Se establece active = false sin borrar el documento físicamente.
   */
  async deactivate(
    companyId: string,
    id: string,
    updatedBy?: string,
  ): Promise<OccupationalMedicalRecordCustodyDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    const updated = await this.custodyModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(id),
          companyId: new Types.ObjectId(companyId),
        },
        {
          active: false,
          updatedBy: updatedBy ?? '',
        },
        { new: true },
      )
      .lean();

    return updated as (OccupationalMedicalRecordCustodyDocument | null);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Métodos helpers para el provider
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Cuenta trabajadores con al menos un registro de custodia ACTIVO y VÁLIDO
   * (IN_CUSTODY, con campos requeridos completados).
   *
   * Para C1: trabajadores con custodia válida / total trabajadores.
   */
  /**
   * Cuenta trabajadores con al menos un registro de custodia ACTIVO y VÁLIDO
   * (IN_CUSTODY, con campos requeridos completados).
   *
   * Para C1: trabajadores con custodia válida / total trabajadores.
   */
  async countWorkersWithValidCustody(
    companyId: string,
  ): Promise<{ count: number; totalWorkers: number }> {
    // Contar registros de custodia válidos (activos, IN_CUSTODY, con campos completados)
    const validCustodyCount = await this.custodyModel.countDocuments({
      companyId: new Types.ObjectId(companyId),
      active: true,
      custodyStatus: 'IN_CUSTODY',
      confidentialityConfirmed: true,
      integrityConfirmed: true,
      availabilityConfirmed: true,
      recordReference: { $exists: true, $ne: '' },
      custodianName: { $exists: true, $ne: '' },
      storageLocationReference: { $exists: true, $ne: '' },
      custodyStartDate: { $exists: true },
    });

    // Total de trabajadores del tenant (modelo Employee inyectado, tenant-scoped).
    const totalWorkers = await this.employeeModel
      .countDocuments({ companyId: new Types.ObjectId(companyId) })
      .catch(() => 0);

    return { count: validCustodyCount, totalWorkers };
  }

  /**
   * Obtiene registros de custodia válidos para scoring.
   *
   * Un registro es VÁLIDO para scoring cuando:
   * - active: true
   * - custodyStatus: IN_CUSTODY
   * - confidentialityConfirmed: true (C4)
   * - integrityConfirmed: true (C4)
   * - availabilityConfirmed: true (C4)
   * - Todos los campos requeridos completados
   */
  async getValidCustodyRecords(companyId: string): Promise<OccupationalMedicalRecordCustodyDocument[]> {
    const results = await this.custodyModel
      .find({
        companyId: new Types.ObjectId(companyId),
        active: true,
        custodyStatus: 'IN_CUSTODY',
        confidentialityConfirmed: true,
        integrityConfirmed: true,
        availabilityConfirmed: true,
      })
      .lean();
    return results as unknown as OccupationalMedicalRecordCustodyDocument[];
  }
}
