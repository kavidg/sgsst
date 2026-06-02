import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { Employee, EmployeeSchema } from '../employees/schemas/employee.schema';
import { EvaluationAnswer, EvaluationAnswerSchema } from '../evaluation-answers/schemas/evaluation-answer.schema';
import { Incident, IncidentSchema } from '../incidents/schemas/incident.schema';
import { Question, QuestionSchema } from '../questions/schemas/question.schema';
import { RolesGuard } from '../questions/roles.guard';
import { Risk, RiskSchema } from '../risks/schemas/risk.schema';
import { Training, TrainingSchema } from '../trainings/schemas/training.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { UsersModule } from '../users/users.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Employee.name, schema: EmployeeSchema },
      { name: Incident.name, schema: IncidentSchema },
      { name: Training.name, schema: TrainingSchema },
      { name: Risk.name, schema: RiskSchema },
      { name: EvaluationAnswer.name, schema: EvaluationAnswerSchema },
      { name: Question.name, schema: QuestionSchema },
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService, RolesGuard],
})
export class DashboardModule {}
