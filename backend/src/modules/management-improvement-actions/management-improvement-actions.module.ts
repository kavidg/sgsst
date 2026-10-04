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
  ManagementImprovementAction,
  ManagementImprovementActionSchema,
} from './schemas/management-improvement-action.schema';
import {
  ManagementImprovementActionHistory,
  ManagementImprovementActionHistorySchema,
} from './schemas/management-improvement-action-history.schema';
import { ManagementImprovementActionsController } from './management-improvement-actions.controller';
import { ManagementImprovementActionsService } from './management-improvement-actions.service';

/**
 * E1 (7.1.2) — Módulo del dominio MANAGEMENT-IMPROVEMENT-ACTIONS (Acciones
 * de mejora de la alta dirección).
 *
 * - AuthModule: provee FirebaseAdminService/FirebaseAuthGuard (el guard se
 *   aplica a nivel de controller y requiere ese provider en el contexto).
 * - UsersModule: resolución server-side del tenant (UsersService.findByFirebaseUid).
 * - User: validación tenant-safe de responsables (un query $in por operación,
 *   sin N+1).
 * - DocumentMaster: SOLO validación declarativa de la referencia de evidencia
 *   ({id, companyId}); este módulo NO implementa upload/storage propio ni
 *   importa servicios de DocumentManagement (regla E1 — sin sistema nuevo de
 *   archivos).
 *
 * FRONTERAS NORMATIVAS:
 * - 6.1.3 (management-review-direction): NO se modifica; origin
 *   MANAGEMENT_REVIEW_6_1_3 es declarativo y NUNCA consulta ese dominio.
 * - 7.1.1 (corrective-preventive-actions): dominio independiente; NO se
 *   reutiliza como fuente de 7.1.2.
 * - accountability (AccountabilityMeeting/Commitment): NO se modifica ni
 *   migra; el provider legacy `management-improvement` (reuniones) permanece
 *   intacto durante E1.
 *
 * NOTA DE ALCANCE (E1): este módulo NO registra provider de ComplianceEngine,
 * NO implementa scoring ni analyzer de IA, NO modifica el catálogo ni
 * SCORING_INELIGIBLE_MODULES — eso corresponde a E2. NO tiene página
 * frontend todavía.
 */
@Module({
  imports: [
    AuthModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: ManagementImprovementAction.name, schema: ManagementImprovementActionSchema },
      { name: ManagementImprovementActionHistory.name, schema: ManagementImprovementActionHistorySchema },
      { name: User.name, schema: UserSchema },
      // Referencia declarativa de evidencia (solo {id, companyId}).
      { name: DocumentMaster.name, schema: DocumentMasterSchema },
    ]),
  ],
  controllers: [ManagementImprovementActionsController],
  providers: [ManagementImprovementActionsService],
  exports: [ManagementImprovementActionsService],
})
export class ManagementImprovementActionsModule {}
