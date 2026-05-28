import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Types } from 'mongoose';
import { RequestWithUser } from '../auth/auth.types';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { UsersService } from '../users/users.service';
import { ComplianceCredentialsService } from './compliance-credentials.service';
import { CreateCredentialDto } from './dto/create-credential.dto';
import { CreateCredentialDocumentDto } from './dto/create-document.dto';
import { ManualOcrDateDto } from './dto/manual-ocr-date.dto';
import { CreateResponsibleDto, UpdateResponsibleDto } from './dto/responsible.dto';
import { UpdateCredentialDto } from './dto/update-credential.dto';

@Controller('compliance-credentials')
@UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
export class ComplianceCredentialsController {
  constructor(
    private readonly service: ComplianceCredentialsService,
    private readonly usersService: UsersService,
  ) {}

  @Get()
  @Roles('owner', 'admin', 'manager', 'member')
  findAll(@Req() request: RequestWithUser) {
    return this.service.findAll(this.resolveCompanyId(request));
  }

  @Post()
  @Roles('owner', 'admin', 'manager')
  async create(@Req() request: RequestWithUser, @Body() dto: CreateCredentialDto) {
    return this.service.create(this.resolveCompanyId(request), await this.resolveUserFromRequest(request), dto);
  }

  @Post('responsibles')
  @Roles('owner', 'admin', 'manager')
  async addResponsible(@Req() request: RequestWithUser, @Body() dto: CreateResponsibleDto) {
    return this.service.addResponsible(this.resolveCompanyId(request), await this.resolveUserFromRequest(request), dto);
  }

  @Get('responsibles/list')
  @Roles('owner', 'admin', 'manager', 'member')
  listResponsibles(@Req() request: RequestWithUser) {
    return this.service.listResponsibles(this.resolveCompanyId(request));
  }

  @Patch('responsibles/:id')
  @Roles('owner', 'admin', 'manager')
  async updateResponsible(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: UpdateResponsibleDto) {
    return this.service.updateResponsible(this.resolveCompanyId(request), await this.resolveUserFromRequest(request), id, dto);
  }

  @Patch('responsibles/:id/deactivate')
  @Roles('owner', 'admin', 'manager')
  async deactivateResponsible(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.service.deactivateResponsible(this.resolveCompanyId(request), await this.resolveUserFromRequest(request), id);
  }

  @Delete('responsibles/:id')
  @Roles('owner', 'admin')
  async removeResponsible(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.service.removeResponsible(this.resolveCompanyId(request), await this.resolveUserFromRequest(request), id);
  }

  @Post('documents')
  @Roles('owner', 'admin', 'manager')
  async attachDocument(@Req() request: RequestWithUser, @Body() dto: CreateCredentialDocumentDto) {
    return this.service.attachDocument(this.resolveCompanyId(request), await this.resolveUserFromRequest(request), dto);
  }

  @Patch('ocr/date')
  @Roles('owner', 'admin', 'manager')
  async manualOcrDateChange(@Req() request: RequestWithUser, @Body() dto: ManualOcrDateDto) {
    return this.service.registerManualOcrDateChange(this.resolveCompanyId(request), await this.resolveUserFromRequest(request), dto);
  }

  @Get(':id')
  @Roles('owner', 'admin', 'manager', 'member')
  findOne(@Req() request: RequestWithUser, @Param('id') id: string) {
    return this.service.findOne(this.resolveCompanyId(request), id);
  }

  @Patch(':id')
  @Roles('owner', 'admin', 'manager')
  async update(@Req() request: RequestWithUser, @Param('id') id: string, @Body() dto: UpdateCredentialDto) {
    return this.service.update(this.resolveCompanyId(request), await this.resolveUserFromRequest(request), id, dto);
  }

  private resolveCompanyId(request: RequestWithUser): Types.ObjectId {
    if (!request.companyId) throw new ForbiddenException('Missing active company context');
    return request.companyId;
  }

  private async resolveUserFromRequest(request: RequestWithUser) {
    const firebaseUid = request.user?.uid;
    if (!firebaseUid) throw new ForbiddenException('Missing authenticated user');
    const user = await this.usersService.findByFirebaseUid(firebaseUid);
    if (!user) throw new ForbiddenException('Authenticated user is not registered');
    return user;
  }
}
