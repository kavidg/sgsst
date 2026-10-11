import { BadRequestException,
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
import { Types } from 'mongoose';
import { RequestWithUser } from '../auth/auth.types';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { UsersService } from '../users/users.service';
// FASE 1 — consolidación: el upload ya NO se duplica aquí; pasa por la
// fachada StorageService → StorageProvider (legacy Firebase conserva el
// comportamiento público exacto; R2 queda activable por variable de entorno).
import { StorageService } from '../document-generation/services/storage.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { DocumentsService } from './documents.service';

@Controller('documents')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly usersService: UsersService,
    private readonly storageService: StorageService,
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
      // FASE 1 — upload consolidado en StorageService (path histórico intacto:
      // documents/{companyId}/{ts}-{nombre}); makePublic sigue en el provider legacy.
      const { fileUrl } = await this.storageService.upload(
        file.buffer,
        file.originalname,
        `documents/${user.companyId.toString()}`,
        { contentType: file.mimetype },
      );

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

}

type UploadedBinaryFile = {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
};
