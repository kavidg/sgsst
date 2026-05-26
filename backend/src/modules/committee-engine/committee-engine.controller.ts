import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Types } from 'mongoose';
import { RequestWithUser } from '../auth/auth.types';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { CommitteeType, RegisterCommitteeCandidateDto, SendCommitteeOtpDto, UpsertCommitteeMemberDto, UpsertCommitteePeriodDto, VoteCommitteeDto } from './dto/committee.dto';
import { CommitteeEngineService } from './committee-engine.service';

@Controller('committee-engine')
@UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
export class CommitteeEngineController {
  constructor(private readonly service: CommitteeEngineService) {}
  @Get(':committeeType/current') @Roles('owner', 'admin', 'manager', 'member')
  getCurrent(@Req() req: RequestWithUser, @Param('committeeType') committeeType: CommitteeType) { return this.service.getCurrent(req.companyId as Types.ObjectId, committeeType); }
  @Post('periods') @Roles('owner', 'admin')
  createPeriod(@Req() req: RequestWithUser, @Body() dto: UpsertCommitteePeriodDto) { return this.service.createPeriod(req.companyId as Types.ObjectId, dto, req.user?.email ?? 'system'); }
  @Post('periods/:periodId/members') @Roles('owner', 'admin')
  addMember(@Param('periodId') periodId: string, @Req() req: RequestWithUser, @Body() dto: UpsertCommitteeMemberDto) { return this.service.addMember(periodId, dto, req.user?.email ?? 'system'); }
  @Post('periods/:periodId/candidates') registerCandidate(@Param('periodId') periodId: string, @Body() dto: RegisterCommitteeCandidateDto) { return this.service.registerCandidate(periodId, dto); }
  @Post('elections/otp') sendOtp(@Body() dto: SendCommitteeOtpDto) { return this.service.sendOtp(dto); }
  @Post('elections/vote') vote(@Body() dto: VoteCommitteeDto) { return this.service.vote(dto); }
  @Get('periods/:periodId/results') results(@Param('periodId') periodId: string) { return this.service.results(periodId); }
}
