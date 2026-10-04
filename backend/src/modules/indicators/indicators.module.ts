import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { RolesGuard } from '../questions/roles.guard';
import { IndicatorsController } from './indicators.controller';
import { IndicatorsService } from './indicators.service';
import { FormulaRegistryService } from './formula/formula-registry.service';
import { DataSourceResolverRegistry } from './formula/data-source-resolver-registry';
import {
  IndicatorDefinition,
  IndicatorDefinitionSchema,
} from './schemas/indicator-definition.schema';
import {
  IndicatorMeasurement,
  IndicatorMeasurementSchema,
} from './schemas/indicator-measurement.schema';
import {
  IndicatorPeriod,
  IndicatorPeriodSchema,
} from './schemas/indicator-period.schema';

// ─── Schemas from existing modules (for DataSourceResolverRegistry) ────────
import { Incident, IncidentSchema } from '../incidents/schemas/incident.schema';
import { Training, TrainingSchema } from '../trainings/schemas/training.schema';
import { InspectionActivity, InspectionActivitySchema } from '../inspections/schemas/inspection-activity.schema';
import { Risk, RiskSchema } from '../risks/schemas/risk.schema';
import { Document, DocumentSchema } from '../documents/schemas/document.schema';
import { CompanyPeriodWorkData, CompanyPeriodWorkDataSchema } from '../incidents/schemas/company-period-work-data.schema';
import { Absenteeism, AbsenteeismSchema } from '../absenteeism/schemas/absenteeism.schema';
// E3-B (6.1.1): administración del denominador oficial de horas trabajadas.
// IncidentsModule provee CompanyPeriodWorkDataService (con el guard de
// períodos CLOSED); el controller se expone bajo /indicators/work-data.
import { IncidentsModule } from '../incidents/incidents.module';
import { CompanyPeriodWorkDataController } from './company-period-work-data.controller';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      // Users
      { name: User.name, schema: UserSchema },
      // Indicators domain
      { name: IndicatorDefinition.name, schema: IndicatorDefinitionSchema },
      { name: IndicatorMeasurement.name, schema: IndicatorMeasurementSchema },
      { name: IndicatorPeriod.name, schema: IndicatorPeriodSchema },
      // Data source models (for DataSourceResolverRegistry)
      { name: Incident.name, schema: IncidentSchema },
      { name: Training.name, schema: TrainingSchema },
      { name: InspectionActivity.name, schema: InspectionActivitySchema },
      { name: Risk.name, schema: RiskSchema },
      { name: Document.name, schema: DocumentSchema },
      { name: CompanyPeriodWorkData.name, schema: CompanyPeriodWorkDataSchema },
      { name: Absenteeism.name, schema: AbsenteeismSchema },
    ]),
    UsersModule,
    IncidentsModule, // E3-B (6.1.1): provee CompanyPeriodWorkDataService
  ],
  controllers: [IndicatorsController, CompanyPeriodWorkDataController],
  providers: [
    DataSourceResolverRegistry,
    FormulaRegistryService,
    IndicatorsService,
    RolesGuard,
  ],
  exports: [IndicatorsService, FormulaRegistryService],
})
export class IndicatorsModule {}
