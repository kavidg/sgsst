import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  InternalServerErrorException,
  Patch,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { getStorage } from 'firebase-admin/storage';
import { Types } from 'mongoose';
import { RequestWithUser } from '../auth/auth.types';
import { FirebaseAdminService } from '../auth/firebase-admin.service';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { DocumentGenerationService } from '../document-generation/services/document-generation.service';
import { StorageService } from '../document-generation/services/storage.service';
import { DocumentSourceModule } from '../document-generation/types/renderer.types';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { UsersService } from '../users/users.service';
import { GenerateTemplateDto } from './dto/generate-template.dto';
import { UploadTemplateDto } from './dto/upload-template.dto';
import { TemplatesService } from './templates.service';

@Controller('templates')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class TemplatesController {
  constructor(
    private readonly templatesService: TemplatesService,
    private readonly usersService: UsersService,
    private readonly firebaseAdminService: FirebaseAdminService,
    private readonly documentGenerationService: DocumentGenerationService,
    private readonly storageService: StorageService,
  ) {}

  @Post('upload')
  @Roles('owner', 'admin')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Req() request: RequestWithUser,
    @UploadedFile() file: UploadedBinaryFile,
    @Body() uploadTemplateDto: UploadTemplateDto & { variables?: string | string[] },
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    this.assertDocxFile(file);

    const user = await this.resolveUserFromRequest(request);
    const { fileUrl, storagePath } = await this.uploadToFirebaseStorage(user.companyId, file);

    return this.templatesService.create({
      companyId: user.companyId,
      uploadedBy: (user as unknown as { _id: Types.ObjectId })._id,
      name: uploadTemplateDto.name,
      originalFileName: file.originalname,
      fileUrl,
      storagePath,
      variables: this.normalizeVariables(uploadTemplateDto.variables),
    });
  }

  @Get('company/:companyId')
  @Roles('owner', 'admin', 'manager')
  async findByCompany(@Req() request: RequestWithUser, @Param('companyId') companyId: string) {
    const user = await this.resolveUserFromRequest(request);
    const userCompanyId = user.companyId.toString();

    if (userCompanyId !== companyId) {
      throw new ForbiddenException('You are not allowed to access templates for this company');
    }

    return this.templatesService.findByCompany(user.companyId);
  }

  @Post('generate/:templateId')
  @Roles('owner', 'admin', 'manager')
  async generate(
    @Req() request: RequestWithUser,
    @Param('templateId') templateId: string,
    @Body() generateTemplateDto: GenerateTemplateDto,
    @Res() response: HttpResponse,
  ) {
    const user = await this.resolveUserFromRequest(request);

    // Fase 1: la generación DOCX delega en el Document Generation Engine, que
    // resuelve la plantilla (TemplateSourceService), renderiza (RendererService),
    // guarda el archivo (StorageService) y registra la trazabilidad (DocumentInstance).
    const generated = await this.documentGenerationService.generateDocument({
      companyId: user.companyId,
      templateId,
      sourceModule: DocumentSourceModule.TEMPLATES,
      generatedBy: (user as unknown as { _id: Types.ObjectId })._id,
      context: generateTemplateDto.data,
    });

    // Se descarga el archivo generado para mantener la respuesta HTTP previa.
    const generatedBuffer = await this.storageService.download(generated.storagePath);
    const fileName = this.buildGeneratedFileName(generated.storagePath);

    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    response.send(generatedBuffer);
  }

  @Patch(':templateId/variables')
  @Roles('owner', 'admin')
  async updateVariables(
    @Req() request: RequestWithUser,
    @Param('templateId') templateId: string,
    @Body() body: { variables?: string[] },
  ) {
    const user = await this.resolveUserFromRequest(request);
    const variables = this.normalizeVariables(body.variables);
    return this.templatesService.updateVariables(templateId, user.companyId, variables);
  }

  private normalizeVariables(rawVariables?: string | string[]) {
    if (!rawVariables) {
      return [];
    }

    const list = Array.isArray(rawVariables) ? rawVariables : [rawVariables];
    return list.map((variable) => variable.trim()).filter((variable) => variable.length > 0);
  }

  private buildGeneratedFileName(storagePath: string) {
    const baseName = storagePath.split('/').pop() ?? `documento-${Date.now()}.docx`;
    return baseName;
  }

  private assertDocxFile(file: UploadedBinaryFile) {
    const isDocxMimeType = file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const isDocxExtension = file.originalname.toLowerCase().endsWith('.docx');

    if (!isDocxMimeType && !isDocxExtension) {
      throw new BadRequestException('Only .docx files are allowed');
    }
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

  private async uploadToFirebaseStorage(companyId: Types.ObjectId, file: UploadedBinaryFile) {
    const app = this.firebaseAdminService.getApp();
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET;

    if (!bucketName) {
      throw new InternalServerErrorException('Missing FIREBASE_STORAGE_BUCKET configuration');
    }

    const bucket = getStorage(app).bucket(bucketName);
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `templates/${companyId.toString()}/${Date.now()}-${sanitizedName}`;
    const bucketFile = bucket.file(storagePath);

    await bucketFile.save(file.buffer, {
      metadata: {
        contentType: file.mimetype,
      },
      resumable: false,
    });

    await bucketFile.makePublic();

    return {
      fileUrl: `https://storage.googleapis.com/${bucket.name}/${storagePath}`,
      storagePath,
    };
  }
}

type UploadedBinaryFile = {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
};

type HttpResponse = {
  setHeader(name: string, value: string): void;
  send(body: Buffer): void;
};
