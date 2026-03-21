import { Controller, ForbiddenException, Get, Req, UseGuards } from '@nestjs/common';
import { RequestWithUser } from '../auth/auth.types';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { UsersService } from '../users/users.service';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly usersService: UsersService,
  ) {}

  @Get()
  @Roles('owner', 'admin', 'manager')
  async getDashboard(@Req() request: RequestWithUser) {
    const firebaseUid = request.user?.uid;

    if (!firebaseUid) {
      throw new ForbiddenException('Missing authenticated user');
    }

    const user = await this.usersService.findByFirebaseUid(firebaseUid);

    if (!user) {
      throw new ForbiddenException('Authenticated user is not registered');
    }

    return this.dashboardService.getCompanyStats(user.companyId);
  }
}
