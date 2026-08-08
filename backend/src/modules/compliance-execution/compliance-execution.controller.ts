import { BadRequestException, Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { Types } from 'mongoose';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { ComplianceExecutionService } from './compliance-execution.service';
import { ExecuteAutomationDto } from './dto/execute-automation.dto';
import { ExecutionResultDto } from './dto/execution-result.dto';

@Controller('compliance-execution')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class ComplianceExecutionController {
  constructor(private readonly complianceExecutionService: ComplianceExecutionService) {}

  /**
   * Ejecuta una automatización READY para una empresa.
   *
   * Flujo: validar → construir ExecutionPlan → ejecutar paso a paso
   * (patrón Strategy) → guardar historial → retornar ExecutionResult.
   */
  @Post('company/:companyId/execute')
  @Roles('owner', 'admin', 'manager')
  async execute(
    @Param('companyId') companyId: string,
    @Body() body: ExecuteAutomationDto,
  ): Promise<ExecutionResultDto> {
    if (!Types.ObjectId.isValid(companyId)) {
      throw new BadRequestException('Invalid companyId');
    }

    // El companyId del path es la fuente autoritativa; se fusiona con el body.
    return this.complianceExecutionService.execute({ ...body, companyId });
  }
}
