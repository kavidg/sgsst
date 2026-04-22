import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { AlertsModule } from '../alerts/alerts.module';
import { RolesGuard } from '../questions/roles.guard';
import { UsersModule } from '../users/users.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { InspectionsController } from './inspections.controller';
import { InspectionsService } from './inspections.service';
import { InspectionActivity, InspectionActivitySchema } from './schemas/inspection-activity.schema';

@Module({
  imports: [
    AuthModule,
    AlertsModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: InspectionActivity.name, schema: InspectionActivitySchema },
    ]),
    UsersModule,
  ],
  controllers: [InspectionsController],
  providers: [InspectionsService, RolesGuard],
})
export class InspectionsModule {}
