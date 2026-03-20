import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../modules/auth/firebase-auth.guard';
import { Roles } from '../modules/questions/roles.decorator';
import { RolesGuard } from '../modules/questions/roles.guard';
import { CreateEvaluationDto } from './dto/create-evaluation.dto';
import { UpdateEvaluationDto } from './dto/update-evaluation.dto';
import { EvaluationsService } from './evaluations.service';

@Controller('evaluations')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class EvaluationsController {
  constructor(private readonly evaluationsService: EvaluationsService) {}

  @Post()
  @Roles('owner', 'admin')
  create(@Body() createEvaluationDto: CreateEvaluationDto) {
    return this.evaluationsService.create(createEvaluationDto);
  }

  @Get('company/:companyId')
  @Roles('owner', 'admin', 'manager')
  findAllByCompany(@Param('companyId') companyId: string) {
    return this.evaluationsService.findAllByCompany(companyId);
  }

  @Patch(':id')
  @Roles('owner', 'admin')
  update(@Param('id') id: string, @Body() updateEvaluationDto: UpdateEvaluationDto) {
    return this.evaluationsService.update(id, updateEvaluationDto);
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  remove(@Param('id') id: string) {
    return this.evaluationsService.remove(id);
  }

  @Get('company/:companyId/compliance')
  @Roles('owner', 'admin', 'manager')
  getCompliance(@Param('companyId') companyId: string) {
    return this.evaluationsService.getCompliancePercentage(companyId);
  }
}
