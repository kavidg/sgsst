import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ApprovalWorkflowModule } from '../approval-workflow/approval-workflow.module';
import { AlertsModule } from '../alerts/alerts.module';
import { AuthModule } from '../auth/auth.module';
import { CommunicationModule } from '../communication/communication.module';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { CompanyUser, CompanyUserSchema } from '../companies/schemas/company-user.schema';
import { Company, CompanySchema } from '../companies/schemas/company.schema';
import { RolesGuard } from '../questions/roles.guard';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Employee, EmployeeSchema } from '../employees/schemas/employee.schema';
// Fase 5 (1.1.8): motor documental (DocumentGenerationService +
// SystemTemplateService) para el acta y el reporte de cumplimiento del comité.
import { DocumentGenerationModule } from '../document-generation/document-generation.module';
// F7B-11: infraestructura DISTRIBUIDA compartida certificada en COPASST.
// OtpChallengeModule (store OTP en MongoDB, colección copasst_otp_challenges)
// y OtpRateLimitModule (contadores atómicos en otp_rate_limit_counters).
// Reemplaza los Maps en memoria (otpStore / otpRequestLog) de Convivencia sin
// crear infraestructura paralela ni Redis.
import { OtpChallengeModule } from '../otp-challenge/otp-challenge.module';
import { OtpRateLimitModule } from '../otp-rate-limit/otp-rate-limit.module';
import { ConvivenciaController } from './convivencia.controller';
import { ConvivenciaService } from './convivencia.service';
import { ConvivenciaDocumentService } from './convivencia-document.service';
import { ConvivenciaDocumentGenerator } from './convivencia-document.generator';
import { ConvivenciaVariableResolverService } from './convivencia-variable-resolver.service';
import { ConvivenciaPeriod, ConvivenciaPeriodSchema, ConvivenciaCaseSequence, ConvivenciaCaseSequenceSchema } from './schemas/convivencia.schema';

@Module({
  imports: [
    AuthModule,
    AlertsModule,
    CommunicationModule,
    forwardRef(() => ApprovalWorkflowModule),
    // Fase 5 (1.1.8): DocumentGenerationModule expone DocumentGenerationService
    // y SystemTemplateService (únicas rutas de generación del sistema).
    // forwardRef por el ciclo real del grafo (convivencia → document-generation
    // → document-management ↔ approval-workflow → convivencia): mismo patrón
    // que PhvaAdvancedModule, que ya importa DocumentGenerationModule así.
    forwardRef(() => DocumentGenerationModule),
    // F7B-11: módulos distribuidos compartidos (OTP + rate-limit).
    OtpChallengeModule,
    OtpRateLimitModule,
    MongooseModule.forFeature([
      { name: ConvivenciaPeriod.name, schema: ConvivenciaPeriodSchema },
      // F7B-6 (1.1.8): secuencia persistente y tenant-safe de números de caso.
      { name: ConvivenciaCaseSequence.name, schema: ConvivenciaCaseSequenceSchema },
      { name: User.name, schema: UserSchema },
      { name: CompanyUser.name, schema: CompanyUserSchema },
      { name: Employee.name, schema: EmployeeSchema },
      // Fase 5 (1.1.8): Company para resolver nombre/NIT/trabajadores del acta.
      { name: Company.name, schema: CompanySchema },
    ]),
  ],
  controllers: [ConvivenciaController],
  providers: [
    ConvivenciaService,
    RolesGuard,
    CompanyAccessGuard,
    // Fase 5 (1.1.8) — resolución de variables de los documentos 1.1.8.
    ConvivenciaVariableResolverService,
    // Fase 5 (1.1.8) — generación documental del Comité de Convivencia.
    ConvivenciaDocumentService,
    // Fase 5 (1.1.8) — generador documental post-aprobación. Se registra en el
    // ApprovalDocumentRegistryService bajo la clave real
    // CONVIVENCIA:'ConvivenciaPeriod' y el alias CONVIVENCIA:'CONVIVENCIA'
    // (ambas apuntan al mismo generador para no duplicar generación).
    ConvivenciaDocumentGenerator,
  ],
  exports: [ConvivenciaService, ConvivenciaDocumentService, ConvivenciaDocumentGenerator],
})
export class ConvivenciaModule {}
