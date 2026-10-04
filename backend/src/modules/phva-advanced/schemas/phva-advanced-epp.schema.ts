import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SstEppDocument = HydratedDocument<SstEpp>;

/**
 * Identidad canónica del módulo EPP.
 *
 * CORRECCIÓN DE COLISIÓN (Etapa 4.2.6): este módulo se autoidentificaba con
 * itemCode '1.2.3', pero en el catálogo normativo (catalog-60.ts) el código
 * 1.2.3 corresponde a "Curso 50 horas SG-SST" (PLANEAR). La identidad propia
 * y semánticamente correcta del módulo EPP es el estándar que representa:
 * '4.2.6' (Elementos de Protección Personal, HACER).
 *
 * COMPATIBILIDAD DE LECTURA: los documentos históricos creados con
 * itemCode '1.2.3' siguen siendo legibles (ver SST_EPP_LEGACY_ITEM_CODES);
 * NINGÚN registro nuevo se genera con el identificador incorrecto y no se
 * reescriben documentos existentes (sin migración destructiva).
 */
export const SST_EPP_ITEM_CODE = '4.2.6';

/** Valores legacy reconocidos SOLO para lectura de documentos históricos. */
export const SST_EPP_LEGACY_ITEM_CODES = ['1.2.3'] as const;

/** true si `itemCode` es una identidad válida del módulo EPP (canónica o legacy). */
export function isSstEppItemCode(itemCode: string): boolean {
  return itemCode === SST_EPP_ITEM_CODE || (SST_EPP_LEGACY_ITEM_CODES as readonly string[]).includes(itemCode);
}

export enum SstEppComplianceStatus {
  COMPLIES = 'COMPLIES',
  PENDING = 'PENDING',
  NON_COMPLIANT = 'NON_COMPLIANT',
}

export enum SstEppAssignmentStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  RETURNED = 'RETURNED',
  DAMAGED = 'DAMAGED',
  REPLACED = 'REPLACED',
}

export enum SstEppCondition {
  GOOD = 'GOOD',
  FAIR = 'FAIR',
  POOR = 'POOR',
  DAMAGED = 'DAMAGED',
}

@Schema({ _id: false })
export class SstEppCatalogItem {
  @Prop({ required: true }) eppId!: string;
  @Prop({ required: true }) name!: string;
  @Prop({ required: true }) category!: string;
  @Prop({ default: '' }) standard!: string;
  @Prop({ default: '' }) requiredFor!: string;
  @Prop({ default: 1 }) expectedLifespanMonths!: number;
  @Prop({ default: true }) active!: boolean;
}

@Schema({ _id: false })
export class SstEppAssignment {
  @Prop({ required: true }) assignmentId!: string;
  @Prop({ required: true }) employeeId!: string;
  @Prop({ required: true }) employeeName!: string;
  @Prop({ required: true }) eppItemId!: string;
  @Prop({ required: true }) eppName!: string;
  @Prop({ required: true }) deliveryDate!: Date;
  @Prop() expectedReplacementDate?: Date;
  @Prop() actualReplacementDate?: Date;
  @Prop({ default: SstEppCondition.GOOD }) condition!: string;
  @Prop({ default: 1 }) quantity!: number;
  @Prop({ default: '' }) serialNumber!: string;
  @Prop({ default: '' }) certificateUrl!: string;
  @Prop({ default: '' }) deliveredBy!: string;
  @Prop({ default: '' }) receivedBy!: string;
  @Prop({ default: '' }) signatureUrl!: string;
  @Prop({ default: SstEppAssignmentStatus.ACTIVE }) status!: string;
}

@Schema({ _id: false })
export class SstEppInspection {
  @Prop({ required: true }) inspectionId!: string;
  @Prop({ required: true }) date!: Date;
  @Prop({ required: true }) inspector!: string;
  @Prop({ required: true }) area!: string;
  @Prop({ default: '' }) findings!: string;
  @Prop({ default: 'OPEN' }) status!: string;
  @Prop({ type: [String], default: [] }) correctiveActions!: string[];
  @Prop({ type: [String], default: [] }) evidence!: string[];
}

@Schema({ _id: false })
export class SstEppHistoryEntry {
  @Prop({ required: true }) action!: string;
  @Prop({ required: true }) timestamp!: Date;
  @Prop({ required: true }) userId!: string;
  @Prop({ default: '' }) userName!: string;
  @Prop({ default: '' }) details!: string;
}

/**
 * Entidad principal EPP (1.2.3) — UNO por empresa.
 *
 * Contiene:
 * - catálogo de EPP de la empresa
 * - asignaciones a trabajadores
 * - inspecciones de EPP
 * - historial
 * - estado de cumplimiento
 */
@Schema({ timestamps: false, collection: 'phva_advanced_epp' })
export class SstEpp {
  @Prop({ required: true, type: Types.ObjectId, index: true }) companyId!: Types.ObjectId;
  // Identidad canónica '4.2.6' (antes '1.2.3' — colisión con el curso 50h).
  @Prop({ default: SST_EPP_ITEM_CODE }) itemCode!: string;
  @Prop({ default: new Date().getFullYear() }) year!: number;
  @Prop({ default: SstEppComplianceStatus.PENDING }) complianceStatus!: string;
  @Prop({ default: '' }) complianceReason!: string;

  @Prop({ type: [SstEppCatalogItem], default: [] }) catalog!: SstEppCatalogItem[];
  @Prop({ type: [SstEppAssignment], default: [] }) assignments!: SstEppAssignment[];
  @Prop({ type: [SstEppInspection], default: [] }) inspections!: SstEppInspection[];
  @Prop({ type: [SstEppHistoryEntry], default: [] }) history!: SstEppHistoryEntry[];
}

export const SstEppSchema = SchemaFactory.createForClass(SstEpp);
SstEppSchema.index({ companyId: 1, itemCode: 1 }, { unique: true });
