import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

/**
 * ETAPA 1 (PHVA 4.2.2) — Medida de control estructurada.
 *
 * Subdocumento embebido en `Risk.controls[]` que convive con el string
 * legacy `Risk.controlMeasures` (Estrategia 2 aprobada en auditoría):
 * - El string legacy NO se elimina ni se cambia de tipo: 4.2.1 y 4.2.3
 *   siguen leyéndolo sin cambios.
 * - No existe parser automático: un ControlMeasure se crea de forma
 *   explícita (servicio/bootstrap o DTO estructurado).
 *
 * Identidad estable: cada subdocumento conserva su `_id` (ObjectId)
 * generado por Mongoose; el virtual `id` expone su representación hex
 * como string. Ese `id` es la referencia que usará la futura
 * `ControlVerification` (etapa posterior).
 *
 * Eliminación: no se contempla borrado físico en esta etapa. Una medida
 * que deja de aplicarse se desactiva con `isActive = false`, conservando
 * el texto histórico para trazabilidad futura.
 */
@Schema({ timestamps: true })
export class ControlMeasure {
  /** Descripción de la medida. Obligatoria y no vacía (trim del schema). */
  @Prop({ required: true, trim: true })
  description!: string;

  /** Medida vigente. Default true; desactivación (no borrado) = false. */
  @Prop({ type: Boolean, default: true })
  isActive!: boolean;
}

export const ControlMeasureSchema = SchemaFactory.createForClass(ControlMeasure);

export type ControlMeasureDocument = Types.Subdocument<Types.ObjectId> & ControlMeasure;
