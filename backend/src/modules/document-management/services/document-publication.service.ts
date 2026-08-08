import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  DocumentInstance,
  DocumentInstanceDocument,
} from '../../document-generation/schemas/document-instance.schema';
import { DocumentSourceModule } from '../../document-generation/types/renderer.types';
import {
  PHVA_SOURCE_ENTITY_COPASST,
  PHVA_SOURCE_ENTITY_RESOURCE_ASSIGNMENT,
  PHVA_SOURCE_ENTITY_RESPONSIBILITIES,
  PHVA_SOURCE_ENTITY_RESPONSIBLE_SG_SST,
  PHVA_SOURCE_ENTITY_SST_POLICY,
} from '../../document-generation/types/document-generation.types';
import {
  DocumentMaster,
  DocumentStatus,
  DocumentType,
} from '../schemas/document-master.schema';
import { DocumentMasterService } from './document-master.service';

/**
 * Metadatos de publicación de una entidad PHVA aprobada en DocumentMaster.
 *
 * Fase 8.2.A — cada entidad con generador documental del Approval Workflow
 * declara aquí su mapeo hacia el listado maestro: código único (índice
 * companyId+code), nombre, tipo documental, proceso y el código del estándar
 * del StandardCatalog (Resolución 0312 de 2019).
 */
export interface DocumentPublicationMapping {
  /** Código único del documento en el listado maestro. */
  code: string;
  /** Nombre legible del documento en Gestión Documental. */
  name: string;
  documentType: DocumentType;
  process: string;
  /** Código del estándar PHVA origen (p. ej. '1.1.1', '2.1.1'). */
  standardCode: string;
}

/** Resultado de una publicación automática. */
export interface DocumentPublicationResult {
  document: DocumentMaster;
  action: 'created' | 'updated' | 'skipped';
  standardCode: string;
}

/**
 * DocumentMaster con el `_id` disponible. La clase del schema no declara `_id`
 * (Mongoose lo inyecta en runtime); este alias expresa el shape real que
 * devuelven los métodos de DocumentMasterService para poder vincularlo.
 */
type DocumentMasterWithId = DocumentMaster & { _id: Types.ObjectId };

/**
 * DocumentPublicationService — conexión automática Approval → DocumentMaster.
 *
 * Fase 8.2.A — recibe una DocumentInstance generada tras una aprobación del
 * Approval Workflow Core y la publica en Gestión Documental (DocumentMaster)
 * reutilizando DocumentMasterService (registerDocument / uploadVersion /
 * updateStatus) sin duplicar lógica ni crear DocumentApproval adicionales.
 *
 * Reglas:
 * - Solo publica instancias de sourceModule PHVA_ADVANCED con entidad mapeada.
 * - Solo publica instancias con approvalStatus APPROVED o APPROVED_AND_SIGNED.
 * - Idempotente: si la instancia ya está vinculada a un maestro vigente no
 *   vuelve a publicar; si el código ya existe, crea una NUEVA VERSIÓN
 *   (mantiene historial); ante carreras E11000 reutiliza el maestro creado.
 * - El documento publicado nace ACTIVE con approvalUser/approvalDate ya
 *   resueltos del ApprovalEvent (sin doble aprobación).
 * - No emite comunicaciones automáticas duplicadas (skipCommunication: el
 *   módulo origen —p. ej. Política SST— ya gestiona las suyas).
 */
@Injectable()
export class DocumentPublicationService {
  /**
   * Catálogo declarativo sourceEntity → publicación. Los códigos de estándar
   * se alinean con el StandardCatalog normativo: 1.1.1 (Responsable SG-SST),
   * 1.1.2 (Responsabilidades), 1.1.3 (Asignación de recursos), 1.1.6
   * (Conformación COPASST) y 2.1.1 (Política SST).
   */
  private readonly sourceMappings: Readonly<Record<string, DocumentPublicationMapping>> = {
    [PHVA_SOURCE_ENTITY_RESPONSIBLE_SG_SST]: {
      code: 'PHVA-1.1.1',
      name: 'Designación Responsable SG-SST',
      documentType: DocumentType.LEGAL_DOCUMENT,
      process: 'SG-SST',
      standardCode: '1.1.1',
    },
    [PHVA_SOURCE_ENTITY_RESPONSIBILITIES]: {
      code: 'PHVA-1.1.2',
      name: 'Matriz de Responsabilidades SG-SST',
      documentType: DocumentType.LEGAL_DOCUMENT,
      process: 'SG-SST',
      standardCode: '1.1.2',
    },
    [PHVA_SOURCE_ENTITY_RESOURCE_ASSIGNMENT]: {
      code: 'PHVA-1.1.3',
      name: 'Asignación de Recursos para el SG-SST',
      documentType: DocumentType.LEGAL_DOCUMENT,
      process: 'SG-SST',
      standardCode: '1.1.3',
    },
    [PHVA_SOURCE_ENTITY_SST_POLICY]: {
      code: 'PHVA-2.1.1',
      name: 'Política de Seguridad y Salud en el Trabajo',
      documentType: DocumentType.POLICY,
      process: 'SG-SST',
      standardCode: '2.1.1',
    },
    [PHVA_SOURCE_ENTITY_COPASST]: {
      code: 'PHVA-COPASST',
      name: 'Acta de Conformación del COPASST',
      documentType: DocumentType.COPASST,
      process: 'COPASST',
      standardCode: '1.1.6',
    },
  };

  constructor(
    private readonly documentMasterService: DocumentMasterService,
    @InjectModel(DocumentInstance.name)
    private readonly instanceModel: Model<DocumentInstanceDocument>,
  ) {}

  /**
   * Publica una DocumentInstance aprobada en DocumentMaster.
   *
   * @param instance - Instancia documental generada (con metadatos de aprobación).
   * @returns null si la instancia no es publicable; en otro caso el maestro
   * creado/actualizado/saltado con el código del estándar vinculado.
   */
  async publishFromInstance(
    instance: DocumentInstanceDocument,
  ): Promise<DocumentPublicationResult | null> {
    // 1. Solo documentos formales del módulo PHVA Advanced.
    if (instance.sourceModule !== DocumentSourceModule.PHVA_ADVANCED) {
      return null;
    }

    // 2. Entidad con mapeo declarativo de publicación.
    const mapping = this.sourceMappings[instance.sourceEntity];
    if (!mapping) {
      return null;
    }

    // 3. Solo decisiones realmente aprobadas (APPROVED / APPROVED_AND_SIGNED).
    const approvalStatus = instance.approvalStatus;
    if (approvalStatus !== 'APPROVED' && approvalStatus !== 'APPROVED_AND_SIGNED') {
      return null;
    }

    const companyId = instance.companyId;
    const approvedBy = instance.approvedBy;
    const approvedAt = instance.approvedAt ?? new Date();
    const actor = { _id: approvedBy ?? new Types.ObjectId(), email: 'system' };

    let document: DocumentMasterWithId | null = null;
    let action: DocumentPublicationResult['action'] = 'skipped';
    let publish = true;

    // 4. Idempotencia: si la instancia ya está vinculada a un maestro vigente,
    // no se vuelve a publicar (reintentos de decideAndApply / repeticiones).
    // Se continúa hacia el updateOne para rellenar standardCode en instancias
    // legadas vinculadas antes de que existiera el campo.
    if (instance.documentMasterId) {
      const linked = await this.findLinkedMaster(instance.documentMasterId);
      if (linked) {
        document = linked as DocumentMasterWithId;
        action = 'skipped';
        publish = false;
      }
      // El maestro vinculado fue eliminado: se recrea debajo.
    }

    const existing = publish
      ? ((await this.documentMasterService.findByCompanyAndCode(
          companyId,
          mapping.code,
        )) as DocumentMasterWithId | null)
      : null;

    if (publish && existing && existing.process !== mapping.process) {
      // Colisión de código: existe un documento MANUAL con el mismo código
      // (p. ej. PHVA-1.1.1) que no fue publicado por este servicio. Versionarlo
      // contaminaría un documento no relacionado: se omite la publicación.
      console.warn(
        `[DocumentPublication] code collision: company=${companyId}, code=${mapping.code} exists with process "${existing.process ?? ''}" (expected "${mapping.process}"). Publication skipped.`,
      );
      return null;
    }

    if (publish && !existing) {
      try {
        // 5. Creación: registerDocument reutiliza validación de código único,
        // versión v1 con fileUrl, historial CREATE y (con skipCommunication)
        // sin comunicaciones automáticas duplicadas.
        document = (await this.documentMasterService.registerDocument({
          companyId,
          code: mapping.code,
          name: mapping.name,
          description: `Documento generado automáticamente tras la aprobación del estándar ${mapping.standardCode} (${mapping.name}).`,
          documentType: mapping.documentType,
          process: mapping.process,
          fileUrl: instance.fileUrl,
          ownerUser: approvedBy,
          approvalUser: approvedBy,
          status: DocumentStatus.ACTIVE,
          approvalDate: approvedAt,
          skipCommunication: true,
          sourceModule: instance.sourceModule,
        })) as DocumentMasterWithId;
        action = 'created';
      } catch (error) {
        // Carrera: dos publicaciones concurrentes sobre el mismo código (el
        // índice único companyId+code rechaza el segundo create).
        if (!this.isDuplicateError(error)) {
          throw error;
        }
        const concurrent = (await this.documentMasterService.findByCompanyAndCode(
          companyId,
          mapping.code,
        )) as DocumentMasterWithId | null;
        if (!concurrent) {
          throw error;
        }
        const currentVersion = await this.documentMasterService.getCurrentVersion(
          concurrent._id,
        );
        if (currentVersion?.fileUrl === instance.fileUrl) {
          // La otra publicación ya versionó el MISMO archivo (misma aprobación):
          // solo se vincula la instancia, sin crear una versión redundante.
          document = concurrent;
          action = 'skipped';
        } else {
          document = await this.publishNewVersion(
            concurrent,
            companyId,
            instance,
            approvedBy,
            approvedAt,
          );
          action = 'updated';
        }
      }
    } else if (publish) {
      // 6. Re-aprobación: nueva versión en el maestro existente (mantiene
      // historial y versiones previas).
      document = await this.publishNewVersion(existing as DocumentMasterWithId, companyId, instance, approvedBy, approvedAt);
      action = 'updated';
    }

    // Guard defensivo: todas las rutas publicables asignan document; si llegara
    // sin asignar (no debería ocurrir) se omite la publicación.
    if (!document) {
      return null;
    }

    // 7. Trazabilidad: vincular la instancia con el maestro publicado. Se
    // ejecuta SIEMPRE (incluido el caso skipped) para mantener consistencia
    // bidireccional y rellenar standardCode en instancias legadas.
    await this.instanceModel
      .updateOne(
        { _id: instance._id },
        { $set: { documentMasterId: document._id, standardCode: mapping.standardCode } },
      )
      .exec();

    return { document, action, standardCode: mapping.standardCode };
  }

  /**
   * Re-aprobación: crea una nueva versión en el maestro existente y lo
   * restaura a ACTIVE con aprobador/fecha de la aprobación ya aplicada.
   */
  private async publishNewVersion(
    document: DocumentMasterWithId,
    companyId: Types.ObjectId,
    instance: DocumentInstanceDocument,
    approvedBy: Types.ObjectId | undefined,
    approvedAt: Date,
  ): Promise<DocumentMasterWithId> {
    const actor = { _id: approvedBy ?? new Types.ObjectId(), email: 'system' };

    // uploadVersion incrementa la versión, marca previas como no-current y
    // registra historial VERSION_CHANGE (deja el documento en UNDER_REVIEW).
    await this.documentMasterService.uploadVersion(
      document._id,
      companyId,
      instance.fileUrl,
      `Nueva versión generada tras aprobación (evento ${instance.approvalEventId?.toString() ?? 'n/a'}).`,
      actor,
    );

    // El documento ya viene aprobado por el Approval Workflow: se restaura
    // ACTIVE y se fijan aprobador/fecha sin crear DocumentApproval adicional
    // ni repetir comunicaciones automáticas (el módulo origen ya las emite).
    return (await this.documentMasterService.updateStatus(
      document._id,
      companyId,
      DocumentStatus.ACTIVE,
      'Documento aprobado y republicado automáticamente en Gestión Documental.',
      actor,
      { approvalUser: approvedBy, approvalDate: approvedAt, skipCommunication: true },
    )) as DocumentMasterWithId;
  }

  private async findLinkedMaster(id: Types.ObjectId): Promise<DocumentMaster | null> {
    try {
      return await this.documentMasterService.findById(id);
    } catch {
      return null;
    }
  }

  private isDuplicateError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
      return false;
    }
    const candidate = error as { code?: number; status?: number; message?: string };
    return (
      candidate.code === 11000 ||
      candidate.status === 400 ||
      /already exists/i.test(candidate.message ?? '')
    );
  }
}
