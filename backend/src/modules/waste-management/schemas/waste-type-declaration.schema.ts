import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { WasteType } from './waste-management-record.schema';

export type WasteTypeDeclarationDocument = HydratedDocument<WasteTypeDeclaration>;

/**
 * Declaración explícita de los tipos de residuo REALMENTE generados por la
 * empresa (3.1.9 — FASE 34C, criterio C1).
 *
 * PROPÓSITO (§17 de la fase): el denominador de cobertura C1 es
 * "tipos cubiertos / tipos realmente generados". NO se asume que toda empresa
 * genera los tres tipos (no se penaliza artificialmente un tipo que la
 * empresa razonablemente no genera), y NO se infieren tipos desde Risk,
 * sustancias ni mediciones.
 *
 * Es una metadata operativa MÍNIMA y documentada dentro del propio módulo —
 * NO es un Applicability Engine. Un documento por empresa (companyId único).
 * Si no existe declaración, el provider usa como denominador los tipos que
 * la propia empresa ya registra (cobertura mínima demostrable).
 */
@Schema({ timestamps: true, collection: 'wastetypedeclarations' })
export class WasteTypeDeclaration {
  /** Empresa propietaria de la declaración (tenant isolation; único). */
  @Prop({ required: true, type: Types.ObjectId, ref: 'Company' })
  companyId!: Types.ObjectId;

  /** Tipos de residuo que la empresa declara generar (enum cerrado). */
  @Prop({ required: true, type: [String], enum: Object.values(WasteType) })
  declaredWasteTypes!: WasteType[];

  /** UID del usuario que declaró/actualizó. */
  @Prop({ trim: true, maxlength: 128 })
  updatedBy?: string;
}

export const WasteTypeDeclarationSchema =
  SchemaFactory.createForClass(WasteTypeDeclaration);

// Una declaración por empresa (tenant-scoped).
WasteTypeDeclarationSchema.index({ companyId: 1 }, { unique: true });
