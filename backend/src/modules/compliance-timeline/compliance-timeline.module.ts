import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
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
      // Schema de User requerido por RolesGuard para validar permisos.
      { name: User.name, schema: UserSchema },
      { name: ComplianceTimeline.name, schema: ComplianceTimelineSchema },
    ]),
    // Fuente única de datos: el timeline reutiliza exclusivamente el ComplianceEngine.
    ComplianceEngineModule,
  ],
  controllers: [ComplianceTimelineController],
  providers: [ComplianceTimelineService, RolesGuard],
})
export class ComplianceTimelineModule {}
