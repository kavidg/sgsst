import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AnnualWorkPlanModule } from '../annual-work-plan/annual-work-plan.module';
import { RolesGuard } from '../questions/roles.guard';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { ProgramsController } from './programs.controller';
import { ProgramsService } from './services/programs.service';
import {
  SgstProgram,
  SgstProgramSchema,
} from './schemas/program.schema';
import {
  ProgramActivity,
  ProgramActivitySchema,
} from './schemas/program.schema';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    AnnualWorkPlanModule,
    MongooseModule.forFeature([
      { name: SgstProgram.name, schema: SgstProgramSchema },
      { name: ProgramActivity.name, schema: ProgramActivitySchema },
    ]),
  ],
  controllers: [ProgramsController],
  providers: [ProgramsService, RolesGuard, CompanyAccessGuard],
  exports: [ProgramsService],
})
export class ProgramsModule {}
