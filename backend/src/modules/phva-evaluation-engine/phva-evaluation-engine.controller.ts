import { BadRequestException, Controller, ForbiddenException, Get, Param, Req, UseGuards } from '@nestjs/common';
import { Types } from 'mongoose';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { RequestWithUser } from '../auth/auth.types';
import {
  AutoEvaluationResult,
} from './interfaces/auto-evaluation-result';
import { PhvaEvaluationEngineService } from './phva-evaluation-engine.service';

// ============================================================
// PhvaEvaluationEngine — Controller (FASE 1)
// ============================================================
//
// Endpoint de consulta del veredicto automático. Protegido con los mismos
// guards y roles que el resto de la plataforma. El companyId del path se
// valida contra el tenant autenticado (CompanyAccessGuard) y como ObjectId;
// una empresa distinta a la del usuario autenticado es rechazada por el guard.
//
// Esta fase es solo de consulta: el endpoint NO escribe en la colección
// Evaluation, NO genera alertas y NO modifica el estado manual del PHVA.

@Controller('phva-evaluation-engine')
@UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
export class PhvaEvaluationEngineController {
  constructor(private readonly engineService: PhvaEvaluationEngineService) {}

  /**
   * Evalúa todos los estándares con regla activa para la empresa del tenant
   * autenticado.
   */
  @Get('company/:companyId/evaluate')
  @Roles('owner', 'admin', 'manager')
  async evaluateCompany(
    @Req() request: RequestWithUser,
    @Param('companyId') companyId: string,
  ): Promise<AutoEvaluationResult[]> {
    this.assertValidObjectId(companyId);
    this.assertTenantMatch(request, companyId);
    return this.engineService.evaluateCompany(companyId);
  }

  /**
   * Evalúa un estándar individual para la empresa del tenant autenticado.
   * Los estándares sin regla implementada responden PENDIENTE_ANALISIS con
   * missingInformation = ['Motor de evaluación no implementado para este estándar'].
   */
  @Get('company/:companyId/evaluate/:code')
  @Roles('owner', 'admin', 'manager')
  async evaluateStandard(
    @Req() request: RequestWithUser,
    @Param('companyId') companyId: string,
    @Param('code') code: string,
  ): Promise<AutoEvaluationResult> {
    this.assertValidObjectId(companyId);
    this.assertTenantMatch(request, companyId);
    return this.engineService.evaluateStandard(companyId, code);
  }

  private assertValidObjectId(companyId: string): void {
    if (!Types.ObjectId.isValid(companyId)) {
      throw new BadRequestException(`Invalid companyId: ${companyId}`);
    }
  }

  private assertTenantMatch(request: RequestWithUser, companyId: string): void {
    const authenticatedCompanyId = request.companyId?.toString() ?? '';
    if (authenticatedCompanyId !== companyId) {
      throw new ForbiddenException('You do not belong to the requested company');
    }
  }
}
