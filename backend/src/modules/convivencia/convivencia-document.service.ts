import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { DocumentGenerationService } from '../document-generation/services/document-generation.service';
import { SystemTemplateService } from '../document-generation/services/system-template.service';
import { PHVA_SOURCE_ENTITY_CONVIVENCIA } from '../document-generation/types/document-generation.types';
import { DocumentSourceModule } from '../document-generation/types/renderer.types';
import { UserDocument } from '../users/schemas/user.schema';
import { ConvivenciaService } from './convivencia.service';
import { ConvivenciaVariableResolverService } from './convivencia-variable-resolver.service';

/** Código documental del Acta de conformación del Comité de Convivencia (1.1.8). */
export const CONVIVENCIA_DOCUMENT_CODE_CONSTITUTION = 'PHVA-1.1.8-ACTA';
/** Código documental del Reporte de cumplimiento del Comité de Convivencia (1.1.8). */
export const CONVIVENCIA_DOCUMENT_CODE_COMPLIANCE = 'PHVA-1.1.8-COMP';

/** Nombre de archivo del Acta de conformación (1.1.8). */
export const CONVIVENCIA_CONSTITUTION_FILENAME = 'acta-conformacion-comite-convivencia.docx';
/** Nombre de archivo del Reporte de cumplimiento (1.1.8). */
export const CONVIVENCIA_COMPLIANCE_FILENAME = 'reporte-cumplimiento-convivencia.docx';

/** Resultado de una generación documental de 1.1.8 (contrato del frontend). */
export interface ConvivenciaDocumentResult {
  document: {
    instanceId?: Types.ObjectId;
    fileUrl: string;
    storagePath: string;
    version: number;
  };
  /** true si se reutilizó un documento existente (sin regenerar). */
  reused: boolean;
}

/**
 * ConvivenciaDocumentService: generación documental del Comité de Convivencia
 * Laboral (PHVA 1.1.8, Fase 5).
 *
 * Sigue EXACTAMENTE el patrón del motor existente (mismo flujo que
 * CopasstTrainingDocumentService):
 *
 *   1. Validar dominio (periodo de la empresa + multi-tenancy por companyId;
 *      NUNCA se acepta companyId del cliente — findPeriodForCompany).
 *   2. Asegurar la plantilla de sistema (SystemTemplateService).
 *   3. Resolver variables de dominio (ConvivenciaVariableResolverService).
 *   4. Delegar en DocumentGenerationService.generateDocument() con
 *      sourceModule CONVIVENCIA, sourceEntity CONVIVENCIA y sourceEntityId =
 *      id del periodo 1.1.8.
 *   5. Registrar la URL resultante en el periodo (attachConstitutionMinutes,
 *      única ruta de escritura del dominio).
 *
 * NO duplica RendererService, StorageService, TemplateSourceService ni
 * DocumentGenerationService. El dominio NO se modifica funcionalmente: la
 * generación solo lee datos reales y persiste la URL del acta.
 */
@Injectable()
export class ConvivenciaDocumentService {
  constructor(
    private readonly convivenciaService: ConvivenciaService,
    private readonly resolver: ConvivenciaVariableResolverService,
    private readonly documentGenerationService: DocumentGenerationService,
    private readonly systemTemplateService: SystemTemplateService,
  ) {}

  /**
   * Genera el Acta de conformación del Comité de Convivencia (1.1.8).
   *
   * @param companyId - Empresa autenticada (el dominio valida pertenencia).
   * @param user - Usuario solicitante (generatedBy de la instancia).
   * @param periodId - Periodo concreto (opcional: sin él se usa el vigente).
   */
  async generateConstitutionMinutes(
    companyId: Types.ObjectId,
    user: UserDocument | undefined,
    periodId?: string,
  ): Promise<ConvivenciaDocumentResult> {
    const period = await this.resolvePeriod(companyId, periodId);
    const template = await this.systemTemplateService.ensureConvivenciaConstitutionTemplate();
    const domainContext = await this.resolver.resolveConstitutionContext(companyId, period);

    const context: Record<string, unknown> = {
      ...domainContext,
      document: {
        code: CONVIVENCIA_DOCUMENT_CODE_CONSTITUTION,
        version: period.currentVersion ?? '1.0',
        generatedAt: new Date().toISOString(),
      },
    };

    const document = await this.documentGenerationService.generateDocument({
      companyId,
      templateId: template._id.toString(),
      sourceModule: DocumentSourceModule.CONVIVENCIA,
      sourceEntity: PHVA_SOURCE_ENTITY_CONVIVENCIA,
      sourceEntityId: period._id,
      generatedBy: this.resolveUserId(user),
      context,
    });

    // Persistir la URL en el periodo a través del dominio (ruta única de
    // escritura; no se duplica resolveCompliance).
    await this.convivenciaService.attachConstitutionMinutes(
      companyId,
      period._id.toString(),
      document.fileUrl,
      this.resolveUserEmail(user),
    );

    return { document, reused: false };
  }

  /**
   * Genera el Reporte de cumplimiento del Comité de Convivencia (1.1.8).
   *
   * Reporte NO normativo: consume SOLO el snapshot del dominio
   * (getComplianceSnapshot) — la IA/generador NUNCA recalcula compliance.
   * Sin contenido confidencial de casos (solo conteos agregados).
   */
  async generateComplianceReport(
    companyId: Types.ObjectId,
    user: UserDocument | undefined,
    periodId?: string,
  ): Promise<ConvivenciaDocumentResult> {
    const period = await this.resolvePeriod(companyId, periodId);
    const snapshot = await this.convivenciaService.getComplianceSnapshot(companyId);
    const template = await this.systemTemplateService.ensureConvivenciaComplianceTemplate();
    const domainContext = await this.resolver.resolveComplianceContext(
      companyId,
      snapshot,
      period,
    );

    const context: Record<string, unknown> = {
      ...domainContext,
      document: {
        code: CONVIVENCIA_DOCUMENT_CODE_COMPLIANCE,
        version: period.currentVersion ?? '1.0',
        generatedAt: new Date().toISOString(),
      },
    };

    const document = await this.documentGenerationService.generateDocument({
      companyId,
      templateId: template._id.toString(),
      sourceModule: DocumentSourceModule.CONVIVENCIA,
      sourceEntity: PHVA_SOURCE_ENTITY_CONVIVENCIA,
      sourceEntityId: period._id,
      generatedBy: this.resolveUserId(user),
      context,
    });

    return { document, reused: false };
  }

  /**
   * Trazabilidad documental de la entidad 1.1.8 de la empresa (DocumentInstance
   * generadas para CONVIVENCIA). Consulta SIEMPRE scoped por companyId.
   */
  async listDocuments(companyId: Types.ObjectId, periodId?: string) {
    return this.documentGenerationService.getInstancesBySource({
      companyId,
      sourceModule: DocumentSourceModule.CONVIVENCIA,
      sourceEntity: PHVA_SOURCE_ENTITY_CONVIVENCIA,
      sourceEntityId: periodId ? new Types.ObjectId(periodId) : undefined,
    });
  }

  /**
   * Resuelve el periodo validando SIEMPRE pertenencia por companyId (Fase 1).
   * Con periodId → findById (NotFound si no existe o es de otra empresa); sin
   * periodId → findCurrent (periodo vigente de la empresa). Nunca se acepta
   * companyId del cliente.
   */
  private async resolvePeriod(
    companyId: Types.ObjectId,
    periodId?: string,
  ) {
    if (periodId) {
      return this.convivenciaService.findById(companyId, new Types.ObjectId(periodId));
    }
    return this.convivenciaService.findCurrent(companyId);
  }

  private resolveUserId(user: UserDocument | undefined): Types.ObjectId | undefined {
    const id = (user as unknown as { _id?: Types.ObjectId } | undefined)?._id;
    return id ?? undefined;
  }

  private resolveUserEmail(user: UserDocument | undefined): string {
    return (user as unknown as { email?: string } | undefined)?.email ?? 'system';
  }
}
