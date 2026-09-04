import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { RolesGuard } from '../questions/roles.guard';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { ApprovalWorkflowModule } from '../approval-workflow/approval-workflow.module';
import { Contract, ContractSchema } from './schemas/contract.schema';
import { ContractInduction, ContractInductionSchema } from './schemas/contract-induction.schema';
import { ContractEvaluation, ContractEvaluationSchema } from './schemas/contract-evaluation.schema';
import { Supplier, SupplierSchema } from '../acquisitions/schemas/supplier.schema';
import { ContractingController } from './contracting.controller';
import { ContractingService } from './contracting.service';

/**
 * Módulo de Contratación (2.10.1).
 *
 * BLOQUE 6A: schemas y enums base.
 * BLOQUE 6B: CRUD de contratos con tenant isolation.
 *
 * NO modifica Approval Workflow, ComplianceEngine ni Document Management.
 */
@Module({
  imports: [
    AuthModule,
    UsersModule,
    forwardRef(() => ApprovalWorkflowModule),
    MongooseModule.forFeature([
      { name: Contract.name, schema: ContractSchema },
      { name: ContractInduction.name, schema: ContractInductionSchema },
      { name: ContractEvaluation.name, schema: ContractEvaluationSchema },
      { name: Supplier.name, schema: SupplierSchema },
    ]),
  ],
  controllers: [ContractingController],
  providers: [
    ContractingService,
    RolesGuard,
    CompanyAccessGuard,
  ],
  exports: [ContractingService, MongooseModule],
})
export class ContractingModule {}
