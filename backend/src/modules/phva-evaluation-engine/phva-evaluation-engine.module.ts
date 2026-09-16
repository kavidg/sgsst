import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { CompanyUser, CompanyUserSchema } from '../companies/schemas/company-user.schema';
import { PhvaAdvancedModule } from '../phva-advanced/phva-advanced.module';
import { RolesGuard } from '../questions/roles.guard';
import { User, UserSchema } from '../users/schemas/user.schema';
import { PhvaEvaluationEngineController } from './phva-evaluation-engine.controller';
import { PhvaEvaluationEngineService } from './phva-evaluation-engine.service';
import { ResponsableSstRule } from './rules/responsable-sst.rule';
import { ResponsibilitiesRule } from './rules/responsibilities.rule';
import { ResourceAssignmentRule } from './rules/resource-assignment.rule';

// ============================================================
// PhvaEvaluationEngine — Módulo (FASE 1)
// ============================================================
//
// Motor de evaluación automática por estándar del PHVA. Solo de consulta:
// NO persiste en Evaluation, NO genera alertas, NO modifica el flujo manual.
//
// Depende de PhvaAdvancedModule (ya exporta PhvaAdvancedService) para leer
// los datos reales de Gestión avanzada. RolesGuard y CompanyAccessGuard se
// proveen localmente (patrón del Compliance Action Engine) porque los guards
// se instancian por módulo en la plataforma y requieren los modelos
// User/CompanyUser registrados en MongooseModule.forFeature.

@Module({
  imports: [
    AuthModule,
    PhvaAdvancedModule,
    // Modelos requeridos por RolesGuard y CompanyAccessGuard (patrón del
    // Compliance Action Engine: los guards se instancian por módulo y
    // necesitan User/CompanyUser registrados localmente).
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: CompanyUser.name, schema: CompanyUserSchema },
    ]),
  ],
  controllers: [PhvaEvaluationEngineController],
  providers: [
    PhvaEvaluationEngineService,
    ResponsableSstRule,
    ResponsibilitiesRule,
    ResourceAssignmentRule,
    RolesGuard,
    CompanyAccessGuard,
  ],
  exports: [PhvaEvaluationEngineService],
})
export class PhvaEvaluationEngineModule {}
