import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { RolesGuard } from '../questions/roles.guard';
import { TrainingsController } from './trainings.controller';
import { TrainingsService } from './trainings.service';
import { TrainingAttendance, TrainingAttendanceSchema } from './schemas/training-attendance.schema';
import { Training, TrainingSchema } from './schemas/training.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Training.name, schema: TrainingSchema },
      { name: TrainingAttendance.name, schema: TrainingAttendanceSchema },
    ]),
    UsersModule,
  ],
  controllers: [TrainingsController],
  providers: [TrainingsService, RolesGuard],
})
export class TrainingsModule {}
