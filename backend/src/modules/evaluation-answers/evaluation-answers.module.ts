import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Evaluation, EvaluationSchema } from '../../evaluations/schemas/evaluation.schema';
import { AuthModule } from '../auth/auth.module';
import { Question, QuestionSchema } from '../questions/schemas/question.schema';
import { RolesGuard } from '../questions/roles.guard';
import { User, UserSchema } from '../users/schemas/user.schema';
import { EvaluationAnswersController } from './evaluation-answers.controller';
import { EvaluationAnswersService } from './evaluation-answers.service';
import { EvaluationAnswer, EvaluationAnswerSchema } from './schemas/evaluation-answer.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: EvaluationAnswer.name, schema: EvaluationAnswerSchema },
      { name: Question.name, schema: QuestionSchema },
      { name: Evaluation.name, schema: EvaluationSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [EvaluationAnswersController],
  providers: [EvaluationAnswersService, RolesGuard],
  exports: [EvaluationAnswersService],
})
export class EvaluationAnswersModule {}
