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
  ImprovementPlan,
  ImprovementPlanSchema,
} from './schemas/improvement-plan.schema';
import {
  ImprovementPlanHistory,
  ImprovementPlanHistorySchema,
} from './schemas/improvement-plan-history.schema';
import { ImprovementPlansController } from './improvement-plans.controller';
import { ImprovementPlansService } from './improvement-plans.service';

/**
 * E1 (7.1.4) — Módulo del dominio IMPROVEMENT-PLANS (Plan de mejoramiento).
 *
 * - AuthModule: provee FirebaseAdminService/FirebaseAuthGuard (el guard se
 *   aplica a nivel de controller y requiere ese provider en el contexto).
 * - UsersModule: resolución server-side del tenant (UsersService.findByFirebaseUid).
 * - User: validación tenant-safe de responsables (un query $in por operación,
 *   sin N+1).
 * - DocumentMaster: SOLO validación declarativa de la referencia de evidencia
 *   ({id, companyId}); este módulo NO implementa upload/storage propio.
 *
 * FRONTERAS NORMATIVAS:
 * - El dominio `programs` (SgstProgram/ProgramActivity) permanece INTACTO:
 *   representa programas operativos del SG-SST (otro concepto); NO se migra,
 *   NO se reutiliza ni se renombra.
 * - 7.1.1 (corrective-preventive-actions), 7.1.2 (management-improvement-
 *   actions) y 7.1.3 (incident-actions): dominios independientes; el plan
 *   guarda `originReferenceId` DECLARATIVO pero NUNCA consulta esos dominios
 *   (sin acoplamiento ni doble scoring en E2).
 * - originReferenceId NUNCA dispara queries contra AnnualAudit,
 *   ManagementReviewDirection, Incidents ni Indicators.
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
      { name: ImprovementPlan.name, schema: ImprovementPlanSchema },
      { name: ImprovementPlanHistory.name, schema: ImprovementPlanHistorySchema },
      { name: User.name, schema: UserSchema },
      // Referencia declarativa de evidencia (solo {id, companyId}).
      { name: DocumentMaster.name, schema: DocumentMasterSchema },
    ]),
  ],
  controllers: [ImprovementPlansController],
  providers: [ImprovementPlansService],
  exports: [ImprovementPlansService],
})
export class ImprovementPlansModule {}
