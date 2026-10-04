import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../questions/roles.guard';
import { UsersModule } from '../users/users.module';
import { EppController } from './epp.controller';
import { EppService } from './epp.service';
import { EppDelivery, EppDeliverySchema } from './schemas/epp-delivery.schema';
import { EppApplicability, EppApplicabilitySchema } from './schemas/epp-applicability.schema';
import { Employee, EmployeeSchema } from '../employees/schemas/employee.schema';
import { SstEpp, SstEppSchema } from '../phva-advanced/schemas/phva-advanced-epp.schema';
import { JobProfile, JobProfileSchema } from '../job-profile/schemas/job-profile.schema';

/**
 * Módulo de entregas de EPP (4.2.6 — Alternativa B).
 *
 * Arquitectura de la frontera:
 *  - SstEpp   → catálogo/matriz de necesidades EPP (phva-advanced; intacto).
 *  - Employee → trabajador real (módulo employees; solo lectura aquí).
 *  - EppDelivery → evento operativo de entrega/reposición (esta entidad).
 *
 * El scoring de 4.2.6 (EppComplianceProvider) NO se modifica en esta etapa.
 */
@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: EppDelivery.name, schema: EppDeliverySchema },
      { name: EppApplicability.name, schema: EppApplicabilitySchema },
      { name: Employee.name, schema: EmployeeSchema },
      { name: SstEpp.name, schema: SstEppSchema },
      // ETAPA matriz 4.2.6: JobProfile requerido por EppApplicability (solo
      // lectura de perfiles de cargo; el schema NO se modifica).
      { name: JobProfile.name, schema: JobProfileSchema },
    ]),
    UsersModule,
  ],
  controllers: [EppController],
  providers: [EppService, RolesGuard],
  exports: [MongooseModule],
})
export class EppModule {}
