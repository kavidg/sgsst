import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * Desafío OTP COMPARTIDO del flujo electoral COPASST (F7B-10.6-D).
 *
 * Reemplaza el `Map<string, CopasstOtpEntry>` en memoria (por proceso) por un
 * almacenamiento persistente en MongoDB, seguro en múltiples instancias y
 * sobreviviente a reinicios. Almacena ÚNICAMENTE lo necesario para el
 * desafío: clave, verificador criptográfico, expiración e intentos fallidos.
 *
 * NUNCA almacena el OTP en texto plano, ni otpPreview, ni secretos, ni
 * pepper, ni datos de negocio (no companyId: la clave del desafío es
 * `${electionId}:${document}:${phone}` y el pepper es de proceso/config).
 *
 * - `key`: identifica inequívocamente el desafío vigente de una identidad.
 * - `otpHash`: verificador HMAC-SHA256 (hex, 64 chars) — F7B-10.1.
 * - `expiresAt`: vencimiento (TTL 5 min). El índice TTL (expireAfterSeconds:
 *   0) purga el documento; la lógica de negocio también expira de forma
 *   lógica sin depender del ciclo del monitor TTL.
 * - `attempts`: intentos fallidos compartidos entre instancias (máx. 5).
 * - `createdAt`: solo metadata.
 */
@Schema({ collection: 'copasst_otp_challenges' })
export class CopasstOtpChallenge {
  @Prop({ required: true })
  key!: string;

  @Prop({ required: true })
  otpHash!: string;

  @Prop({ required: true, type: Date })
  expiresAt!: Date;

  @Prop({ required: true, default: 0 })
  attempts!: number;

  @Prop({ type: Date, default: Date.now })
  createdAt?: Date;
}

export type CopasstOtpChallengeDocument = HydratedDocument<CopasstOtpChallenge>;

export const CopasstOtpChallengeSchema = SchemaFactory.createForClass(CopasstOtpChallenge);

/**
 * Índice único sobre `key`: respalda el reemplazo/regeneración atómica del
 * desafío vigente (un nuevo OTP de la misma identidad invalida el anterior) y
 * produce el error E11000 que el servicio maneja con un único retry cuando dos
 * instancias regeneran concurrentemente una clave nueva.
 */
CopasstOtpChallengeSchema.index({ key: 1 }, { unique: true });

/** Índice TTL: MongoDB elimina los desafíos cuyo expiresAt ya venció. */
CopasstOtpChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
