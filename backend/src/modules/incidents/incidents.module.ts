import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { CommunicationModule } from '../communication/communication.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { RolesGuard } from '../questions/roles.guard';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';
import { Incident, IncidentSchema } from './schemas/incident.schema';
import { CompanyPeriodWorkData, CompanyPeriodWorkDataSchema } from './schemas/company-period-work-data.schema';
import { CompanyPeriodWorkDataService } from './company-period-work-data.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Incident.name, schema: IncidentSchema },
      { name: CompanyPeriodWorkData.name, schema: CompanyPeriodWorkDataSchema },
    ]),
    UsersModule,
    CommunicationModule,
  ],
  controllers: [IncidentsController],
  providers: [IncidentsService, CompanyPeriodWorkDataService, RolesGuard],
  exports: [IncidentsService, CompanyPeriodWorkDataService],
})
export class IncidentsModule {}
