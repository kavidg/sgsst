import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * Contador distribuido del rate-limit de solicitudes OTP (F7B-10.5-B).
 *
 * Reemplaza el `Map<string, number[]>` en memoria de F7B-10.2 por un contador
 * persistente en MongoDB, atómico y seguro en multi-instancia. Almacena
 * ÚNICAMENTE lo necesario para el bucket: clave, conteo y expiración.
 * NUNCA OTP, otpHash, email, secretos ni datos de negocio.
 *
 * - `key`: clave única del bucket (`${electionId}:${document}:${phone}`).
 * - `count`: solicitudes registradas en la ventana vigente (máx. 3).
 * - `expiresAt`: fin de la ventana fijado SOLO al crear el contador
 *   ($setOnInsert); las solicitudes posteriores NO extienden la ventana.
 */
@Schema({ collection: 'otp_rate_limit_counters' })
export class OtpRateLimitCounter {
  @Prop({ required: true })
  key!: string;

  @Prop({ required: true, default: 0 })
  count!: number;

  @Prop({ required: true, type: Date })
  expiresAt!: Date;
}

export type OtpRateLimitCounterDocument = HydratedDocument<OtpRateLimitCounter>;

export const OtpRateLimitCounterSchema = SchemaFactory.createForClass(OtpRateLimitCounter);

/**
 * Índice único sobre `key`: respalda la atomicidad del upsert (dos procesos
 * concurrentes sobre la misma clave no pueden crear buckets duplicados) y
 * produce el error E11000 que el servicio usa para detectar el límite
 * alcanzado cuando el filtro `count < MAX` deja de matchear.
 */
OtpRateLimitCounterSchema.index({ key: 1 }, { unique: true });

/**
 * Índice TTL: MongoDB elimina automáticamente el contador cuando `expiresAt`
 * vence (expireAfterSeconds: 0 → expira exactamente en expiresAt). El
 * servicio además maneja la expiración LÓGICA (ventana vencida antes de que
 * el monitor TTL purgue), de modo que la ventana se reabre sin esperar el
 * ciclo de purga.
 */
OtpRateLimitCounterSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
