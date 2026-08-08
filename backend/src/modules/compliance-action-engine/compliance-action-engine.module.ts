import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { ComplianceEngineModule } from '../compliance-engine/compliance-engine.module';
import { RolesGuard } from '../questions/roles.guard';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ComplianceActionEngineController } from './controller/compliance-action-engine.controller';
import { ComplianceActionEngineService } from './compliance-action-engine.service';

@Module({
  imports: [
    AuthModule,
    // ComplianceEngineModule exporta ComplianceEngineService: única fuente
    // del ComplianceOverviewDto que alimenta al Action Generator.
    ComplianceEngineModule,
    // Schema de User requerido por RolesGuard para validar permisos.
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  controllers: [ComplianceActionEngineController],
  providers: [ComplianceActionEngineService, RolesGuard],
  exports: [ComplianceActionEngineService],
})
export class ComplianceActionEngineModule {}
