import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { RendererFormat } from '../types/renderer.types';
import {
  DocumentTemplateSource,
  DocumentTemplateType,
} from '../types/document-generation.types';

export type DocumentTemplateDocument = HydratedDocument<DocumentTemplate>;

/**
 * Plantilla documental del Document Generation Engine.
 *
 * Una plantilla es la definición reutilizable de un documento SG-SST
 * (política, matriz de responsabilidades, plan anual, etc.) en formato
 * DOCX o PDF, con las variables que deben resolverse al generar.
 */
@Schema({ timestamps: true })
export class DocumentTemplate {
  /**
   * Empresa propietaria de la plantilla. Opcional: las plantillas del sistema
   * (source: SYSTEM) no pertenecen a una empresa concreta.
   */
  @Prop({ type: Types.ObjectId, ref: 'Company', index: true })
  companyId?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ required: true, enum: Object.values(DocumentTemplateType) })
  documentType!: DocumentTemplateType;

  @Prop({ required: true, enum: Object.values(RendererFormat) })
  format!: RendererFormat;

  @Prop({
    required: true,
    enum: Object.values(DocumentTemplateSource),
    default: DocumentTemplateSource.SYSTEM,
  })
  source!: DocumentTemplateSource;

  @Prop({ type: [String], default: [] })
  variables!: string[];

  @Prop({ required: true })
  storageUrl!: string;

  @Prop({ default: 1 })
  version!: number;

  @Prop({ default: true, index: true })
  active!: boolean;
}

export const DocumentTemplateSchema = SchemaFactory.createForClass(DocumentTemplate);

DocumentTemplateSchema.index({ companyId: 1, documentType: 1 });
DocumentTemplateSchema.index({ companyId: 1, active: 1 });
