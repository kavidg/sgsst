import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../modules/auth/firebase-auth.guard';
import { CreateEvaluationDto } from './dto/create-evaluation.dto';
import { EvaluationsService } from './evaluations.service';

@Controller('evaluations')
@UseGuards(FirebaseAuthGuard)
export class EvaluationsController {
  constructor(private readonly evaluationsService: EvaluationsService) {}

  @Post()
  saveAnswer(@Body() createEvaluationDto: CreateEvaluationDto) {
    return this.evaluationsService.saveAnswer(createEvaluationDto);
  }

  @Get()
  findAllByCompany(@Query('companyId') companyId?: string) {
    if (!companyId) {
      throw new BadRequestException('companyId is required');
    }

    return this.evaluationsService.findAllByCompany(companyId);
  }

  @Get(':code')
  findOneByCode(@Param('code') code: string, @Query('companyId') companyId?: string) {
    if (!companyId) {
      throw new BadRequestException('companyId is required');
    }

    return this.evaluationsService.findOneByCode(companyId, code);
  }
}
