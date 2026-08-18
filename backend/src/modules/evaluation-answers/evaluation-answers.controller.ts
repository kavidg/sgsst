import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Types } from 'mongoose';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { RequestWithUser } from '../auth/auth.types';
import { CreateEvaluationAnswerDto } from './dto/create-evaluation-answer.dto';
import { UpdateEvaluationAnswerDto } from './dto/update-evaluation-answer.dto';
import { EvaluationAnswersService } from './evaluation-answers.service';

@Controller('evaluation-answers')
@UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
export class EvaluationAnswersController {
  constructor(private readonly evaluationAnswersService: EvaluationAnswersService) {}

  private getCompanyId(request: RequestWithUser): Types.ObjectId {
    const companyId = request.companyId;
    if (!companyId) {
      throw new ForbiddenException('Missing company context');
    }
    return companyId;
  }

  @Post()
  @Roles('owner', 'admin')
  create(@Req() request: RequestWithUser, @Body() createEvaluationAnswerDto: CreateEvaluationAnswerDto) {
    return this.evaluationAnswersService.create(this.getCompanyId(request), createEvaluationAnswerDto);
  }

  @Get()
  @Roles('owner', 'admin', 'manager')
  findAll(@Req() request: RequestWithUser) {
    return this.evaluationAnswersService.findAll(this.getCompanyId(request));
  }

  @Get('evaluation/:evaluationId/score')
  @Roles('owner', 'admin', 'manager')
  calculateEvaluationScore(@Req() request: RequestWithUser, @Param('evaluationId') evaluationId: string) {
    return this.evaluationAnswersService.calculateEvaluationScore(this.getCompanyId(request), evaluationId);
  }

  @Get('evaluation/:evaluationId')
  @Roles('owner', 'admin', 'manager')
  findByEvaluation(@Req() request: RequestWithUser, @Param('evaluationId') evaluationId: string) {
    return this.evaluationAnswersService.findByEvaluation(this.getCompanyId(request), evaluationId);
  }

  @Get(':id')
  @Roles('owner', 'admin', 'manager')
  findOne(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.evaluationAnswersService.findOne(this.getCompanyId(request), id);
  }

  @Patch(':id')
  @Roles('owner', 'admin')
  update(@Req() request: RequestWithUser, @Param('id') id: string, @Body() updateEvaluationAnswerDto: UpdateEvaluationAnswerDto) {
    return this.evaluationAnswersService.update(this.getCompanyId(request), id, updateEvaluationAnswerDto);
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  remove(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.evaluationAnswersService.remove(this.getCompanyId(request), id);
  }
}
