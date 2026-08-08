import { Module } from '@nestjs/common';
import { AnnualWorkPlanModule } from '../annual-work-plan/annual-work-plan.module';
import { ComplianceEngineModule } from '../compliance-engine/compliance-engine.module';
import { DocumentManagementModule } from '../document-management/document-management.module';
import { PhvaAnalysisService } from './phva-analysis.service';

/**
 * Módulo PHVA Analysis.
 *
 * Expone PhvaAnalysisService para que el AI Orchestrator (PhvaEngine) analice
 * el ciclo PHVA con datos reales del sistema. Reutiliza los módulos existentes
 * (Compliance Engine, Plan Anual y Gestor Documental) sin duplicar lógica.
 */
@Module({
  imports: [
    ComplianceEngineModule,
    AnnualWorkPlanModule,
    DocumentManagementModule,
  ],
  providers: [PhvaAnalysisService],
  exports: [PhvaAnalysisService],
})
export class PhvaModule {}
