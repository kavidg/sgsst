import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  InternalServerErrorException,
  Param,
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
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { FirebaseAdminService } from '../auth/firebase-admin.service';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { UsersService } from '../users/users.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { DocumentsService } from './documents.service';

@Controller('documents')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly usersService: UsersService,
    private readonly firebaseAdminService: FirebaseAdminService,
  ) {}

  @Post()
  @Roles('owner', 'admin')
  @UseInterceptors(FileInterceptor('file'))
  async create(
    @Req() request: RequestWithUser,
    @UploadedFile() file: UploadedBinaryFile,
    @Body() createDocumentDto: CreateDocumentDto,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    try {
      const user = await this.resolveUserFromRequest(request);
      const fileUrl = await this.uploadToFirebaseStorage(user.companyId, file);

      return this.documentsService.create(user.companyId, (user as unknown as { _id: Types.ObjectId })._id, createDocumentDto, fileUrl);
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ForbiddenException || error instanceof InternalServerErrorException) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerErrorException(`Failed to create document: ${errorMessage}`);
    }
  }

  @Get()
  @Roles('owner', 'admin', 'manager')
  async findAll(@Req() request: RequestWithUser) {
    const user = await this.resolveUserFromRequest(request);
    return this.documentsService.findAll(user.companyId);
  }

  @Get(':id')
  @Roles('owner', 'admin', 'manager')
  async findOne(@Req() request: RequestWithUser, @Param('id') id: string) {
    const user = await this.resolveUserFromRequest(request);
    return this.documentsService.findOne(id, user.companyId);
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  async remove(@Req() request: RequestWithUser, @Param('id') id: string) {
    const user = await this.resolveUserFromRequest(request);
    return this.documentsService.remove(id, user.companyId);
  }

  private async resolveUserFromRequest(request: RequestWithUser) {
    const firebaseUid = request.user?.uid;

    if (!firebaseUid) {
      throw new ForbiddenException('Missing authenticated user');
    }

    const user = await this.usersService.findByFirebaseUid(firebaseUid);

    if (!user) {
      throw new ForbiddenException('Authenticated user is not registered');
    }

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
    const filePath = `documents/${companyId.toString()}/${Date.now()}-${sanitizedName}`;
    const bucketFile = bucket.file(filePath);

    try {
      await bucketFile.save(file.buffer, {
        metadata: {
          contentType: file.mimetype,
        },
        resumable: false,
      });

      await bucketFile.makePublic();

      return `https://storage.googleapis.com/${bucket.name}/${filePath}`;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown upload error';
      throw new InternalServerErrorException(`Failed to upload document to storage: ${errorMessage}`);
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
