import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Employee, EmployeeSchema } from '../employees/schemas/employee.schema';
import { RolesGuard } from '../questions/roles.guard';
import { RisksController } from './risks.controller';
import { RisksService } from './risks.service';
import { Risk, RiskSchema } from './schemas/risk.schema';
import { RiskMethodology, RiskMethodologySchema } from './schemas/risk-methodology.schema';
import { RiskMethodologyController } from './risk-methodology.controller';
import { RiskMethodologyService } from './risk-methodology.service';
import { WorkerParticipation, WorkerParticipationSchema } from './schemas/worker-participation.schema';
import { WorkerParticipationController } from './worker-participation.controller';
import { WorkerParticipationService } from './worker-participation.service';
import { HazardousSubstance, HazardousSubstanceSchema } from './schemas/hazardous-substance.schema';
import { HazardousSubstanceController } from './hazardous-substance.controller';
import { HazardousSubstanceService } from './hazardous-substance.service';
import { EnvironmentalMeasurement, EnvironmentalMeasurementSchema } from './schemas/environmental-measurement.schema';
import { EnvironmentalMeasurementController } from './environmental-measurement.controller';
import { EnvironmentalMeasurementService } from './environmental-measurement.service';
import { SstInduction, SstInductionSchema } from './schemas/sst-induction.schema';
import { SstInductionController } from './sst-induction.controller';
import { SstInductionService } from './sst-induction.service';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Risk.name, schema: RiskSchema },
      { name: RiskMethodology.name, schema: RiskMethodologySchema },
      { name: WorkerParticipation.name, schema: WorkerParticipationSchema },
      { name: HazardousSubstance.name, schema: HazardousSubstanceSchema },
      { name: EnvironmentalMeasurement.name, schema: EnvironmentalMeasurementSchema },
      { name: SstInduction.name, schema: SstInductionSchema },
      { name: Employee.name, schema: EmployeeSchema },
    ]),
    UsersModule,
  ],
  controllers: [RisksController, RiskMethodologyController, WorkerParticipationController, HazardousSubstanceController, EnvironmentalMeasurementController, SstInductionController],
  providers: [RisksService, RiskMethodologyService, WorkerParticipationService, HazardousSubstanceService, EnvironmentalMeasurementService, SstInductionService, RolesGuard],
  exports: [RisksService, RiskMethodologyService, WorkerParticipationService, HazardousSubstanceService, EnvironmentalMeasurementService, SstInductionService],
})
export class RisksModule {}
