import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './modules/auth/auth.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CompaniesModule } from './modules/companies/companies.module';
import { UsersModule } from './modules/users/users.module';
import { EvaluationsModule } from './evaluations/evaluations.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { RisksModule } from './modules/risks/risks.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { IncidentsModule } from './modules/incidents/incidents.module';
import { TrainingsModule } from './modules/trainings/trainings.module';
import { QuestionsModule } from './modules/questions/questions.module';
import { EvaluationAnswersModule } from './modules/evaluation-answers/evaluation-answers.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { InspectionsModule } from './modules/inspections/inspections.module';
import { AbsenteeismModule } from './modules/absenteeism/absenteeism.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { PhvaAdvancedModule } from './modules/phva-advanced/phva-advanced.module';
import { CopasstModule } from './modules/copasst/copasst.module';
import { CommitteeEngineModule } from './modules/committee-engine/committee-engine.module';
import { ComplianceCredentialsModule } from './modules/compliance-credentials/compliance-credentials.module';
import { InitialEvaluationModule } from './modules/initial-evaluation/initial-evaluation.module';
import { AnnualWorkPlanModule } from './modules/annual-work-plan/annual-work-plan.module';
import { DocumentManagementModule } from './modules/document-management/document-management.module';
import { AccountabilityModule } from './modules/accountability/accountability.module';
import { LegalMatrixModule } from './modules/legal-matrix/legal-matrix.module';
import { CommunicationModule } from './modules/communication/communication.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
    }),
    AuthModule,
    CompaniesModule,
    UsersModule,
    EvaluationsModule,
    EmployeesModule,
    RisksModule,
    DocumentsModule,
    IncidentsModule,
    TrainingsModule,
    QuestionsModule,
    EvaluationAnswersModule,
    DashboardModule,
    InspectionsModule,
    AbsenteeismModule,
    AlertsModule,
    TemplatesModule,
    PhvaAdvancedModule,
    CopasstModule,
    CommitteeEngineModule,
    ComplianceCredentialsModule,
    InitialEvaluationModule,
    AnnualWorkPlanModule,
    DocumentManagementModule,
    AccountabilityModule,
    LegalMatrixModule,
    CommunicationModule,
  ],
})
export class AppModule {}
