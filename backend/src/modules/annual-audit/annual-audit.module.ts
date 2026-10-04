import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { DocumentManagementModule } from '../document-management/document-management.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { AnnualAudit, AnnualAuditSchema } from './schemas/annual-audit.schema';
import { AnnualAuditHistory, AnnualAuditHistorySchema } from './schemas/annual-audit-history.schema';
import { AnnualAuditController } from './annual-audit.controller';
import { AnnualAuditService } from './annual-audit.service';

/**
 * E1 (6.1.2) — Módulo del dominio ANNUAL-AUDIT (Auditoría anual SG-SST).
 *
 * - AuthModule: provee FirebaseAdminService/FirebaseAuthGuard (FirebaseAuthGuard
 *   se aplica a nivel de controller y requiere ese provider en el contexto).
 * - UsersModule: resolución server-side del tenant (UsersService.findByFirebaseUid).
 * - DocumentManagementModule: evidencia documental tenant-safe
 *   (DocumentMasterService.findById(id, companyId)).
 * - El modelo User se registra localmente para validar responsables/auditor
 *   tenant-scoped (un solo query $in por operación).
 *
 * NOTA DE ALCANCE (E1): este módulo NO registra provider de ComplianceEngine,
 * NO implementa scoring ni analyzer de IA, y NO tiene página frontend todavía.
 */
@Module({
  imports: [
    AuthModule,
    UsersModule,
    DocumentManagementModule,
    MongooseModule.forFeature([
      { name: AnnualAudit.name, schema: AnnualAuditSchema },
      { name: AnnualAuditHistory.name, schema: AnnualAuditHistorySchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [AnnualAuditController],
  providers: [AnnualAuditService],
})
export class AnnualAuditModule {}
