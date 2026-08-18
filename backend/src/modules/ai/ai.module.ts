import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AbsenteeismModule } from '../absenteeism/absenteeism.module';
import { AuthModule } from '../auth/auth.module';
// AUDIT-1: CompanyAccessGuard requiere los modelos User y CompanyUser para
// validar la membresía del usuario autenticado (mismo registro que
// ConvivenciaModule/InitialEvaluationModule).
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { IncidentsModule } from '../incidents/incidents.module';
import { InspectionsModule } from '../inspections/inspections.module';
import { TrainingsModule } from '../trainings/trainings.module';
import { CompanyUser, CompanyUserSchema } from '../companies/schemas/company-user.schema';
import { ComplianceAiModule } from '../compliance-ai/compliance-ai.module';
import { ComplianceAIEngine } from '../compliance-ai/compliance-ai.service';
import { PhvaModule } from '../phva/phva.module';
import { RolesGuard } from '../questions/roles.guard';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ContextService } from './context.service';
import { AiContextModule } from './context/ai-context.module';
import { AbsenteeismEngine } from './engines/absenteeism.engine';
import { AlertsEngine } from './engines/alerts.engine';
import { AuditsEngine } from './engines/audits.engine';
import { DocumentsEngine } from './engines/documents.engine';
import { IncidentsEngine } from './engines/incidents.engine';
import { IndicatorsEngine } from './engines/indicators.engine';
import { PhvaEngine } from './engines/phva.engine';
import { ProgramsEngine } from './engines/programs.engine';
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
    // AUDIT-1: schemas requeridos por CompanyAccessGuard (User para resolver
    // el firebaseUid y CompanyUser para validar la membresía por empresa).
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: CompanyUser.name, schema: CompanyUserSchema },
    ]),
    // AUDIT-5: módulos de dominio operativo para los engines delgados de
    // composición (accidentalidad, ausentismo, capacitaciones, inspecciones).
    // Ninguno depende de AiModule → sin ciclos; cada engine reutiliza el
    // service real del dominio sin duplicar lógica ni acceso a MongoDB.
    IncidentsModule,
    AbsenteeismModule,
    TrainingsModule,
    InspectionsModule,
  ],
  controllers: [OrchestratorController],
  providers: [
    ContextService,
    OrchestratorService,
    CompanyAccessGuard,
    RolesGuard,
    IndicatorsEngine,
    DocumentsEngine,
    PhvaEngine,
    AlertsEngine,
    // AUDIT-5: engines delgados de dominios operativos. Se añaden DESPUÉS de
    // los engines certificados en el array AI_ENGINES para no alterar el orden
    // de resolución de routeToEngine (que usa getName, no orden).
    IncidentsEngine,
    AbsenteeismEngine,
    ProgramsEngine,
    AuditsEngine,
    {
      provide: AI_ENGINES,
      useFactory: (
        indicators: IndicatorsEngine,
        documents: DocumentsEngine,
        phva: PhvaEngine,
        alerts: AlertsEngine,
        compliance: ComplianceAIEngine,
        incidents: IncidentsEngine,
        absenteeism: AbsenteeismEngine,
        programs: ProgramsEngine,
        audits: AuditsEngine,
      ): AIEngine[] => [
        indicators,
        documents,
        phva,
        alerts,
        compliance,
        incidents,
        absenteeism,
        programs,
        audits,
      ],
      inject: [
        IndicatorsEngine,
        DocumentsEngine,
        PhvaEngine,
        AlertsEngine,
        ComplianceAIEngine,
        IncidentsEngine,
        AbsenteeismEngine,
        ProgramsEngine,
        AuditsEngine,
      ],
    },
  ],
})
export class AiModule {}
