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
// FASE 35E-2: denominador explícito de 3.3.6 — días de trabajo programados por período.
import {
  CompanyPeriodScheduledWorkData,
  CompanyPeriodScheduledWorkDataSchema,
} from './schemas/company-period-scheduled-work-data.schema';
import { CompanyPeriodScheduledWorkDataService } from './company-period-scheduled-work-data.service';
import { CompanyPeriodScheduledWorkDataController } from './company-period-scheduled-work-data.controller';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Incident.name, schema: IncidentSchema },
      { name: CompanyPeriodWorkData.name, schema: CompanyPeriodWorkDataSchema },
      // FASE 35E-2: CompanyPeriodScheduledWorkData (3.3.6) — denominador
      // "días de trabajo programados"; colección propia, semántica separada de
      // hoursWorked (frontera anti-double-scoring y anti-mixing de categorías).
      {
        name: CompanyPeriodScheduledWorkData.name,
        schema: CompanyPeriodScheduledWorkDataSchema,
      },
    ]),
    UsersModule,
    CommunicationModule,
  ],
  controllers: [IncidentsController, CompanyPeriodScheduledWorkDataController],
  providers: [
    IncidentsService,
    CompanyPeriodWorkDataService,
    CompanyPeriodScheduledWorkDataService,
    RolesGuard,
  ],
  exports: [IncidentsService, CompanyPeriodWorkDataService, CompanyPeriodScheduledWorkDataService],
})
export class IncidentsModule {}
