import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../questions/roles.guard';
import { UsersModule } from '../users/users.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { WasteManagementController } from './waste-management.controller';
import { WasteManagementService } from './waste-management.service';
import {
  WasteManagementRecord,
  WasteManagementRecordSchema,
} from './schemas/waste-management-record.schema';
import {
  WasteTypeDeclaration,
  WasteTypeDeclarationSchema,
} from './schemas/waste-type-declaration.schema';

/**
 * Módulo de gestión de residuos (3.1.9 — FASE 34C).
 * Patrón del módulo 3.1.8 (workplace-sanitary-conditions).
 *
 * FRONTERA NORMATIVA: la evidencia de 3.1.9 proviene EXCLUSIVAMENTE de
 * WasteManagementRecord. Este módulo NO reutiliza HazardousSubstance,
 * EnvironmentalMeasurement, InspectionActivity, WorkplaceSanitaryCondition ni
 * DocumentMaster como evidencia primaria (frontera anti-double-scoring).
 *
 * RELACIÓN CON 3.1.8: pregunta normativa DISTINTA —
 *   3.1.8: ¿existe y está adecuado el manejo básico de basuras/servicios/agua?
 *   3.1.9: ¿los residuos generados son gestionados y eliminados adecuadamente?
 * No comparten colección ni provider.
 */
@Module({
  imports: [
    AuthModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      {
        name: WasteManagementRecord.name,
        schema: WasteManagementRecordSchema,
      },
      {
        name: WasteTypeDeclaration.name,
        schema: WasteTypeDeclarationSchema,
      },
    ]),
  ],
  controllers: [WasteManagementController],
  providers: [WasteManagementService, RolesGuard],
  exports: [WasteManagementService],
})
export class WasteManagementModule {}
