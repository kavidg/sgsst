import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { RolesGuard } from '../questions/roles.guard';
import { EpidemiologicalSurveillanceController } from './epidemiological-surveillance.controller';
import { EpidemiologicalSurveillanceService } from './epidemiological-surveillance.service';
import {
  EpidemiologicalSurveillanceProgram,
  EpidemiologicalSurveillanceProgramSchema,
} from './schemas/epidemiological-surveillance.schema';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    MongooseModule.forFeature([
      {
        name: EpidemiologicalSurveillanceProgram.name,
        schema: EpidemiologicalSurveillanceProgramSchema,
      },
    ]),
  ],
  controllers: [EpidemiologicalSurveillanceController],
  providers: [EpidemiologicalSurveillanceService, RolesGuard],
  exports: [EpidemiologicalSurveillanceService],
})
export class EpidemiologicalSurveillanceModule {}
