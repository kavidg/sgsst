import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { Employee, EmployeeSchema } from '../employees/schemas/employee.schema';
// FASE 35B: Incident se inyecta SOLO para validar la referencia administrativa
// opcional (investigationRef). NO existe conversión automática Incident → caso
// (Gate 4): el caso estadístico se crea explícitamente vía service/RBAC.
import { Incident, IncidentSchema } from '../incidents/schemas/incident.schema';
import { OccupationalDiseaseStatisticalCaseController } from './occupational-disease-statistical-case.controller';
import { OccupationalDiseaseStatisticalCaseService } from './occupational-disease-statistical-case.service';
import {
  OccupationalDiseaseStatisticalCase,
  OccupationalDiseaseStatisticalCaseSchema,
} from './schemas/occupational-disease-statistical-case.schema';

/**
 * Módulo de casos estadísticos de enfermedad laboral (FASE 35B).
 *
 * Infraestructura base compartida para los futuros providers de prevalencia
 * (3.3.4, FASE 35C) e incidencia (3.3.5, FASE 35D):
 *
 *                 OccupationalDiseaseStatisticalCase
 *                              │
 *                     ┌────────┴────────┐
 *                     │                 │
 *              FUTURE 35C         FUTURE 35D
 *                     ▼                 ▼
 *              Prevalencia         Incidencia
 *                 3.3.4              3.3.5
 *
 * NO registra providers en el ComplianceEngine (los estándares 3.3.4/3.3.5
 * permanecen PLANNED, sin scoring en esta fase).
 */
@Module({
  imports: [
    AuthModule,
    UsersModule,
    MongooseModule.forFeature([
      {
        name: OccupationalDiseaseStatisticalCase.name,
        schema: OccupationalDiseaseStatisticalCaseSchema,
      },
      { name: Employee.name, schema: EmployeeSchema },
      { name: Incident.name, schema: IncidentSchema },
    ]),
  ],
  controllers: [OccupationalDiseaseStatisticalCaseController],
  providers: [OccupationalDiseaseStatisticalCaseService],
  exports: [OccupationalDiseaseStatisticalCaseService],
})
export class OccupationalDiseaseStatisticalCaseModule {}
