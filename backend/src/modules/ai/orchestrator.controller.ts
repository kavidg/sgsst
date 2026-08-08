import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { RequestWithUser } from '../auth/auth.types';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { ContextService } from './context.service';
import { AiQueryDto } from './dto/ai-query.dto';
import { AiResponseDto } from './dto/ai-response.dto';
import { OrchestratorService } from './orchestrator.service';

@Controller('ai/orchestrator')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class OrchestratorController {
  constructor(
    private readonly orchestratorService: OrchestratorService,
    private readonly contextService: ContextService,
  ) {}

  /**
   * Recibe una pregunta y retorna una respuesta estructurada del AI Orchestrator.
   */
  @Post('query')
  @Roles('owner', 'admin', 'manager', 'member')
  async query(@Body() dto: AiQueryDto, @Req() request: RequestWithUser): Promise<AiResponseDto> {
    const context = this.contextService.buildContext(request, dto.question);
    return this.orchestratorService.query(dto.question, context);
  }
}
