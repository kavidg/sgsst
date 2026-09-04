import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { ApprovalWorkflowModule } from '../approval-workflow/approval-workflow.module';
import { RolesGuard } from '../questions/roles.guard';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import {
  ChangeRequest,
  ChangeRequestSchema,
} from './schema/change-request.schema';
import { ChangeManagementController } from './change-management.controller';
import { ChangeManagementService } from './change-management.service';

/**
 * Módulo de Gestión del Cambio (2.11.1).
 *
 * BLOQUE 2.11.1-A + 2.11.1-B: dominio base + CRUD backend.
 *
 * NO modifica Approval Workflow, ComplianceEngine ni Document Management.
 * NO integra ChangeManagementProvider ni ChangeManagementStandardAnalyzer.
 */
@Module({
  imports: [
    AuthModule,
    UsersModule,
    forwardRef(() => ApprovalWorkflowModule),
    MongooseModule.forFeature([
      { name: ChangeRequest.name, schema: ChangeRequestSchema },
    ]),
  ],
  controllers: [ChangeManagementController],
  providers: [
    ChangeManagementService,
    RolesGuard,
    CompanyAccessGuard,
  ],
  exports: [ChangeManagementService, MongooseModule],
})
export class ChangeManagementModule {}
