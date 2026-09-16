import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { RolesGuard } from '../questions/roles.guard';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { Employee, EmployeeSchema } from './schemas/employee.schema';
// FASE 30D-2: JobProfile para validar la relación Employee → JobProfile (3.1.3).
import { JobProfile, JobProfileSchema } from '../job-profile/schemas/job-profile.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Employee.name, schema: EmployeeSchema },
      { name: JobProfile.name, schema: JobProfileSchema },
    ]),
    UsersModule,
  ],
  controllers: [EmployeesController],
  providers: [EmployeesService, RolesGuard],
  exports: [EmployeesService],
})
export class EmployeesModule {}
