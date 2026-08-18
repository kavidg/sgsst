import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { CompanyUser, CompanyUserSchema } from '../companies/schemas/company-user.schema';
import { ComplianceActionEngineModule } from '../compliance-action-engine/compliance-action-engine.module';
import { ComplianceEngineModule } from '../compliance-engine/compliance-engine.module';
import { RolesGuard } from '../questions/roles.guard';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ComplianceAutomationController } from './compliance-automation.controller';
import { ComplianceAutomationService } from './compliance-automation.service';

@Module({
  imports: [
    AuthModule,
    ComplianceEngineModule,
    ComplianceActionEngineModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: CompanyUser.name, schema: CompanyUserSchema },
    ]),
  ],
  controllers: [ComplianceAutomationController],
  providers: [ComplianceAutomationService, RolesGuard, CompanyAccessGuard],
  exports: [ComplianceAutomationService],
})
export class ComplianceAutomationModule {}
