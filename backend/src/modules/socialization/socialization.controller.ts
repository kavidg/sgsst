import {
  Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Types } from 'mongoose';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RolesGuard } from '../questions/roles.guard';
import { Roles } from '../questions/roles.decorator';
import { RequestWithUser } from '../auth/auth.types';
import { SocializationService } from './socialization.service';
import {
  StartSocializationDto, UpdateSocializationDto,
  UploadPresentationDto, AddParticipantsDto, SendReminderDto,
  ViewSlideDto, CompletePresentationDto, SignSocializationDto,
} from './dto/socialization.dto';

@Controller()
export class SocializationController {
  constructor(private readonly socializationService: SocializationService) {}

  private resolveCompanyId(request: RequestWithUser): Types.ObjectId {
    if (!request.companyId) throw new ForbiddenException('Missing active company context');
    return request.companyId;
  }

  // ==================== ADMIN ENDPOINTS ====================

  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin', 'manager')
  @Get('socialization/session/:itemCode')
  async getSession(@Req() request: RequestWithUser, @Param('itemCode') itemCode: string) {
    return this.socializationService.getSessionByItemCode(
      this.resolveCompanyId(request),
      itemCode,
    );
  }

  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin', 'manager')
  @Post('socialization/start/:itemCode')
  async startSocialization(
    @Req() request: RequestWithUser,
    @Param('itemCode') itemCode: string,
    @Body() dto: StartSocializationDto,
  ) {
    const user = request.user as any;
    return this.socializationService.startSocialization(
      this.resolveCompanyId(request),
      itemCode,
      dto,
      user.email,
      `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
    );
  }

  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  @Patch('socialization/:sessionId')
  async updateSocialization(
    @Req() request: RequestWithUser,
    @Param('sessionId') sessionId: string,
    @Body() dto: UpdateSocializationDto,
  ) {
    const user = request.user as any;
    return this.socializationService.updateSocialization(this.resolveCompanyId(request), sessionId, dto, user.email);
  }

  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  @Post('socialization/:sessionId/complete')
  async completeSocialization(@Req() request: RequestWithUser, @Param('sessionId') sessionId: string) {
    const user = request.user as any;
    return this.socializationService.completeSocialization(this.resolveCompanyId(request), sessionId, user.email);
  }

  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  @Get('socialization/:sessionId/stats')
  async getSessionStats(@Req() request: RequestWithUser, @Param('sessionId') sessionId: string) {
    return this.socializationService.getSessionStats(this.resolveCompanyId(request), sessionId);
  }

  // Presentation
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  @Post('socialization/:sessionId/presentation')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }))
  async uploadPresentation(
    @Req() request: RequestWithUser,
    @Param('sessionId') sessionId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadPresentationDto,
  ) {
    const user = request.user as any;
    const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
    return this.socializationService.uploadPresentation(this.resolveCompanyId(request), sessionId, file, dto, user.email, userName);
  }

  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin', 'manager')
  @Get('socialization/:sessionId/presentation')
  async getPresentation(@Req() request: RequestWithUser, @Param('sessionId') sessionId: string) {
    return this.socializationService.getPresentation(this.resolveCompanyId(request), sessionId);
  }

  // Participants
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  @Post('socialization/:sessionId/participants')
  async addParticipants(
    @Req() request: RequestWithUser,
    @Param('sessionId') sessionId: string,
    @Body() dto: AddParticipantsDto,
  ) {
    const user = request.user as any;
    return this.socializationService.addParticipants(this.resolveCompanyId(request), sessionId, dto, user.email);
  }

  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin', 'manager')
  @Get('socialization/:sessionId/participants')
  async getParticipants(@Req() request: RequestWithUser, @Param('sessionId') sessionId: string) {
    return this.socializationService.getParticipants(this.resolveCompanyId(request), sessionId);
  }

  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  @Delete('socialization/:sessionId/participants/:participantId')
  async removeParticipant(
    @Req() request: RequestWithUser,
    @Param('sessionId') sessionId: string,
    @Param('participantId') participantId: string,
  ) {
    const user = request.user as any;
    return this.socializationService.removeParticipant(this.resolveCompanyId(request), sessionId, participantId, user.email);
  }

  // Tokens
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  @Post('socialization/:sessionId/tokens')
  async generateTokens(@Req() request: RequestWithUser, @Param('sessionId') sessionId: string) {
    const user = request.user as any;
    return this.socializationService.generateTokens(this.resolveCompanyId(request), sessionId, user.email);
  }

  // Reminders
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  @Post('socialization/:sessionId/reminders')
  async sendReminders(
    @Req() request: RequestWithUser,
    @Param('sessionId') sessionId: string,
    @Body() dto: SendReminderDto,
  ) {
    const user = request.user as any;
    return this.socializationService.sendReminders(this.resolveCompanyId(request), sessionId, dto, user.email);
  }

  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin', 'manager')
  @Get('socialization/reminders/pending')
  async getPendingReminders(@Req() request: RequestWithUser) {
    return this.socializationService.getPendingReminders(this.resolveCompanyId(request));
  }

  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin')
  @Post('socialization/reminders/auto')
  async processAutoReminders(@Req() request: RequestWithUser) {
    return this.socializationService.processAutoReminders(this.resolveCompanyId(request));
  }

  // Evidence & Reports
  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin', 'manager')
  @Get('socialization/:sessionId/evidence')
  async getEvidence(@Req() request: RequestWithUser, @Param('sessionId') sessionId: string) {
    return this.socializationService.getEvidence(this.resolveCompanyId(request), sessionId);
  }

  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin', 'manager')
  @Get('socialization/:sessionId/audit')
  async getAuditHistory(@Req() request: RequestWithUser, @Param('sessionId') sessionId: string) {
    return this.socializationService.getAuditHistory(this.resolveCompanyId(request), sessionId);
  }

  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin', 'manager')
  @Get('socialization/:sessionId/report')
  async generateReport(@Req() request: RequestWithUser, @Param('sessionId') sessionId: string) {
    return this.socializationService.generateReport(this.resolveCompanyId(request), sessionId);
  }

  @UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
  @Roles('owner', 'admin', 'manager')
  @Get('socialization/:itemCode/compliance')
  async checkCompliance(@Req() request: RequestWithUser, @Param('itemCode') itemCode: string) {
    return this.socializationService.checkCompliance(this.resolveCompanyId(request), itemCode);
  }

  // ==================== PUBLIC ENDPOINTS (no auth) ====================

  @Get('socialize/:token')
  async getParticipantByToken(@Param('token') token: string) {
    return this.socializationService.getParticipantByToken(token);
  }

  @Post('socialize/:token/open')
  async openLink(@Param('token') token: string, @Req() request: any) {
    const ip = request.ip || request.headers['x-forwarded-for'] || '';
    const ua = request.headers['user-agent'] || '';
    return this.socializationService.openLink(token, ip as string, ua as string);
  }

  @Post('socialize/:token/slide')
  async trackSlideView(@Param('token') token: string, @Body() dto: ViewSlideDto) {
    return this.socializationService.trackSlideView(token, dto);
  }

  @Post('socialize/:token/complete-presentation')
  async completePresentation(@Param('token') token: string, @Body() dto: CompletePresentationDto) {
    return this.socializationService.completePresentation(token, dto);
  }

  @Post('socialize/:token/sign')
  async signSocialization(@Param('token') token: string, @Body() dto: SignSocializationDto) {
    return this.socializationService.signSocialization(token, dto);
  }
}
