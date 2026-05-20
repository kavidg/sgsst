import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  InternalServerErrorException,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { getStorage } from 'firebase-admin/storage';
import { Types } from 'mongoose';
import { RequestWithUser } from '../auth/auth.types';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { FirebaseAdminService } from '../auth/firebase-admin.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { UsersService } from '../users/users.service';
import { UpdateResponsableSstDto } from './dto/update-responsable-sst.dto';
import { UpdateResourceAssignmentDto } from './dto/update-resource-assignment.dto';
import { UploadResponsableSstDocumentDto } from './dto/upload-responsable-sst-document.dto';
import { PhvaAdvancedService } from './phva-advanced.service';
import { ResponsibilityAssignmentEntry } from './schemas/phva-advanced-responsibilities.schema';

@Controller('phva-advanced')
@UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
export class PhvaAdvancedController {
  constructor(
    private readonly phvaAdvancedService: PhvaAdvancedService,
    private readonly usersService: UsersService,
    private readonly firebaseAdminService: FirebaseAdminService,
  ) {}

  @Get('responsable-sst')
  @Roles('owner', 'admin', 'manager')
  async findResponsableSst(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    return this.phvaAdvancedService.findOrCreateResponsableSst(companyId);
  }

  @Patch('responsable-sst')
  @Roles('owner', 'admin')
  async updateResponsableSst(@Req() request: RequestWithUser, @Body() dto: UpdateResponsableSstDto) {
    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    return this.phvaAdvancedService.updateResponsableSst(companyId, user, dto);
  }

  @Post('responsable-sst/documents')
  @Roles('owner', 'admin')
  @UseInterceptors(FileInterceptor('file'))
  async uploadResponsableSstDocument(
    @Req() request: RequestWithUser,
    @UploadedFile() file: UploadedBinaryFile,
    @Body() dto: UploadResponsableSstDocumentDto,
  ) {
    if (!file) throw new BadRequestException('File is required');

    const companyId = this.resolveCompanyId(request);
    const user = await this.resolveUserFromRequest(request);
    const fileUrl = await this.uploadToFirebaseStorage(companyId, file);

    return this.phvaAdvancedService.attachDocument({
      companyId,
      user,
      type: dto.type,
      fileName: file.originalname,
      fileUrl,
      finalUserDate: dto.finalUserDate,
    });
  }

  @Get('responsable-sst/audit')
  @Roles('owner', 'admin')
  async responsableSstAudit(@Req() request: RequestWithUser) {
    const companyId = this.resolveCompanyId(request);
    return this.phvaAdvancedService.auditHistory(companyId);
  }

  @Get('responsibilities')
  @Roles('owner', 'admin', 'manager', 'member')
  async getResponsibilities(@Req() request: RequestWithUser) {
    return this.phvaAdvancedService.findOrCreateResponsibilities(this.resolveCompanyId(request));
  }

  @Patch('responsibilities')
  @Roles('owner', 'admin')
  async updateResponsibilities(@Req() request: RequestWithUser, @Body() dto: { responsibilities: ResponsibilityAssignmentEntry[] }) {
    const user = await this.resolveUserFromRequest(request);
    return this.phvaAdvancedService.updateResponsibilities(this.resolveCompanyId(request), user, dto.responsibilities ?? []);
  }

  @Get('resource-assignment')
  @Roles('owner', 'admin', 'manager', 'member')
  async getResourceAssignment(@Req() request: RequestWithUser) {
    return this.phvaAdvancedService.findOrCreateResourceAssignment(this.resolveCompanyId(request));
  }

  @Patch('resource-assignment')
  @Roles('owner', 'admin', 'manager')
  async updateResourceAssignment(@Req() request: RequestWithUser, @Body() dto: UpdateResourceAssignmentDto) {
    const user = await this.resolveUserFromRequest(request);
    return this.phvaAdvancedService.updateResourceAssignment(this.resolveCompanyId(request), user, dto);
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

  private async uploadToFirebaseStorage(companyId: Types.ObjectId, file: UploadedBinaryFile): Promise<string> {
    const app = this.firebaseAdminService.getApp();
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET ?? this.resolveStorageBucketName(app);

    if (!bucketName) {
      throw new InternalServerErrorException('Missing Firebase Storage bucket configuration');
    }

    const bucket = getStorage(app).bucket(bucketName);
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `phva-advanced/${companyId.toString()}/responsable-sst/${Date.now()}-${sanitizedName}`;
    const bucketFile = bucket.file(filePath);

    try {
      await bucketFile.save(file.buffer, {
        metadata: { contentType: file.mimetype },
        resumable: false,
      });
      await bucketFile.makePublic();
      return `https://storage.googleapis.com/${bucket.name}/${filePath}`;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown upload error';
      throw new InternalServerErrorException(`Failed to upload PHVA advanced document: ${errorMessage}`);
    }
  }

  private resolveStorageBucketName(app: ReturnType<FirebaseAdminService['getApp']>): string | undefined {
    const options = app.options as { storageBucket?: string };
    return options.storageBucket;
  }
}

type UploadedBinaryFile = {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
};
