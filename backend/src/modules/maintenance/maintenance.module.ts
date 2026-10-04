import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../questions/roles.guard';
import { UsersModule } from '../users/users.module';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceService } from './maintenance.service';
import { Maintenance, MaintenanceSchema } from './schemas/maintenance.schema';

/**
 * Módulo Maintenance (estándar PHVA 4.2.5 — V1).
 *
 * Entidad propia (frontera anti-double-scoring con 4.2.4): NO reutiliza
 * InspectionActivity. La evaluación automática (ComplianceEngine) consume
 * esta colección vía MaintenanceProvider, registrado en ComplianceEngineModule.
 */
@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: Maintenance.name, schema: MaintenanceSchema },
    ]),
    UsersModule,
  ],
  controllers: [MaintenanceController],
  providers: [MaintenanceService, RolesGuard],
  exports: [MongooseModule],
})
export class MaintenanceModule {}
