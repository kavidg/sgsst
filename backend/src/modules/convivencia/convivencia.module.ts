import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AlertsModule } from '../alerts/alerts.module';
import { AuthModule } from '../auth/auth.module';
import { CommunicationModule } from '../communication/communication.module';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { CompanyUser, CompanyUserSchema } from '../companies/schemas/company-user.schema';
import { RolesGuard } from '../questions/roles.guard';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Employee, EmployeeSchema } from '../employees/schemas/employee.schema';
import { ConvivenciaController } from './convivencia.controller';
import { ConvivenciaService } from './convivencia.service';
import { ConvivenciaPeriod, ConvivenciaPeriodSchema } from './schemas/convivencia.schema';

@Module({
  imports: [
    AuthModule,
    AlertsModule,
    CommunicationModule,
    MongooseModule.forFeature([
      { name: ConvivenciaPeriod.name, schema: ConvivenciaPeriodSchema },
      { name: User.name, schema: UserSchema },
      { name: CompanyUser.name, schema: CompanyUserSchema },
      { name: Employee.name, schema: EmployeeSchema },
    ]),
  ],
  controllers: [ConvivenciaController],
  providers: [ConvivenciaService, RolesGuard, CompanyAccessGuard],
})
export class ConvivenciaModule {}
