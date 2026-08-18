import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { CompanyUser, CompanyUserSchema } from '../companies/schemas/company-user.schema';
import { ComplianceEngineModule } from '../compliance-engine/compliance-engine.module';
import { RolesGuard } from '../questions/roles.guard';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ComplianceTimelineController } from './compliance-timeline.controller';
import { ComplianceTimelineService } from './compliance-timeline.service';
import {
  ComplianceTimeline,
  ComplianceTimelineSchema,
} from './schemas/compliance-timeline.schema';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: CompanyUser.name, schema: CompanyUserSchema },
      { name: ComplianceTimeline.name, schema: ComplianceTimelineSchema },
    ]),
    ComplianceEngineModule,
  ],
  controllers: [ComplianceTimelineController],
  providers: [ComplianceTimelineService, RolesGuard, CompanyAccessGuard],
})
export class ComplianceTimelineModule {}
