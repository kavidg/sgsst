import { BadRequestException, Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { Types } from 'mongoose';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { DocumentGenerationService } from './services/document-generation.service';
import { DocumentSourceModule, VariableContext } from './types/document-generation.types';
import { RequestWithUser } from '../auth/auth.types';

/**
 * Controller del Document Generation Engine.
 *
 * Fase 0: expone la base del motor. Solo se habilita un endpoint de estado y un
 * endpoint de generación mínimo (sin integración con PHVA ni Approval Workflow).
 */
@Controller('document-generation')
@UseGuards(FirebaseAuthGuard, RolesGuard, CompanyAccessGuard)
export class DocumentGenerationController {
  constructor(private readonly documentGenerationService: DocumentGenerationService) {}

  /** Estado del motor (health check). */
  @Get('health')
  @Roles('owner', 'admin', 'manager')
  health() {
    return {
      status: 'ok',
      module: 'document-generation',
      phase: 'foundation',
    };
  }

  /**
   * Genera una instancia documental a partir de una plantilla.
   * Fase 0: solo DOCX, sin integración con módulos existentes.
   */
  @Post('generate')
  @Roles('owner', 'admin', 'manager')
  async generate(@Req() request: RequestWithUser, @Body() body: GenerateDocumentBody) {
    // AUDIT-8: CompanyAccessGuard valida membresía y setea request.companyId.
    // El header x-company-id NO puede usarse como autoridad de tenant.
    if (!request.companyId) {
      throw new BadRequestException('Missing company context');
    }

    return this.documentGenerationService.generateDocument({
      companyId: request.companyId,
      templateId: body.templateId,
      sourceModule: body.sourceModule ?? DocumentSourceModule.OTHER,
      sourceEntity: body.sourceEntity ?? 'GENERIC',
      context: body.context,
    });
  }

  /**
   * Consulta de trazabilidad documental de una entidad PHVA (Fase 2).
   *
   * Devuelve las instancias generadas para una entidad concreta:
   * documento, versión, estado, URL y fecha de generación.
   *
   * Ejemplo: GET /document-generation/phva/RESPONSIBLE_SG_SST/:id
   */
  @Get('phva/:entity/:id')
  @Roles('owner', 'admin', 'manager')
  async getPhvaDocument(
    @Req() request: RequestWithUser,
    @Param('entity') entity: string,
    @Param('id') id: string,
  ) {
    // AUDIT-8: CompanyAccessGuard valida membresía y setea request.companyId.
    if (!request.companyId) {
      throw new BadRequestException('Missing company context');
    }

    const instances = await this.documentGenerationService.getInstancesBySource({
      companyId: request.companyId,
      sourceModule: DocumentSourceModule.PHVA_ADVANCED,
      sourceEntity: entity,
      sourceEntityId: this.toObjectId(id),
    });

    return {
      entity,
      documents: instances.map((instance) => ({
        id: instance._id.toString(),
        version: instance.version,
        status: instance.status,
        fileUrl: instance.fileUrl,
        storagePath: instance.storagePath,
        generatedAt: instance.generatedAt,
        approvalStatus: instance.approvalStatus ?? null,
        approvedAt: instance.approvedAt ?? null,
      })),
    };
  }

  private toObjectId(value: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(`Invalid companyId: ${value}`);
    }

    return new Types.ObjectId(value);
  }
}

/** Cuerpo mínimo de la solicitud de generación (Fase 0). */
interface GenerateDocumentBody {
  templateId: string;
  sourceModule?: DocumentSourceModule;
  sourceEntity?: string;
  context?: VariableContext;
}
