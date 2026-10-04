import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { CopasstPeriod, CopasstPeriodSchema } from '../copasst/schemas/copasst.schema';
import { AnnualAudit, AnnualAuditSchema } from '../annual-audit/schemas/annual-audit.schema';
import {
  CopasstAuditPlanning,
  CopasstAuditPlanningSchema,
} from './schemas/copasst-audit-planning.schema';
import {
  CopasstAuditPlanningHistory,
  CopasstAuditPlanningHistorySchema,
} from './schemas/copasst-audit-planning-history.schema';
import { CopasstAuditPlanningController } from './copasst-audit-planning.controller';
import { CopasstAuditPlanningService } from './copasst-audit-planning.service';

/**
 * E1 (6.1.4) — Módulo del dominio COPASST-AUDIT-PLANNING (Planificación de
 * auditorías COPASST).
 *
 * - AuthModule: provee FirebaseAdminService/FirebaseAuthGuard (el guard se
 *   aplica a nivel de controller y requiere ese provider en el contexto).
 * - UsersModule: resolución server-side del tenant (UsersService.findByFirebaseUid).
 * - User: validación tenant-safe de responsables/auditores (un query $in por
 *   operación, sin N+1).
 * - CopasstPeriod / AnnualAudit: SOLO validación declarativa de referencias
 *   ({id, companyId}); este módulo NO consulta esos dominios para scoring ni
 *   importa sus servicios (frontera 6.1.4 ↔ 6.1.2 / COPASST general).
 *
 * NOTA DE ALCANCE (E1): este módulo NO registra provider de ComplianceEngine,
 * NO implementa scoring ni analyzer de IA, NO modifica el catálogo ni
 * `findings-review` (wrong-mapping actual de 6.1.4 — se corrige en E2 con el
 * provider oficial). NO tiene página frontend todavía.
 */
@Module({
  imports: [
    AuthModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: CopasstAuditPlanning.name, schema: CopasstAuditPlanningSchema },
      { name: CopasstAuditPlanningHistory.name, schema: CopasstAuditPlanningHistorySchema },
      { name: User.name, schema: UserSchema },
      // Referencias declarativas tenant-safe (solo {id, companyId}).
      { name: CopasstPeriod.name, schema: CopasstPeriodSchema },
      { name: AnnualAudit.name, schema: AnnualAuditSchema },
    ]),
  ],
  controllers: [CopasstAuditPlanningController],
  providers: [CopasstAuditPlanningService],
  exports: [CopasstAuditPlanningService],
})
export class CopasstAuditPlanningModule {}
