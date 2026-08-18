import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { RequestWithUser } from '../auth/auth.types';
import { PriorityOverviewDto } from './dto/priority-overview.dto';
import { ImplementationPriorityService } from './implementation-priority.service';

@Controller('implementation-priority')
@UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
export class ImplementationPriorityController {
  constructor(private readonly priorityService: ImplementationPriorityService) {}

  /**
   * Devuelve las prioridades dinámicas del Centro de Implementación.
   *
   * AUDIT-13: Migrado de @Param('companyId') a request.companyId.
   */
  @Get('priorities')
  @Roles('owner', 'admin', 'manager')
  async getPriorities(@Req() request: RequestWithUser): Promise<PriorityOverviewDto> {
    const companyId = request.companyId?.toString() ?? '';
    return this.priorityService.getPriorities(companyId);
  }
}
