import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { Roles } from '../questions/roles.decorator';
import { RolesGuard } from '../questions/roles.guard';
import { DocumentCatalogQueryDto } from './dto/document-catalog-query.dto';
import { DocumentCatalogService } from './services/document-catalog.service';

/**
 * Controller del Document Catalog (Fase 6.5).
 *
 * Catálogo único de consulta de todos los documentos generados por el
 * Document Generation Engine. Consulta EXCLUSIVAMENTE DocumentInstance (única
 * fuente de verdad documental) y entrega ViewModels (DocumentCatalogItem):
 * nunca el schema completo.
 *
 * Endpoints:
 * - GET /document-generation/catalog            → catálogo con filtros/búsqueda/paginación/orden
 * - GET /document-generation/catalog/:id        → detalle de una instancia (+ aprobación + versiones)
 * - GET /document-generation/catalog/company/:companyId → catálogo forzado a una empresa
 *
 * NO modifica Approval Workflow, DocumentGenerationService, Renderer, Storage,
 * Templates ni Schemas.
 */
@Controller('document-generation')
@UseGuards(FirebaseAuthGuard, RolesGuard)
export class DocumentCatalogController {
  constructor(private readonly documentCatalogService: DocumentCatalogService) {}

  /**
   * Catálogo paginado con filtros (companyId, documentType, status,
   * sourceModule, search, generatedFrom, generatedTo) y ordenamiento.
   */
  @Get('catalog')
  @Roles('owner', 'admin', 'manager')
  catalog(@Query() query: DocumentCatalogQueryDto) {
    return this.documentCatalogService.list(query);
  }

  /**
   * Catálogo forzado a una empresa (validación de ObjectId en el servicio).
   */
  @Get('catalog/company/:companyId')
  @Roles('owner', 'admin', 'manager')
  catalogByCompany(
    @Param('companyId') companyId: string,
    @Query() query: DocumentCatalogQueryDto,
  ) {
    return this.documentCatalogService.listByCompany(companyId, query);
  }

  /**
   * Detalle de una instancia: instancia + metadatos de aprobación + historial
   * de versiones de la misma entidad de origen.
   */
  @Get('catalog/:id')
  @Roles('owner', 'admin', 'manager')
  catalogDetail(@Param('id') id: string) {
    return this.documentCatalogService.getById(id);
  }
}
