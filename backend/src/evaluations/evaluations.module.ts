import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../modules/auth/auth.module';
import { RolesGuard } from '../modules/questions/roles.guard';
import { User, UserSchema } from '../modules/users/schemas/user.schema';
import { EvaluationsController } from './evaluations.controller';
import { EvaluationsService } from './evaluations.service';
import { Evaluation, EvaluationSchema } from './schemas/evaluation.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Evaluation.name, schema: EvaluationSchema },
      { name: User.name, schema: UserSchema },
    ]),
    AuthModule,
  ],
  controllers: [EvaluationsController],
  providers: [EvaluationsService, RolesGuard],
})
export class EvaluationsModule {}
