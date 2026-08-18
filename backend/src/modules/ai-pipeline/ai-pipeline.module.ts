import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnnualWorkPlanModule } from '../annual-work-plan/annual-work-plan.module';
import { AuthModule } from '../auth/auth.module';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { CompanyUser, CompanyUserSchema } from '../companies/schemas/company-user.schema';
import { ComplianceActionEngineModule } from '../compliance-action-engine/compliance-action-engine.module';
import { ComplianceAiModule } from '../compliance-ai/compliance-ai.module';
import { ComplianceEngineModule } from '../compliance-engine/compliance-engine.module';
import { PhvaModule } from '../phva/phva.module';
import { RolesGuard } from '../questions/roles.guard';
import { User, UserSchema } from '../users/schemas/user.schema';
import { UsersModule } from '../users/users.module';
import { AiPipelineController } from './ai-pipeline.controller';
import { AiPipelineService } from './ai-pipeline.service';
import { AiAnalysisRecord, AiAnalysisRecordSchema } from './schemas/ai-analysis-record.schema';
import { PipelineTrace, PipelineTraceSchema } from './schemas/pipeline-trace.schema';

/**
 * Módulo AI Pipeline (AUDIT-3).
 *
 * Conecta el pipeline PHVA → IA → findings → acciones → plan anual → tareas →
 * evidencias → verificación REUTILIZANDO los motores existentes
 * (ComplianceAIEngine, PhvaAnalysisService, ComplianceActionEngineService,
 * AnnualWorkPlanService). No duplica motores: este módulo solo persiste
 * snapshots de análisis y vínculos de trazabilidad con tenant isolation.
 *
 * Schemas nuevos (justificados): ai_analysis_records (persistencia del
 * análisis IA, hoy efímero) y ai_pipeline_traces (relaciones entre
 * entidades del pipeline, que hoy no tienen dónde persistirse).
 */
@Module({
  imports: [
    AuthModule,
    UsersModule,
    ComplianceAiModule,
    ComplianceEngineModule,
    PhvaModule,
    ComplianceActionEngineModule,
    AnnualWorkPlanModule,
    // Schemas requeridos por CompanyAccessGuard (patrón certificado AUDIT-1).
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: CompanyUser.name, schema: CompanyUserSchema },
      { name: AiAnalysisRecord.name, schema: AiAnalysisRecordSchema },
      { name: PipelineTrace.name, schema: PipelineTraceSchema },
    ]),
  ],
  controllers: [AiPipelineController],
  providers: [AiPipelineService, RolesGuard, CompanyAccessGuard],
  exports: [AiPipelineService],
})
export class AiPipelineModule {}
