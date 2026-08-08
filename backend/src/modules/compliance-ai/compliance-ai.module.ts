import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EvaluationsModule } from '../../evaluations/evaluations.module';
import { ComplianceEngineModule } from '../compliance-engine/compliance-engine.module';
import { Company, CompanySchema } from '../companies/schemas/company.schema';
import { DocumentManagementModule } from '../document-management/document-management.module';
import {
  InitialEvaluation,
  InitialEvaluationSchema,
} from '../initial-evaluation/schemas/initial-evaluation.schema';
import { ComplianceAIEngine } from './compliance-ai.service';

/**
 * Módulo Compliance AI Engine.
 *
 * Expone ComplianceAIEngine para que el AI Orchestrator analice el
 * cumplimiento SG-SST con datos reales (empresa, estándares aplicables,
 * autoevaluaciones, evidencias/documentos e indicadores agregados).
 *
 * Reutiliza los módulos existentes sin duplicar lógica ni crear datos.
 */
@Module({
  imports: [
    EvaluationsModule,
    ComplianceEngineModule,
    DocumentManagementModule,
    MongooseModule.forFeature([
      // Lectura directa de la empresa y de la evaluación inicial (sin side effects).
      { name: Company.name, schema: CompanySchema },
      { name: InitialEvaluation.name, schema: InitialEvaluationSchema },
    ]),
  ],
  providers: [ComplianceAIEngine],
  exports: [ComplianceAIEngine],
})
export class ComplianceAiModule {}
