import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { ComplianceActionEngineModule } from '../compliance-action-engine/compliance-action-engine.module';
import { ComplianceEngineModule } from '../compliance-engine/compliance-engine.module';
import { RolesGuard } from '../questions/roles.guard';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ComplianceAutomationController } from './compliance-automation.controller';
import { ComplianceAutomationService } from './compliance-automation.service';

@Module({
  imports: [
    AuthModule,
    // ComplianceEngineModule exporta ComplianceEngineService (overview).
    ComplianceEngineModule,
    // ComplianceActionEngineModule exporta ComplianceActionEngineService (recomendaciones).
    ComplianceActionEngineModule,
    // Schema de User requerido por RolesGuard para validar permisos.
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  controllers: [ComplianceAutomationController],
  providers: [ComplianceAutomationService, RolesGuard],
  exports: [ComplianceAutomationService],
})
export class ComplianceAutomationModule {}
