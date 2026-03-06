import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';
import { RolesGuard } from './roles.guard';
import { Question, QuestionSchema } from './schemas/question.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Question.name, schema: QuestionSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [QuestionsController],
  providers: [QuestionsService, RolesGuard],
  exports: [QuestionsService],
})
export class QuestionsModule {}
