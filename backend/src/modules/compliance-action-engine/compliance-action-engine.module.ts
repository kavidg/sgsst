import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { CompanyUser, CompanyUserSchema } from '../companies/schemas/company-user.schema';
import { ComplianceEngineModule } from '../compliance-engine/compliance-engine.module';
import { RolesGuard } from '../questions/roles.guard';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ComplianceActionEngineController } from './controller/compliance-action-engine.controller';
import { ComplianceActionEngineService } from './compliance-action-engine.service';

@Module({
  imports: [
    AuthModule,
    ComplianceEngineModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: CompanyUser.name, schema: CompanyUserSchema },
    ]),
  ],
  controllers: [ComplianceActionEngineController],
  providers: [ComplianceActionEngineService, RolesGuard, CompanyAccessGuard],
  exports: [ComplianceActionEngineService],
})
export class ComplianceActionEngineModule {}
