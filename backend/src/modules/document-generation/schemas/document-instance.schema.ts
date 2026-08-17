import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { RendererFormat } from '../types/renderer.types';
import {
  DocumentSourceModule,
  DocumentStatus,
} from '../types/document-generation.types';

export type DocumentInstanceDocument = HydratedDocument<DocumentInstance>;

/**
 * Instancia documental generada para una empresa.
 *
 * Representa un documento concreto producido por el motor (por ejemplo, la
 * política SST generada desde una plantilla). Cada instancia referencia la
 * plantilla usada, el módulo y la entidad de origen, y su archivo en Storage.
 */
@Schema({ timestamps: true })
export class DocumentInstance {
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company', index: true })
  companyId!: Types.ObjectId;

  @Prop({ required: true, type: Types.ObjectId, ref: 'DocumentTemplate', index: true })
  templateId!: Types.ObjectId;

  @Prop({ required: true })
  sourceModule!: string;

  @Prop({ required: true })
  sourceEntity!: string;

  @Prop({ type: Types.ObjectId })
  sourceEntityId?: Types.ObjectId;

  @Prop({
    required: true,
    enum: Object.values(DocumentStatus),
    default: DocumentStatus.GENERATED,
  })
  status!: DocumentStatus;

  @Prop({ required: true, enum: Object.values(RendererFormat) })
  format!: RendererFormat;

  @Prop({ required: true })
  fileUrl!: string;

  @Prop({ required: true })
  storagePath!: string;

  @Prop({ default: 1 })
  version!: number;

  @Prop({ type: Types.ObjectId, ref: 'ApprovalRequest' })
  approvalRequestId?: Types.ObjectId;

  /** Estado de la aprobación que originó el documento (p.ej. 'APPROVED'). */
  @Prop()
  approvalStatus?: string;

  /** Usuario aprobador (resuelto desde el actor del Approval Workflow). */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  approvedBy?: Types.ObjectId;

  @Prop()
  approvedAt?: Date;

  /** Evento de aprobación del Approval Workflow Core (trazabilidad). */
  @Prop({ type: Types.ObjectId, ref: 'ApprovalEvent' })
  approvalEventId?: Types.ObjectId;

  /** Usuario que solicitó la generación (opcional en esta fase). */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  generatedBy?: Types.ObjectId;

  @Prop({ required: true })
  generatedAt!: Date;

  /**
   * DocumentMaster publicado automáticamente tras la aprobación (Fase 8.2.A).
   * Trazabilidad bidireccional: Gestión Documental → instancia generada.
   */
  @Prop({ type: Types.ObjectId, ref: 'DocumentMaster' })
  documentMasterId?: Types.ObjectId;

  /** Código del estándar PHVA origen (StandardCatalog, p. ej. '1.1.1'). */
  @Prop()
  standardCode?: string;

  /**
   * Código documental canónico del TIPO de documento (F7B-7, trazabilidad
   * documental). Ej.: 'PHVA-1.1.8-ACTA' / 'PHVA-1.1.8-COMP'.
   *
   * Identifica el tipo documental de forma EXPLÍCITA y ESTABLE (independiente
   * de fileUrl, storagePath, orden de generación o heurísticas del frontend).
   * El valor proviene SIEMPRE del servidor (context.document.code definido por
   * el dominio); nunca del request del cliente. Opcional por compatibilidad
   * legacy: las instancias creadas antes de F7B-7 no tienen el campo y los
   * consumidores lo reciben como null/unknown explícito.
   */
  @Prop({ trim: true })
  documentCode?: string;
}

export const DocumentInstanceSchema = SchemaFactory.createForClass(DocumentInstance);

DocumentInstanceSchema.index({ companyId: 1, sourceModule: 1, sourceEntity: 1, sourceEntityId: 1 });

// Fase 2.1 — índice compuesto ÚNICO (sparse) para evitar duplicados de
// documentos generados por la misma aprobación. Sparse porque approvalEventId
// es opcional (las instancias TEMPLATES no provienen de una aprobación): la
// unicidad solo aplica a documentos generados post-aprobación.
DocumentInstanceSchema.index(
  { companyId: 1, sourceModule: 1, sourceEntity: 1, sourceEntityId: 1, approvalEventId: 1 },
  { unique: true, sparse: true },
);

// Fase 8.2.A — índice para resolver DocumentInstance por DocumentMaster
// publicado (trazabilidad inversa Gestión Documental → instancias).
DocumentInstanceSchema.index({ documentMasterId: 1 }, { sparse: true });
