import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Types } from 'mongoose';
import { RequestWithUser } from '../auth/auth.types';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { RegisterCandidateDto, SendOtpDto, UpsertCopasstMemberDto, UpsertCopasstPeriodDto, VoteDto } from './dto/copasst.dto';
import { CopasstService } from './copasst.service';

@Controller('copasst')
@UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
export class CopasstController {
  constructor(private readonly copasstService: CopasstService) {}

  @Get('current') @Roles('owner', 'admin', 'manager', 'member')
  getCurrent(@Req() req: RequestWithUser) { return this.copasstService.getCurrent(req.companyId as Types.ObjectId); }

  @Post('periods') @Roles('owner', 'admin')
  createPeriod(@Req() req: RequestWithUser, @Body() dto: UpsertCopasstPeriodDto) { return this.copasstService.createPeriod(req.companyId as Types.ObjectId, dto, req.user?.email ?? 'system'); }

  @Post('periods/:periodId/members') @Roles('owner', 'admin')
  addMember(@Param('periodId') periodId: string, @Req() req: RequestWithUser, @Body() dto: UpsertCopasstMemberDto) { return this.copasstService.addMember(periodId, dto, req.user?.email ?? 'system'); }

  @Post('periods/:periodId/candidates') registerCandidate(@Param('periodId') periodId: string, @Body() dto: RegisterCandidateDto) { return this.copasstService.registerCandidate(periodId, dto); }
  @Post('elections/otp') sendOtp(@Body() dto: SendOtpDto) { return this.copasstService.sendOtp(dto); }
  @Post('elections/vote') vote(@Body() dto: VoteDto) { return this.copasstService.vote(dto); }
  @Get('periods/:periodId/results') results(@Param('periodId') periodId: string) { return this.copasstService.results(periodId); }

  @Patch('periods/:periodId') @Roles('owner', 'admin')
  updatePeriod(@Param('periodId') periodId: string, @Body() body: { documents?: Array<{ type: string; title: string; content: string }> }) {
    return { periodId, updated: true, documents: body.documents ?? [] };
  }
}
