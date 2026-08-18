import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { RequestWithUser } from '../auth/auth.types';
import { ComplianceExecutionService } from './compliance-execution.service';
import { ExecuteAutomationDto } from './dto/execute-automation.dto';
import { ExecutionResultDto } from './dto/execution-result.dto';

@Controller('compliance-execution')
@UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
export class ComplianceExecutionController {
  constructor(private readonly complianceExecutionService: ComplianceExecutionService) {}

  /**
   * Ejecuta una automatización READY para una empresa.
   *
   * AUDIT-13: Migrado de @Param('companyId') a request.companyId.
   */
  @Post('execute')
  @Roles('owner', 'admin', 'manager')
  async execute(
    @Req() request: RequestWithUser,
    @Body() body: ExecuteAutomationDto,
  ): Promise<ExecutionResultDto> {
    const companyId = request.companyId?.toString() ?? '';
    return this.complianceExecutionService.execute({ ...body, companyId });
  }
}
