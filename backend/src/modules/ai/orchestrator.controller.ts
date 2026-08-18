import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { RequestWithUser } from '../auth/auth.types';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { ContextService } from './context.service';
import { AiQueryDto } from './dto/ai-query.dto';
import { AiResponseDto } from './dto/ai-response.dto';
import { OrchestratorService } from './orchestrator.service';

// AUDIT-1 (hardening tenant isolation del AI Orchestrator): se agrega
// CompanyAccessGuard (mismo patrón que initial-evaluation/convivencia). El
// guard valida que x-company-id corresponda a una empresa del usuario
// autenticado y fija request.companyId a partir de la membresía real. Sin
// este guard, el header x-company-id (client-controlled) era la autoridad de
// tenant y permitía consultar datos de otras empresas (IDOR cross-tenant).
@Controller('ai/orchestrator')
@UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
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
