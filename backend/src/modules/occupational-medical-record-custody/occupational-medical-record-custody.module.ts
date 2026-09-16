import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { EmployeesModule } from '../employees/employees.module';
import { Employee, EmployeeSchema } from '../employees/schemas/employee.schema';
import { RolesGuard } from '../questions/roles.guard';
import { User, UserSchema } from '../users/schemas/user.schema';
import { UsersModule } from '../users/users.module';
import { OccupationalMedicalRecordCustodyController } from './occupational-medical-record-custody.controller';
import { OccupationalMedicalRecordCustodyService } from './occupational-medical-record-custody.service';
import {
  OccupationalMedicalRecordCustody,
  OccupationalMedicalRecordCustodySchema,
} from './schemas/occupational-medical-record-custody.schema';

@Module({
  imports: [
    AuthModule,
    EmployeesModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Employee.name, schema: EmployeeSchema },
      {
        name: OccupationalMedicalRecordCustody.name,
        schema: OccupationalMedicalRecordCustodySchema,
      },
    ]),
  ],
  controllers: [OccupationalMedicalRecordCustodyController],
  providers: [OccupationalMedicalRecordCustodyService, RolesGuard],
  exports: [OccupationalMedicalRecordCustodyService],
})
export class OccupationalMedicalRecordCustodyModule {}
