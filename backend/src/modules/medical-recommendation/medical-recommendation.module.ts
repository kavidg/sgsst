import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Employee, EmployeeSchema } from '../employees/schemas/employee.schema';
import {
  OccupationalExam,
  OccupationalExamSchema,
} from '../occupational-exam/schemas/occupational-exam.schema';
import { RolesGuard } from '../questions/roles.guard';
import { MedicalRecommendationController } from './medical-recommendation.controller';
import { MedicalRecommendationService } from './medical-recommendation.service';
import {
  MedicalRecommendation,
  MedicalRecommendationSchema,
} from './schemas/medical-recommendation.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Employee.name, schema: EmployeeSchema },
      { name: OccupationalExam.name, schema: OccupationalExamSchema },
      { name: MedicalRecommendation.name, schema: MedicalRecommendationSchema },
    ]),
    UsersModule,
  ],
  controllers: [MedicalRecommendationController],
  providers: [MedicalRecommendationService, RolesGuard],
  exports: [MedicalRecommendationService],
})
export class MedicalRecommendationModule {}
