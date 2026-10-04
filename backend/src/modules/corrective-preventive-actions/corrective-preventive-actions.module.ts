import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import {
  DocumentMaster,
  DocumentMasterSchema,
} from '../document-management/schemas/document-master.schema';
import {
  CorrectivePreventiveAction,
  CorrectivePreventiveActionSchema,
} from './schemas/corrective-preventive-action.schema';
import {
  CorrectivePreventiveActionHistory,
  CorrectivePreventiveActionHistorySchema,
} from './schemas/corrective-preventive-action-history.schema';
import { CorrectivePreventiveActionsController } from './corrective-preventive-actions.controller';
import { CorrectivePreventiveActionsService } from './corrective-preventive-actions.service';

/**
 * E1 (7.1.1) — Módulo del dominio CORRECTIVE-PREVENTIVE-ACTIONS (Acciones
 * preventivas y correctivas).
 *
 * - AuthModule: provee FirebaseAdminService/FirebaseAuthGuard (el guard se
 *   aplica a nivel de controller y requiere ese provider en el contexto).
 * - UsersModule: resolución server-side del tenant (UsersService.findByFirebaseUid).
 * - User: validación tenant-safe de responsables/verificadores (un query $in
 *   por operación, sin N+1).
 * - DocumentMaster: SOLO validación declarativa de la referencia de evidencia
 *   ({id, companyId}); este módulo NO implementa upload/storage propio ni
 *   importa servicios de DocumentManagement (regla E1 — sin sistema nuevo de
 *   archivos).
 *
 * NOTA DE ALCANCE (E1): este módulo NO registra provider de ComplianceEngine,
 * NO implementa scoring ni analyzer de IA, NO modifica el catálogo ni retira
 * el provider legacy `corrective-preventive` (AccountabilityCommitment) del
 * scoring — eso corresponde a E2. NO tiene página frontend todavía.
 */
@Module({
  imports: [
    AuthModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: CorrectivePreventiveAction.name, schema: CorrectivePreventiveActionSchema },
      { name: CorrectivePreventiveActionHistory.name, schema: CorrectivePreventiveActionHistorySchema },
      { name: User.name, schema: UserSchema },
      // Referencia declarativa de evidencia (solo {id, companyId}).
      { name: DocumentMaster.name, schema: DocumentMasterSchema },
    ]),
  ],
  controllers: [CorrectivePreventiveActionsController],
  providers: [CorrectivePreventiveActionsService],
  exports: [CorrectivePreventiveActionsService],
})
export class CorrectivePreventiveActionsModule {}
