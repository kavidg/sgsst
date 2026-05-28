import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AlertsModule } from '../alerts/alerts.module';
import { AuthModule } from '../auth/auth.module';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { CompanyUser, CompanyUserSchema } from '../companies/schemas/company-user.schema';
import { Employee, EmployeeSchema } from '../employees/schemas/employee.schema';
import { RolesGuard } from '../questions/roles.guard';
import { User, UserSchema } from '../users/schemas/user.schema';
import { UsersModule } from '../users/users.module';
import { ComplianceCredentialsController } from './compliance-credentials.controller';
import { ComplianceCredentialsService } from './compliance-credentials.service';
import {
  ComplianceCredentialsRepository,
  CredentialAlertsRepository,
  CredentialDocumentsRepository,
  CredentialHistoryRepository,
  CredentialOcrRepository,
  CredentialResponsiblesRepository,
  CredentialValidationsRepository,
} from './repositories/compliance-credentials.repository';
import { ComplianceCredential, ComplianceCredentialSchema } from './schemas/compliance-credential.schema';
import { CredentialAlert, CredentialAlertSchema } from './schemas/credential-alert.schema';
import { CredentialDocument, CredentialDocumentSchema } from './schemas/credential-document.schema';
import { CredentialHistory, CredentialHistorySchema } from './schemas/credential-history.schema';
import { CredentialOCRData, CredentialOCRDataSchema } from './schemas/credential-ocr-data.schema';
import { CredentialResponsible, CredentialResponsibleSchema } from './schemas/credential-responsible.schema';
import { CredentialValidation, CredentialValidationSchema } from './schemas/credential-validation.schema';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    AlertsModule,
    MongooseModule.forFeature([
      { name: ComplianceCredential.name, schema: ComplianceCredentialSchema },
      { name: CredentialResponsible.name, schema: CredentialResponsibleSchema },
      { name: CredentialDocument.name, schema: CredentialDocumentSchema },
      { name: CredentialOCRData.name, schema: CredentialOCRDataSchema },
      { name: CredentialAlert.name, schema: CredentialAlertSchema },
      { name: CredentialHistory.name, schema: CredentialHistorySchema },
      { name: CredentialValidation.name, schema: CredentialValidationSchema },
      { name: Employee.name, schema: EmployeeSchema },
      { name: User.name, schema: UserSchema },
      { name: CompanyUser.name, schema: CompanyUserSchema },
    ]),
  ],
  controllers: [ComplianceCredentialsController],
  providers: [
    ComplianceCredentialsService,
    ComplianceCredentialsRepository,
    CredentialResponsiblesRepository,
    CredentialDocumentsRepository,
    CredentialOcrRepository,
    CredentialAlertsRepository,
    CredentialHistoryRepository,
    CredentialValidationsRepository,
    RolesGuard,
    CompanyAccessGuard,
  ],
  exports: [ComplianceCredentialsService],
})
export class ComplianceCredentialsModule {}
