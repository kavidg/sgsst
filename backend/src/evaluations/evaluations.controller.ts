import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../modules/auth/firebase-auth.guard';
import { CreateEvaluationDto } from './dto/create-evaluation.dto';
import { UpdateEvaluationDto } from './dto/update-evaluation.dto';
import { EvaluationsService } from './evaluations.service';

@Controller('evaluations')
@UseGuards(FirebaseAuthGuard)
export class EvaluationsController {
  constructor(private readonly evaluationsService: EvaluationsService) {}

  @Post()
  create(@Body() createEvaluationDto: CreateEvaluationDto) {
    return this.evaluationsService.create(createEvaluationDto);
  }

  @Get('company/:companyId')
  findAllByCompany(@Param('companyId') companyId: string) {
    return this.evaluationsService.findAllByCompany(companyId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateEvaluationDto: UpdateEvaluationDto) {
    return this.evaluationsService.update(id, updateEvaluationDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.evaluationsService.remove(id);
  }

  @Get('company/:companyId/compliance')
  getCompliance(@Param('companyId') companyId: string) {
    return this.evaluationsService.getCompliancePercentage(companyId);
  }
}
