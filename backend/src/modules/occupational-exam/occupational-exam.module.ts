import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Employee, EmployeeSchema } from '../employees/schemas/employee.schema';
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
    ]),
    UsersModule,
  ],
  controllers: [OccupationalExamController],
  providers: [OccupationalExamService, RolesGuard],
  exports: [OccupationalExamService],
})
export class OccupationalExamModule {}
