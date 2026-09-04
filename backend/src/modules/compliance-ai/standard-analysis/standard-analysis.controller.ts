import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { RequestWithUser } from '../../auth/auth.types';
import { CompanyAccessGuard } from '../../auth/company-access.guard';
import { FirebaseAuthGuard } from '../../auth/firebase-auth.guard';
import { Roles } from '../../questions/roles.decorator';
import { RolesGuard } from '../../questions/roles.guard';
import { StandardAnalysisResponse } from '../dto/standard-analysis.dto';
import { StandardAnalysisService } from './standard-analysis.service';

/**
 * Controller del análisis inteligente de estándares PHVA.
 *
 * Sigue exactamente los mismos patrones de seguridad que el AI Orchestrator:
 * - FirebaseAuthGuard (autenticación Firebase)
 * - RolesGuard (control de acceso por rol)
 * - CompanyAccessGuard (tenant isolation: request.companyId)
 *
 * NO acepta companyId del cliente: siempre proviene del contexto autenticado.
 */
@Controller('compliance-ai')
@UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
export class StandardAnalysisController {
  constructor(
    private readonly standardAnalysisService: StandardAnalysisService,
  ) {}

  /**
   * Obtiene el análisis inteligente de un estándar PHVA específico.
   *
   * GET /compliance-ai/standard-analysis/:standardCode
   *
   * El companyId se obtiene exclusivamente de request.companyId
   * (validado por CompanyAccessGuard).
   */
  @Get('standard-analysis/:standardCode')
  @Roles('owner', 'admin', 'manager')
  async getStandardAnalysis(
    @Param('standardCode') standardCode: string,
    @Req() request: RequestWithUser,
  ): Promise<StandardAnalysisResponse> {
    const companyId = request.companyId?.toString();
    if (!companyId) {
      return {
        standardCode,
        standardTitle: standardCode,
        module: '',
        compliancePercentage: 0,
        complianceStatus: 'NO_DATA',
        level: 'NO_DATA',
        analysis: {
          summary: 'No se pudo identificar la empresa.',
          keyIssues: [],
          quickWins: [],
          nextSteps: [],
        },
        metrics: {},
        evaluatedAt: new Date().toISOString(),
        dataAvailable: false,
      };
    }

    return this.standardAnalysisService.analyze(standardCode, companyId);
  }
}
