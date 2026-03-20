import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { CreateEvaluationAnswerDto } from './dto/create-evaluation-answer.dto';
import { UpdateEvaluationAnswerDto } from './dto/update-evaluation-answer.dto';
import { EvaluationAnswersService } from './evaluation-answers.service';

@Controller('evaluation-answers')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class EvaluationAnswersController {
  constructor(private readonly evaluationAnswersService: EvaluationAnswersService) {}

  @Post()
  @Roles('owner', 'admin')
  create(@Body() createEvaluationAnswerDto: CreateEvaluationAnswerDto) {
    return this.evaluationAnswersService.create(createEvaluationAnswerDto);
  }

  @Get()
  @Roles('owner', 'admin', 'manager')
  findAll() {
    return this.evaluationAnswersService.findAll();
  }

  @Get('evaluation/:evaluationId/score')
  @Roles('owner', 'admin', 'manager')
  calculateEvaluationScore(@Param('evaluationId') evaluationId: string) {
    return this.evaluationAnswersService.calculateEvaluationScore(evaluationId);
  }

  @Get('evaluation/:evaluationId')
  @Roles('owner', 'admin', 'manager')
  findByEvaluation(@Param('evaluationId') evaluationId: string) {
    return this.evaluationAnswersService.findByEvaluation(evaluationId);
  }

  @Get(':id')
  @Roles('owner', 'admin', 'manager')
  findOne(@Param('id') id: string) {
    return this.evaluationAnswersService.findOne(id);
  }

  @Patch(':id')
  @Roles('owner', 'admin')
  update(@Param('id') id: string, @Body() updateEvaluationAnswerDto: UpdateEvaluationAnswerDto) {
    return this.evaluationAnswersService.update(id, updateEvaluationAnswerDto);
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  remove(@Param('id') id: string) {
    return this.evaluationAnswersService.remove(id);
  }
}
