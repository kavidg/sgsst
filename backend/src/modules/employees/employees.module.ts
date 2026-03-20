import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { RolesGuard } from '../questions/roles.guard';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { Employee, EmployeeSchema } from './schemas/employee.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }, { name: Employee.name, schema: EmployeeSchema }]),
    UsersModule,
  ],
  controllers: [EmployeesController],
  providers: [EmployeesService, RolesGuard],
})
export class EmployeesModule {}
