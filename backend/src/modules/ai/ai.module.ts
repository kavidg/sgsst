import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { ComplianceAiModule } from '../compliance-ai/compliance-ai.module';
import { ComplianceAIEngine } from '../compliance-ai/compliance-ai.service';
import { PhvaModule } from '../phva/phva.module';
import { RolesGuard } from '../questions/roles.guard';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ContextService } from './context.service';
import { AiContextModule } from './context/ai-context.module';
import { AlertsEngine } from './engines/alerts.engine';
import { DocumentsEngine } from './engines/documents.engine';
import { IndicatorsEngine } from './engines/indicators.engine';
import { PhvaEngine } from './engines/phva.engine';
import { AI_ENGINES, AIEngine } from './interfaces/ai-engine.interface';
import { OrchestratorController } from './orchestrator.controller';
import { OrchestratorService } from './orchestrator.service';

/**
 * Módulo AI Orchestrator.
 *
 * Arquitectura preparada para escalar: cada engine es un provider inyectable
 * registrado bajo el token AI_ENGINES. Agregar un nuevo engine = crear la
 * clase, inyectarla y añadirla al useFactory.
 */
@Module({
  imports: [
    AuthModule,
    // AiContextModule expone AiContextService, la capa central de contexto IA.
    AiContextModule,
    // PhvaModule expone PhvaAnalysisService, requerido por PhvaEngine.
    PhvaModule,
    // ComplianceAiModule expone ComplianceAIEngine, requerido por el AI_ENGINES.
    ComplianceAiModule,
    // Schema de User requerido por RolesGuard para validar permisos.
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  controllers: [OrchestratorController],
  providers: [
    ContextService,
    OrchestratorService,
    RolesGuard,
    IndicatorsEngine,
    DocumentsEngine,
    PhvaEngine,
    AlertsEngine,
    {
      provide: AI_ENGINES,
      useFactory: (
        indicators: IndicatorsEngine,
        documents: DocumentsEngine,
        phva: PhvaEngine,
        alerts: AlertsEngine,
        compliance: ComplianceAIEngine,
      ): AIEngine[] => [indicators, documents, phva, alerts, compliance],
      inject: [IndicatorsEngine, DocumentsEngine, PhvaEngine, AlertsEngine, ComplianceAIEngine],
    },
  ],
})
export class AiModule {}
