import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Employee, EmployeeSchema } from '../employees/schemas/employee.schema';
import { JobProfile, JobProfileSchema } from '../job-profile/schemas/job-profile.schema';
import { Risk, RiskSchema } from '../risks/schemas/risk.schema';
import { RolesGuard } from '../questions/roles.guard';
import { OccupationalExamController } from './occupational-exam.controller';
import { OccupationalExamService } from './occupational-exam.service';
import { OccupationalExam, OccupationalExamSchema } from './schemas/occupational-exam.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Employee.name, schema: EmployeeSchema },
      { name: OccupationalExam.name, schema: OccupationalExamSchema },
      // FASE 30D-2 (3.1.3): validación del contexto PRE-examen.
      { name: JobProfile.name, schema: JobProfileSchema },
      { name: Risk.name, schema: RiskSchema },
    ]),
    UsersModule,
  ],
  controllers: [OccupationalExamController],
  providers: [OccupationalExamService, RolesGuard],
  exports: [OccupationalExamService],
})
export class OccupationalExamModule {}
