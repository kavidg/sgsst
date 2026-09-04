import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { CompanyUser, CompanyUserSchema } from '../companies/schemas/company-user.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { RolesGuard } from '../questions/roles.guard';
import { EvaluationsModule } from '../../evaluations/evaluations.module';
import { ComplianceEngineModule } from '../compliance-engine/compliance-engine.module';
import { Company, CompanySchema } from '../companies/schemas/company.schema';
import { DocumentManagementModule } from '../document-management/document-management.module';
import {
  InitialEvaluation,
  InitialEvaluationSchema,
} from '../initial-evaluation/schemas/initial-evaluation.schema';
import { ComplianceAIEngine } from './compliance-ai.service';
import { StandardAnalysisService } from './standard-analysis/standard-analysis.service';
import { StandardAnalysisController } from './standard-analysis/standard-analysis.controller';

/**
 * Módulo Compliance AI Engine.
 *
 * Expone ComplianceAIEngine para que el AI Orchestrator analice el
 * cumplimiento SG-SST con datos reales, y StandardAnalysisService para
 * el análisis inteligente por estándar específico.
 *
 * Reutiliza los módulos existentes sin duplicar lógica ni crear datos.
 */
@Module({
  imports: [
    AuthModule,
    EvaluationsModule,
    ComplianceEngineModule,
    DocumentManagementModule,
    MongooseModule.forFeature([
      // Lectura directa de la empresa y de la evaluación inicial (sin side effects).
      { name: Company.name, schema: CompanySchema },
      { name: InitialEvaluation.name, schema: InitialEvaluationSchema },
      // AUDIT-1: schemas requeridos por CompanyAccessGuard.
      { name: User.name, schema: UserSchema },
      { name: CompanyUser.name, schema: CompanyUserSchema },
    ]),
  ],
  controllers: [StandardAnalysisController],
  providers: [ComplianceAIEngine, StandardAnalysisService, CompanyAccessGuard, RolesGuard],
  exports: [ComplianceAIEngine, StandardAnalysisService],
})
export class ComplianceAiModule {}
