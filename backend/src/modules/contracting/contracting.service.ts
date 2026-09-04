import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Contract, ContractDocument, ContractStatus } from './schemas/contract.schema';
import { ContractInduction, ContractInductionDocument, InductionStatus } from './schemas/contract-induction.schema';
import { ContractEvaluation, ContractEvaluationDocument } from './schemas/contract-evaluation.schema';
import { Supplier, SupplierDocument, SupplierType, SupplierStatus } from '../acquisitions/schemas/supplier.schema';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { CreateContractInductionDto } from './dto/create-contract-induction.dto';
import { UpdateContractInductionDto } from './dto/update-contract-induction.dto';
import { CreateContractEvaluationDto } from './dto/create-contract-evaluation.dto';
import { UpdateContractEvaluationDto } from './dto/update-contract-evaluation.dto';
import { ApprovalStatus } from '../approval-workflow/enums/approval-status.enum';

@Injectable()
export class ContractingService {
  private readonly logger = new Logger(ContractingService.name);

  constructor(
    @InjectModel(Contract.name) private contractModel: Model<ContractDocument>,
    @InjectModel(ContractInduction.name) private inductionModel: Model<ContractInductionDocument>,
    @InjectModel(ContractEvaluation.name) private evaluationModel: Model<ContractEvaluationDocument>,
    @InjectModel(Supplier.name) private supplierModel: Model<SupplierDocument>,
  ) {}

  // ==================== HELPERS ====================

  /**
   * Valida que el contractorId corresponda a un Supplier existente
   * de tipo CONTRACTOR que pertenezca a la misma empresa.
   */
  private async validateContractor(companyId: Types.ObjectId, contractorId: string): Promise<void> {
    if (!Types.ObjectId.isValid(contractorId)) {
      throw new BadRequestException('Invalid contractorId');
    }

    const supplier = await this.supplierModel
      .findOne({ _id: new Types.ObjectId(contractorId), companyId })
      .exec();

    if (!supplier) {
      throw new NotFoundException('Contractor not found in this company');
    }

    if (supplier.type !== SupplierType.CONTRACTOR) {
      throw new BadRequestException(
        `Supplier "${supplier.name}" is of type "${supplier.type}". Only CONTRACTOR type is allowed for contracts.`,
      );
    }

    if (supplier.status !== SupplierStatus.ACTIVE) {
      throw new BadRequestException(`Supplier "${supplier.name}" is not active`);
    }
  }

  /**
   * Valida que las fechas de contrato sean consistentes.
   */
  private validateDates(contractStart?: string, contractEnd?: string): void {
    if (contractStart && contractEnd) {
      const start = new Date(contractStart);
      const end = new Date(contractEnd);
      if (end < start) {
        throw new BadRequestException('contractEnd must not be before contractStart');
      }
    }
  }

  /**
   * Verifica unicidad de contractNumber dentro de la empresa.
   */
  private async assertUniqueContractNumber(
    companyId: Types.ObjectId,
    contractNumber: string,
    excludeId?: Types.ObjectId,
  ): Promise<void> {
    const query: Record<string, unknown> = { companyId, contractNumber };
    if (excludeId) {
      query._id = { $ne: excludeId };
    }

    const existing = await this.contractModel.findOne(query).exec();
    if (existing) {
      throw new ConflictException(
        `Contract number "${contractNumber}" already exists in this company`,
      );
    }
  }

  // ==================== CRUD ====================

  /**
   * Crea un nuevo contrato.
   * companyId y status vienen del backend, no del cliente.
   */
  async create(
    companyId: Types.ObjectId,
    dto: CreateContractDto,
    userId?: Types.ObjectId,
    userName?: string,
  ): Promise<ContractDocument> {
    // Validar contractor
    await this.validateContractor(companyId, dto.contractorId);

    // Validar fechas
    this.validateDates(dto.contractStart, dto.contractEnd);

    // Validar unicidad del número
    await this.assertUniqueContractNumber(companyId, dto.contractNumber);

    try {
      const contract = await this.contractModel.create({
        companyId,
        contractNumber: dto.contractNumber,
        title: dto.title,
        description: dto.description,
        contractorId: new Types.ObjectId(dto.contractorId),
        status: ContractStatus.DRAFT,
        contractStart: dto.contractStart ? new Date(dto.contractStart) : undefined,
        contractEnd: dto.contractEnd ? new Date(dto.contractEnd) : undefined,
        sstRequirements: dto.sstRequirements,
        observations: dto.observations,
        createdBy: userId,
        createdByName: userName,
      });

      this.logger.log(`Contract created: ${dto.contractNumber} for company ${companyId}`);
      return contract;
    } catch (error: unknown) {
      // Manejar error de índice único de MongoDB (carrera de concurrencia)
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code: number }).code === 11000
      ) {
        throw new ConflictException(
          `Contract number "${dto.contractNumber}" already exists in this company`,
        );
      }
      throw error;
    }
  }

  /**
   * Lista todos los contratos de una empresa.
   * Orden descendente por fecha de creación.
   */
  async findAll(
    companyId: Types.ObjectId,
    filters?: {
      status?: string;
      contractorId?: string;
      search?: string;
    },
  ): Promise<ContractDocument[]> {
    const query: Record<string, unknown> = { companyId };

    if (filters?.status) {
      query.status = filters.status;
    }
    if (filters?.contractorId) {
      query.contractorId = new Types.ObjectId(filters.contractorId);
    }
    if (filters?.search) {
      query.$or = [
        { contractNumber: { $regex: filters.search, $options: 'i' } },
        { title: { $regex: filters.search, $options: 'i' } },
      ];
    }

    return this.contractModel
      .find(query)
      .populate('contractorId')
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Obtiene un contrato por ID dentro de la empresa.
   */
  async findOne(companyId: Types.ObjectId, id: string): Promise<ContractDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Contract not found');
    }

    const contract = await this.contractModel
      .findOne({ _id: new Types.ObjectId(id), companyId })
      .populate('contractorId')
      .exec();

    if (!contract) {
      throw new NotFoundException('Contract not found');
    }

    return contract;
  }

  /**
   * Actualiza un contrato existente.
   * Valida contractor, fechas y unicidad si cambian.
   */
  async update(
    companyId: Types.ObjectId,
    id: string,
    dto: UpdateContractDto,
  ): Promise<ContractDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Contract not found');
    }

    const existing = await this.contractModel
      .findOne({ _id: new Types.ObjectId(id), companyId })
      .exec();

    if (!existing) {
      throw new NotFoundException('Contract not found');
    }

    // Validar contractor si cambia
    if (dto.contractorId && dto.contractorId !== existing.contractorId?.toString()) {
      await this.validateContractor(companyId, dto.contractorId);
    }

    // Validar fechas si cambian
    const start = dto.contractStart ?? existing.contractStart?.toISOString();
    const end = dto.contractEnd ?? existing.contractEnd?.toISOString();
    this.validateDates(start, end);

    // Validar unicidad del número si cambia
    if (dto.contractNumber && dto.contractNumber !== existing.contractNumber) {
      await this.assertUniqueContractNumber(companyId, dto.contractNumber, existing._id);
    }

    const updatePayload: Record<string, unknown> = {};
    if (dto.contractNumber !== undefined) updatePayload.contractNumber = dto.contractNumber;
    if (dto.title !== undefined) updatePayload.title = dto.title;
    if (dto.description !== undefined) updatePayload.description = dto.description;
    if (dto.contractorId !== undefined) updatePayload.contractorId = new Types.ObjectId(dto.contractorId);
    if (dto.contractStart !== undefined) updatePayload.contractStart = dto.contractStart ? new Date(dto.contractStart) : null;
    if (dto.contractEnd !== undefined) updatePayload.contractEnd = dto.contractEnd ? new Date(dto.contractEnd) : null;
    if (dto.sstRequirements !== undefined) updatePayload.sstRequirements = dto.sstRequirements;
    if (dto.observations !== undefined) updatePayload.observations = dto.observations;

    try {
      const updated = await this.contractModel
        .findOneAndUpdate(
          { _id: new Types.ObjectId(id), companyId },
          { $set: updatePayload },
          { new: true },
        )
        .populate('contractorId')
        .exec();

      if (!updated) {
        throw new NotFoundException('Contract not found');
      }

      this.logger.log(`Contract updated: ${id} for company ${companyId}`);
      return updated;
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code: number }).code === 11000
      ) {
        throw new ConflictException(
          `Contract number "${dto.contractNumber}" already exists in this company`,
        );
      }
      throw error;
    }
  }

  /**
   * Elimina un contrato.
   * Solo el owner puede eliminar.
   */
  async remove(
    companyId: Types.ObjectId,
    id: string,
  ): Promise<{ message: string }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Contract not found');
    }

    const contract = await this.contractModel
      .findOne({ _id: new Types.ObjectId(id), companyId })
      .exec();

    if (!contract) {
      throw new NotFoundException('Contract not found');
    }

    await this.contractModel
      .findOneAndDelete({ _id: new Types.ObjectId(id), companyId })
      .exec();

    this.logger.log(`Contract deleted: ${contract.contractNumber} from company ${companyId}`);
    return { message: 'Contract deleted' };
  }

  /**
   * Obtiene contratos de una empresa agrupados por estado.
   * Útil para dashboards.
   */
  async getStats(companyId: Types.ObjectId) {
    const [
      total,
      draft,
      active,
      closed,
      cancelled,
    ] = await Promise.all([
      this.contractModel.countDocuments({ companyId }).exec(),
      this.contractModel.countDocuments({ companyId, status: ContractStatus.DRAFT }).exec(),
      this.contractModel.countDocuments({ companyId, status: ContractStatus.ACTIVE }).exec(),
      this.contractModel.countDocuments({ companyId, status: ContractStatus.CLOSED }).exec(),
      this.contractModel.countDocuments({ companyId, status: ContractStatus.CANCELLED }).exec(),
    ]);

    return { total, draft, active, closed, cancelled };
  }

  // ==================== INDUCTIONS CRUD ====================

  /**
   * Valida que el contrato exista, pertenezca a la empresa y esté en estado válido.
   */
  private async validateContractForInduction(
    companyId: Types.ObjectId,
    contractId: string,
  ): Promise<ContractDocument> {
    if (!Types.ObjectId.isValid(contractId)) {
      throw new BadRequestException('Invalid contractId');
    }

    const contract = await this.contractModel
      .findOne({ _id: new Types.ObjectId(contractId), companyId })
      .exec();

    if (!contract) {
      throw new NotFoundException('Contract not found in this company');
    }

    if (contract.status === ContractStatus.CLOSED) {
      throw new BadRequestException('Cannot create induction for a closed contract');
    }
    if (contract.status === ContractStatus.CANCELLED) {
      throw new BadRequestException('Cannot create induction for a cancelled contract');
    }

    return contract;
  }

  /**
   * Valida que el contratista coincida con el del contrato.
   */
  private async validateContractorForInduction(
    companyId: Types.ObjectId,
    contractorId: string,
    expectedContractorId: Types.ObjectId,
  ): Promise<void> {
    if (!Types.ObjectId.isValid(contractorId)) {
      throw new BadRequestException('Invalid contractorId');
    }

    const supplier = await this.supplierModel
      .findOne({ _id: new Types.ObjectId(contractorId), companyId })
      .exec();

    if (!supplier) {
      throw new NotFoundException('Contractor not found in this company');
    }

    if (supplier.type !== SupplierType.CONTRACTOR) {
      throw new BadRequestException(
        `Supplier "${supplier.name}" is of type "${supplier.type}". Only CONTRACTOR type is allowed.`,
      );
    }

    // Validar coincidencia con el contratista del contrato
    if (supplier._id.toString() !== expectedContractorId.toString()) {
      throw new BadRequestException(
        'Contractor does not match the contractor assigned to this contract',
      );
    }
  }

  /**
   * Crea una inducción SST para un contratista.
   */
  async createInduction(
    companyId: Types.ObjectId,
    dto: CreateContractInductionDto,
    userId?: Types.ObjectId,
  ): Promise<ContractInductionDocument> {
    // 1. Validar contrato
    const contract = await this.validateContractForInduction(companyId, dto.contractId);

    // 2. Validar contratista (coincide con el del contrato)
    await this.validateContractorForInduction(companyId, dto.contractorId, contract.contractorId);

    // 3. Crear inducción con valores controlados por backend
    const induction = await this.inductionModel.create({
      companyId,
      contractId: new Types.ObjectId(dto.contractId),
      contractorId: new Types.ObjectId(dto.contractorId),
      workerName: dto.workerName,
      workerId: dto.workerId,
      status: InductionStatus.PENDING,
      inductionDate: dto.inductionDate ? new Date(dto.inductionDate) : undefined,
      expirationDate: dto.expirationDate ? new Date(dto.expirationDate) : undefined,
      score: dto.score,
      createdBy: userId,
    });

    this.logger.log(`Induction created for worker "${dto.workerName}" in contract ${dto.contractId}`);
    return induction;
  }

  /**
   * Lista inducciones de una empresa con filtros.
   */
  async findAllInductions(
    companyId: Types.ObjectId,
    filters?: {
      contractId?: string;
      contractorId?: string;
      status?: string;
      search?: string;
    },
  ): Promise<ContractInductionDocument[]> {
    const query: Record<string, unknown> = { companyId };

    if (filters?.contractId) {
      query.contractId = new Types.ObjectId(filters.contractId);
    }
    if (filters?.contractorId) {
      query.contractorId = new Types.ObjectId(filters.contractorId);
    }
    if (filters?.status) {
      query.status = filters.status;
    }
    if (filters?.search) {
      query.workerName = { $regex: filters.search, $options: 'i' };
    }

    return this.inductionModel
      .find(query)
      .populate('contractId')
      .populate('contractorId')
      .sort({ createdAt: -1 })
      .exec();
  }

  /**
   * Obtiene una inducción por ID dentro de la empresa.
   */
  async findOneInduction(companyId: Types.ObjectId, id: string): Promise<ContractInductionDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Induction not found');
    }

    const induction = await this.inductionModel
      .findOne({ _id: new Types.ObjectId(id), companyId })
      .populate('contractId')
      .populate('contractorId')
      .exec();

    if (!induction) {
      throw new NotFoundException('Induction not found');
    }

    return induction;
  }

  /**
   * Actualiza una inducción existente.
   */
  async updateInduction(
    companyId: Types.ObjectId,
    id: string,
    dto: UpdateContractInductionDto,
  ): Promise<ContractInductionDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Induction not found');
    }

    const existing = await this.inductionModel
      .findOne({ _id: new Types.ObjectId(id), companyId })
      .exec();

    if (!existing) {
      throw new NotFoundException('Induction not found');
    }

    // Si cambia contractId, revalidar contrato
    let contractId = dto.contractId ?? existing.contractId?.toString();
    let contract: ContractDocument | null = null;
    if (dto.contractId && dto.contractId !== existing.contractId?.toString()) {
      contract = await this.validateContractForInduction(companyId, dto.contractId);
      contractId = dto.contractId;
    } else {
      contract = await this.contractModel
        .findOne({ _id: existing.contractId, companyId })
        .exec();
    }

    if (!contract) {
      throw new NotFoundException('Contract not found');
    }

    // Si cambia contractorId, revalidar contra el contrato
    const contractorId = dto.contractorId ?? existing.contractorId?.toString();
    if (dto.contractorId && dto.contractorId !== existing.contractorId?.toString()) {
      await this.validateContractorForInduction(companyId, dto.contractorId, contract.contractorId);
    } else if (dto.contractId && dto.contractId !== existing.contractId?.toString()) {
      // Si cambió el contrato pero no el contractor, validar que el contractor actual coincide con el nuevo contrato
      await this.validateContractorForInduction(companyId, contractorId!, contract.contractorId);
    }

    const updatePayload: Record<string, unknown> = {};
    if (dto.contractId !== undefined) updatePayload.contractId = new Types.ObjectId(dto.contractId);
    if (dto.contractorId !== undefined) updatePayload.contractorId = new Types.ObjectId(dto.contractorId);
    if (dto.workerName !== undefined) updatePayload.workerName = dto.workerName;
    if (dto.workerId !== undefined) updatePayload.workerId = dto.workerId;
    if (dto.status !== undefined) updatePayload.status = dto.status;
    if (dto.inductionDate !== undefined) updatePayload.inductionDate = dto.inductionDate ? new Date(dto.inductionDate) : null;
    if (dto.expirationDate !== undefined) updatePayload.expirationDate = dto.expirationDate ? new Date(dto.expirationDate) : null;
    if (dto.score !== undefined) updatePayload.score = dto.score;

    const updated = await this.inductionModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), companyId },
        { $set: updatePayload },
        { new: true },
      )
      .populate('contractId')
      .populate('contractorId')
      .exec();

    if (!updated) {
      throw new NotFoundException('Induction not found');
    }

    this.logger.log(`Induction updated: ${id} for company ${companyId}`);
    return updated;
  }

  /**
   * Elimina una inducción.
   */
  async removeInduction(
    companyId: Types.ObjectId,
    id: string,
  ): Promise<{ message: string }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Induction not found');
    }

    const induction = await this.inductionModel
      .findOne({ _id: new Types.ObjectId(id), companyId })
      .exec();

    if (!induction) {
      throw new NotFoundException('Induction not found');
    }

    await this.inductionModel
      .findOneAndDelete({ _id: new Types.ObjectId(id), companyId })
      .exec();

    this.logger.log(`Induction deleted: ${id} from company ${companyId}`);
    return { message: 'Induction deleted' };
  }

  /**
   * Obtiene estadísticas de inducciones por empresa.
   */
  async getInductionStats(companyId: Types.ObjectId) {
    const [
      total,
      pending,
      completed,
      expired,
      cancelled,
    ] = await Promise.all([
      this.inductionModel.countDocuments({ companyId }).exec(),
      this.inductionModel.countDocuments({ companyId, status: InductionStatus.PENDING }).exec(),
      this.inductionModel.countDocuments({ companyId, status: InductionStatus.COMPLETED }).exec(),
      this.inductionModel.countDocuments({ companyId, status: InductionStatus.EXPIRED }).exec(),
      this.inductionModel.countDocuments({ companyId, status: InductionStatus.CANCELLED }).exec(),
    ]);

    return { total, pending, completed, expired, cancelled };
  }

  // ==================== EVALUATIONS CRUD ====================

  /**
   * Valida que el contrato exista, pertenezca a la empresa y esté en estado válido para evaluación.
   */
  private async validateContractForEvaluation(
    companyId: Types.ObjectId,
    contractId: string,
  ): Promise<ContractDocument> {
    if (!Types.ObjectId.isValid(contractId)) {
      throw new BadRequestException('Invalid contractId');
    }

    const contract = await this.contractModel
      .findOne({ _id: new Types.ObjectId(contractId), companyId })
      .exec();

    if (!contract) {
      throw new NotFoundException('Contract not found in this company');
    }

    if (contract.status === ContractStatus.CLOSED) {
      throw new BadRequestException('Cannot create evaluation for a closed contract');
    }
    if (contract.status === ContractStatus.CANCELLED) {
      throw new BadRequestException('Cannot create evaluation for a cancelled contract');
    }

    return contract;
  }

  /**
   * Crea una evaluación de desempeño para un contratista.
   */
  async createEvaluation(
    companyId: Types.ObjectId,
    dto: CreateContractEvaluationDto,
    userId?: Types.ObjectId,
  ): Promise<ContractEvaluationDocument> {
    // 1. Validar contrato
    const contract = await this.validateContractForEvaluation(companyId, dto.contractId);

    // 2. Validar contratista (coincide con el del contrato)
    await this.validateContractorForInduction(companyId, dto.contractorId, contract.contractorId);

    // 3. Crear evaluación con valores controlados por backend
    const evaluation = await this.evaluationModel.create({
      companyId,
      contractId: new Types.ObjectId(dto.contractId),
      contractorId: new Types.ObjectId(dto.contractorId),
      evaluationDate: new Date(dto.evaluationDate),
      score: dto.score,
      criteria: dto.criteria,
      observations: dto.observations,
      evaluatedBy: userId,
    });

    this.logger.log(`Evaluation created for contract ${dto.contractId} with score ${dto.score}`);
    return evaluation;
  }

  /**
   * Lista evaluaciones de una empresa con filtros.
   */
  async findAllEvaluations(
    companyId: Types.ObjectId,
    filters?: {
      contractId?: string;
      contractorId?: string;
    },
  ): Promise<ContractEvaluationDocument[]> {
    const query: Record<string, unknown> = { companyId };

    if (filters?.contractId) {
      query.contractId = new Types.ObjectId(filters.contractId);
    }
    if (filters?.contractorId) {
      query.contractorId = new Types.ObjectId(filters.contractorId);
    }

    return this.evaluationModel
      .find(query)
      .populate('contractId')
      .populate('contractorId')
      .sort({ evaluationDate: -1 })
      .exec();
  }

  /**
   * Obtiene una evaluación por ID dentro de la empresa.
   */
  async findOneEvaluation(companyId: Types.ObjectId, id: string): Promise<ContractEvaluationDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Evaluation not found');
    }

    const evaluation = await this.evaluationModel
      .findOne({ _id: new Types.ObjectId(id), companyId })
      .populate('contractId')
      .populate('contractorId')
      .exec();

    if (!evaluation) {
      throw new NotFoundException('Evaluation not found');
    }

    return evaluation;
  }

  /**
   * Actualiza una evaluación existente.
   */
  async updateEvaluation(
    companyId: Types.ObjectId,
    id: string,
    dto: UpdateContractEvaluationDto,
  ): Promise<ContractEvaluationDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Evaluation not found');
    }

    const existing = await this.evaluationModel
      .findOne({ _id: new Types.ObjectId(id), companyId })
      .exec();

    if (!existing) {
      throw new NotFoundException('Evaluation not found');
    }

    const updatePayload: Record<string, unknown> = {};
    if (dto.evaluationDate !== undefined) updatePayload.evaluationDate = new Date(dto.evaluationDate);
    if (dto.score !== undefined) updatePayload.score = dto.score;
    if (dto.criteria !== undefined) updatePayload.criteria = dto.criteria;
    if (dto.observations !== undefined) updatePayload.observations = dto.observations;

    const updated = await this.evaluationModel
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), companyId },
        { $set: updatePayload },
        { new: true },
      )
      .populate('contractId')
      .populate('contractorId')
      .exec();

    if (!updated) {
      throw new NotFoundException('Evaluation not found');
    }

    this.logger.log(`Evaluation updated: ${id} for company ${companyId}`);
    return updated;
  }

  /**
   * Elimina una evaluación.
   */
  async removeEvaluation(
    companyId: Types.ObjectId,
    id: string,
  ): Promise<{ message: string }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Evaluation not found');
    }

    const evaluation = await this.evaluationModel
      .findOne({ _id: new Types.ObjectId(id), companyId })
      .exec();

    if (!evaluation) {
      throw new NotFoundException('Evaluation not found');
    }

    await this.evaluationModel
      .findOneAndDelete({ _id: new Types.ObjectId(id), companyId })
      .exec();

    this.logger.log(`Evaluation deleted: ${id} from company ${companyId}`);
    return { message: 'Evaluation deleted' };
  }

  /**
   * Obtiene estadísticas de evaluaciones por empresa.
   */
  async getEvaluationStats(companyId: Types.ObjectId) {
    const evaluations = await this.evaluationModel
      .find({ companyId })
      .select('score')
      .exec();

    const total = evaluations.length;
    const withScore = evaluations.filter((e) => typeof e.score === 'number').length;
    const averageScore = withScore > 0
      ? Math.round(evaluations.reduce((sum, e) => sum + (e.score ?? 0), 0) / withScore)
      : 0;

    return { total, withScore, averageScore };
  }

  // ==================== APPROVAL WORKFLOW ====================

  /**
   * Obtiene el estado de aprobación de un contrato.
   */
  async getApprovalStatus(
    companyId: Types.ObjectId,
    contractId: string,
  ): Promise<{
    contractId: string;
    approvalStatus: ApprovalStatus | null;
    canSubmit: boolean;
  }> {
    const contract = await this.contractModel
      .findOne({ _id: new Types.ObjectId(contractId), companyId })
      .exec();
    if (!contract) throw new NotFoundException('Contract not found');

    const approvalStatus = contract.approvalStatus ?? null;

    // Un contrato puede enviarse a aprobación si:
    // - No tiene approvalStatus actual, O
    // - Está en DRAFT/REJECTED/ADJUSTMENTS_REQUESTED
    const canSubmit = !approvalStatus ||
      approvalStatus === ApprovalStatus.DRAFT ||
      approvalStatus === ApprovalStatus.REJECTED ||
      approvalStatus === ApprovalStatus.ADJUSTMENTS_REQUESTED;

    return {
      contractId: contract._id.toString(),
      approvalStatus,
      canSubmit,
    };
  }

  /**
   * Prepara un contrato para enviarlo a aprobación.
   * Valida que pueda enviarse y actualiza approvalStatus.
   */
  async prepareForApproval(
    companyId: Types.ObjectId,
    contractId: string,
  ): Promise<{
    contractId: string;
    contractNumber: string;
    title: string;
  }> {
    const contract = await this.contractModel
      .findOne({ _id: new Types.ObjectId(contractId), companyId })
      .exec();
    if (!contract) throw new NotFoundException('Contract not found');

    // Validar que puede enviarse a aprobación
    if (contract.approvalStatus === ApprovalStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Contract is already pending approval');
    }
    if (contract.approvalStatus === ApprovalStatus.APPROVED) {
      throw new BadRequestException('Contract is already approved.');
    }
    if (contract.status === ContractStatus.CLOSED) {
      throw new BadRequestException('Closed contracts cannot be submitted for approval.');
    }
    if (contract.status === ContractStatus.CANCELLED) {
      throw new BadRequestException('Cancelled contracts cannot be submitted for approval.');
    }

    // Actualizar approvalStatus a PENDING_APPROVAL
    await this.contractModel
      .findByIdAndUpdate(
        contract._id,
        { $set: { approvalStatus: ApprovalStatus.PENDING_APPROVAL } },
        { new: true },
      )
      .exec();

    return {
      contractId: contract._id.toString(),
      contractNumber: contract.contractNumber,
      title: contract.title,
    };
  }
}
