import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../questions/roles.guard';
import { UsersModule } from '../users/users.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { WorkplaceSanitaryConditionsController } from './workplace-sanitary-conditions.controller';
import { WorkplaceSanitaryConditionsService } from './workplace-sanitary-conditions.service';
import {
  WorkplaceSanitaryCondition,
  WorkplaceSanitaryConditionSchema,
} from './schemas/workplace-sanitary-condition.schema';

/**
 * Módulo de condiciones sanitarias del lugar de trabajo
 * (3.1.8 — FASE 34B). Patrón del módulo 3.1.6 (work-restriction).
 *
 * FRONTERA NORMATIVA: la evidencia de 3.1.8 proviene EXCLUSIVAMENTE de
 * WorkplaceSanitaryCondition. Este módulo NO reutiliza EnvironmentalMeasurement,
 * HazardousSubstance, InspectionActivity, HealthPromotionActivity,
 * WorkRestriction, JobProfile, Risk ni DocumentMaster como evidencia primaria.
 */
@Module({
  imports: [
    AuthModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      {
        name: WorkplaceSanitaryCondition.name,
        schema: WorkplaceSanitaryConditionSchema,
      },
    ]),
  ],
  controllers: [WorkplaceSanitaryConditionsController],
  providers: [WorkplaceSanitaryConditionsService, RolesGuard],
  exports: [WorkplaceSanitaryConditionsService],
})
export class WorkplaceSanitaryConditionsModule {}
