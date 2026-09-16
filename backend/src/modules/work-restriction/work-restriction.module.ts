import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { EmployeesModule } from '../employees/employees.module';
import { Employee, EmployeeSchema } from '../employees/schemas/employee.schema';
import { RolesGuard } from '../questions/roles.guard';
import { User, UserSchema } from '../users/schemas/user.schema';
import { UsersModule } from '../users/users.module';
import { WorkRestrictionController } from './work-restriction.controller';
import { WorkRestrictionService } from './work-restriction.service';
import {
  WorkRestriction,
  WorkRestrictionSchema,
} from './schemas/work-restriction.schema';

/**
 * Módulo de restricciones y recomendaciones médico-laborales
 * (3.1.6 — FASE 33). Patrón del módulo 3.1.5 (occupational-medical-record-custody).
 */
@Module({
  imports: [
    AuthModule,
    EmployeesModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Employee.name, schema: EmployeeSchema },
      {
        name: WorkRestriction.name,
        schema: WorkRestrictionSchema,
      },
    ]),
  ],
  controllers: [WorkRestrictionController],
  providers: [WorkRestrictionService, RolesGuard],
  exports: [WorkRestrictionService],
})
export class WorkRestrictionModule {}
