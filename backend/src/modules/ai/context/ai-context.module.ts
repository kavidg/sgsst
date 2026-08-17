import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AnnualWorkPlanModule } from '../../annual-work-plan/annual-work-plan.module';
import { Company, CompanySchema } from '../../companies/schemas/company.schema';
import { ComplianceEngineModule } from '../../compliance-engine/compliance-engine.module';
// Fase 4 (1.1.8): expone ConvivenciaService (dominio del Comité de Convivencia
// Laboral) para alimentar la sección convivencia del contexto.
import { ConvivenciaModule } from '../../convivencia/convivencia.module';
import { DocumentManagementModule } from '../../document-management/document-management.module';
import { PhvaModule } from '../../phva/phva.module';
// Fase 7 (1.1.7): expone PhvaAdvancedCopasstTrainingService (dominio de
// Capacitación COPASST) para alimentar la sección copasstTraining del contexto.
import { PhvaAdvancedModule } from '../../phva-advanced/phva-advanced.module';
import { AiContextService } from './ai-context.service';

/**
 * Módulo de Contexto IA.
 *
 * Capa central que prepara el contexto operativo de una empresa (CompanyAIContext)
 * reutilizando servicios existentes (Compliance Engine, PHVA, Plan Anual y
 * Gestor Documental). Expone AiContextService para que los Engines IA y el
 * futuro Copiloto consuman un único contexto ya agregado, sin duplicar lógica.
 */
@Module({
  imports: [
    // Lectura directa de la empresa (nombre y standardsType) sin side effects.
    MongooseModule.forFeature([{ name: Company.name, schema: CompanySchema }]),
    ComplianceEngineModule,
    PhvaModule,
    DocumentManagementModule,
    AnnualWorkPlanModule,
    // Fase 7 (1.1.7): módulo de dominio de la Capacitación COPASST. El grafo
    // no genera ciclos (PhvaAdvancedModule no depende de AiContextModule).
    PhvaAdvancedModule,
    // Fase 4 (1.1.8): módulo de dominio del Comité de Convivencia. El grafo no
    // genera ciclos (ConvivenciaModule no depende de AiContextModule).
    ConvivenciaModule,
  ],
  providers: [AiContextService],
  exports: [AiContextService],
})
export class AiContextModule {}
