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
// E1 (7.1.3): historial append-only de la gestión avanzada de casos
// accidentales (investigación → acciones → seguimiento → cierre).
import {
  IncidentHistory,
  IncidentHistorySchema,
} from './schemas/incident-history.schema';
// E1 (7.1.3): DocumentMaster para validación tenant-safe de la evidencia
// ({_id, companyId}); el módulo NO implementa upload/storage propio.
import {
  DocumentMaster,
  DocumentMasterSchema,
} from '../document-management/schemas/document-master.schema';
import { CompanyPeriodWorkData, CompanyPeriodWorkDataSchema } from './schemas/company-period-work-data.schema';
import { CompanyPeriodWorkDataService } from './company-period-work-data.service';
// E3-B (6.1.1): el guard de períodos CLOSED del service consulta IndicatorPeriod.
// Se registra el schema directamente (sin importar IndicatorsModule) para no
// introducir dependencia circular entre módulos.
import { IndicatorPeriod, IndicatorPeriodSchema } from '../indicators/schemas/indicator-period.schema';
// E3-B (6.1.1): controller de administración de work-data (vive en indicators/
// porque el dato alimenta ind-01/02/03; el service permanece aquí).
import { CompanyPeriodWorkDataController } from '../indicators/company-period-work-data.controller';
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
      { name: IncidentHistory.name, schema: IncidentHistorySchema }, // E1 (7.1.3)
      // E1 (7.1.3): referencia declarativa de evidencia (solo {_id, companyId}).
      { name: DocumentMaster.name, schema: DocumentMasterSchema },
      { name: CompanyPeriodWorkData.name, schema: CompanyPeriodWorkDataSchema },
      { name: IndicatorPeriod.name, schema: IndicatorPeriodSchema }, // E3-B (6.1.1)
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
  controllers: [IncidentsController, CompanyPeriodScheduledWorkDataController, CompanyPeriodWorkDataController],
  providers: [
    IncidentsService,
    CompanyPeriodWorkDataService,
    CompanyPeriodScheduledWorkDataService,
    RolesGuard,
  ],
  exports: [IncidentsService, CompanyPeriodWorkDataService, CompanyPeriodScheduledWorkDataService],
})
export class IncidentsModule {}
