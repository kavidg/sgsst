import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ApprovalWorkflowModule } from '../approval-workflow/approval-workflow.module';
import { AlertsModule } from '../alerts/alerts.module';
import { AuthModule } from '../auth/auth.module';
import { CommunicationModule } from '../communication/communication.module';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { CompanyUser, CompanyUserSchema } from '../companies/schemas/company-user.schema';
import { RolesGuard } from '../questions/roles.guard';
import { User, UserSchema } from '../users/schemas/user.schema';
import { UsersModule } from '../users/users.module';
import { Employee, EmployeeSchema } from '../employees/schemas/employee.schema';
import { CopasstController } from './copasst.controller';
import { CopasstService } from './copasst.service';
import { CopasstPeriod, CopasstPeriodSchema } from './schemas/copasst.schema';
import { OtpRateLimitModule } from '../otp-rate-limit/otp-rate-limit.module';
import { OtpChallengeModule } from '../otp-challenge/otp-challenge.module';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    AlertsModule,
    CommunicationModule,
    forwardRef(() => ApprovalWorkflowModule),
    OtpRateLimitModule,
    // F7B-10.6-D: store OTP COMPARTIDO en MongoDB (desafíos; separado del
    // rate-limit de solicitudes).
    OtpChallengeModule,
    MongooseModule.forFeature([
      { name: CopasstPeriod.name, schema: CopasstPeriodSchema },
      { name: User.name, schema: UserSchema },
      { name: CompanyUser.name, schema: CompanyUserSchema },
      { name: Employee.name, schema: EmployeeSchema },
    ]),
  ],
  controllers: [CopasstController],
  providers: [CopasstService, RolesGuard, CompanyAccessGuard],
  exports: [CopasstService],
})
export class CopasstModule {}
