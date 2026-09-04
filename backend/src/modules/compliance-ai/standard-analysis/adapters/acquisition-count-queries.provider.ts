import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Acquisition, AcquisitionDocument } from '../../../acquisitions/schemas/acquisition.schema';
import { Supplier, SupplierDocument } from '../../../acquisitions/schemas/supplier.schema';
import { ApprovalStatus } from '../../../approval-workflow/enums/approval-status.enum';
import {
  AcquisitionCountQueries,
  SupplierCountQueries,
} from './acquisition-evidence.adapter';

/**
 * Implementación de AcquisitionCountQueries usando el modelo Mongoose de Acquisition.
 * Proporciona conteos totales y métricas de aprobación por empresa.
 */
@Injectable()
export class AcquisitionCountQueryService implements AcquisitionCountQueries {
  constructor(
    @InjectModel(Acquisition.name) private acquisitionModel: Model<AcquisitionDocument>,
  ) {}

  async countByCompany(companyId: Types.ObjectId): Promise<number> {
    return this.acquisitionModel.countDocuments({ companyId }).exec();
  }

  async getApprovalMetrics(companyId: Types.ObjectId): Promise<{
    totalPending: number;
    totalApproved: number;
    totalRejected: number;
  }> {
    const [totalPending, totalApproved, totalRejected] = await Promise.all([
      this.acquisitionModel.countDocuments({
        companyId,
        approvalStatus: ApprovalStatus.PENDING_APPROVAL,
      }).exec(),
      this.acquisitionModel.countDocuments({
        companyId,
        approvalStatus: ApprovalStatus.APPROVED,
      }).exec(),
      this.acquisitionModel.countDocuments({
        companyId,
        approvalStatus: ApprovalStatus.REJECTED,
      }).exec(),
    ]);
    return { totalPending, totalApproved, totalRejected };
  }
}

/**
 * Implementación de SupplierCountQueries usando el modelo Mongoose de Supplier.
 */
@Injectable()
export class SupplierCountQueryService implements SupplierCountQueries {
  constructor(
    @InjectModel(Supplier.name) private supplierModel: Model<SupplierDocument>,
  ) {}

  async countByCompany(companyId: Types.ObjectId): Promise<number> {
    return this.supplierModel.countDocuments({ companyId }).exec();
  }

  async findIdsWithDocuments(): Promise<Types.ObjectId[]> {
    return [];
  }
}
