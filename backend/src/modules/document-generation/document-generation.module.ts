import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { CompanyAccessGuard } from '../auth/company-access.guard';
import { RolesGuard } from '../questions/roles.guard';
import { TemplatesModule } from '../templates/templates.module';
import { UsersModule } from '../users/users.module';
import { Company, CompanySchema } from '../companies/schemas/company.schema';
import { CompanyUser, CompanyUserSchema } from '../companies/schemas/company-user.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
// Fase 8.2.A — publicación automática Approval → DocumentMaster: el
// DocumentGenerationService publica la instancia aprobada en Gestión
// Documental vía DocumentPublicationService. forwardRef por el ciclo de
// módulos (document-management ↔ approval-workflow ↔ phva-advanced → aquí).
import { DocumentManagementModule } from '../document-management/document-management.module';
import { DocumentGenerationController } from './document-generation.controller';
import { DocumentCatalogController } from './document-catalog.controller';
import { DocumentInstance, DocumentInstanceSchema } from './schemas/document-instance.schema';
import { DocumentTemplate, DocumentTemplateSchema } from './schemas/document-template.schema';
import { DocumentGenerationService } from './services/document-generation.service';
import { DocumentCatalogService } from './services/document-catalog.service';
import { RendererService } from './services/renderer.service';
import { StorageService } from './services/storage.service';
import { SystemTemplateService } from './services/system-template.service';
import { TemplateSourceService } from './services/template-source.service';
import { VariableResolverService } from './services/variable-resolver.service';

/**
 * Módulo Document Generation Engine (Fase 1 — migración segura del generador DOCX).
 *
 * El motor se convierte en la única ruta de generación interna:
 * - Schemas base (DocumentTemplate, DocumentInstance).
 * - StorageService centralizado (Firebase Storage).
 * - RendererService desacoplado (strategy DOCX, PDF preparado).
 * - VariableResolverService con soporte de contexto anidado y plano legado.
 * - TemplateSourceService: resuelve plantillas legadas del módulo templates.
 * - DocumentGenerationService orquestador (resolve → render → upload → instance).
 *
 * Se importa TemplatesModule con forwardRef porque TemplatesController consume
 * DocumentGenerationService y TemplateSourceService consume TemplatesService.
 */
@Module({
  imports: [
    AuthModule,
    UsersModule,
    forwardRef(() => TemplatesModule),
    forwardRef(() => DocumentManagementModule),
    MongooseModule.forFeature([
      { name: DocumentTemplate.name, schema: DocumentTemplateSchema },
      { name: DocumentInstance.name, schema: DocumentInstanceSchema },
      // Fase 6.5 — Document Catalog: Company para resolver companyName en el
      // ViewModel del catálogo (consulta principal sigue siendo DocumentInstance).
      { name: Company.name, schema: CompanySchema },
      // AUDIT-8 — CompanyAccessGuard requiere User y CompanyUser para validar membresía.
      { name: User.name, schema: UserSchema },
      { name: CompanyUser.name, schema: CompanyUserSchema },
    ]),
  ],
  controllers: [DocumentGenerationController, DocumentCatalogController],
  providers: [
    DocumentGenerationService,
    TemplateSourceService,
    StorageService,
    RendererService,
    VariableResolverService,
    // Fase 2 — plantillas de sistema (documento formal del Responsable SG-SST).
    SystemTemplateService,
    // Fase 6.5 — catálogo único de consulta documental.
    DocumentCatalogService,
    RolesGuard,
    CompanyAccessGuard,
  ],
  exports: [
    DocumentGenerationService,
    TemplateSourceService,
    StorageService,
    RendererService,
    VariableResolverService,
    SystemTemplateService,
  ],
})
export class DocumentGenerationModule {}
