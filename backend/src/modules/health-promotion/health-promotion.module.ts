import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Employee, EmployeeSchema } from '../employees/schemas/employee.schema';
import { Risk, RiskSchema } from '../risks/schemas/risk.schema';
import { RolesGuard } from '../questions/roles.guard';
import { HealthPromotionController } from './health-promotion.controller';
import { HealthPromotionService } from './health-promotion.service';
import {
  HealthPromotionActivity,
  HealthPromotionActivitySchema,
} from './schemas/health-promotion-activity.schema';
// FASE 32: provider 3.1.7 — Estilos de vida y entornos saludables.
import { LifestyleHealthyEnvironmentProvider } from '../compliance-engine/providers/lifestyle-healthy-environment.provider';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Employee.name, schema: EmployeeSchema },
      { name: Risk.name, schema: RiskSchema },
      { name: HealthPromotionActivity.name, schema: HealthPromotionActivitySchema },
    ]),
    UsersModule,
  ],
  controllers: [HealthPromotionController],
  providers: [HealthPromotionService, RolesGuard, LifestyleHealthyEnvironmentProvider],
  exports: [HealthPromotionService],
})
export class HealthPromotionModule {}
