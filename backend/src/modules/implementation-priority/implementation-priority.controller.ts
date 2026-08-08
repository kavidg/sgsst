import { BadRequestException, Controller, Get, Param, UseGuards } from '@nestjs/common';
import { Types } from 'mongoose';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { PriorityOverviewDto } from './dto/priority-overview.dto';
import { ImplementationPriorityService } from './implementation-priority.service';

@Controller('implementation-priority')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class ImplementationPriorityController {
  constructor(private readonly priorityService: ImplementationPriorityService) {}

  /**
   * Devuelve las prioridades dinámicas del Centro de Implementación.
   *
   * FASE 1A: responde con un DTO vacío correctamente tipado. FASE 2/3
   * calcularán las prioridades reales a partir del overview validado.
   */
  @Get('company/:companyId/priorities')
  @Roles('owner', 'admin', 'manager')
  async getPriorities(@Param('companyId') companyId: string): Promise<PriorityOverviewDto> {
    if (!Types.ObjectId.isValid(companyId)) {
      throw new BadRequestException('Invalid companyId');
    }

    return this.priorityService.getPriorities(companyId);
  }
}
