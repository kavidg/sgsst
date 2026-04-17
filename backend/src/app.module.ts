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
  ],
})
export class AppModule {}
