import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  CopasstOtpChallenge,
  CopasstOtpChallengeDocument,
} from './otp-challenge.schema';

/**
 * Store de desafíos OTP COMPARTIDO en MongoDB (F7B-10.6-D).
 *
 * Operaciones atómicas sobre la colección `copasst_otp_challenges`. Reemplaza
 * el `otpStore: Map` en memoria: un OTP generado en una instancia puede
 * validarse desde cualquier otra (multi-instancia) porque el desafío vive en
 * MongoDB y el pepper se comparte por configuración (env OTP_PEPPER).
 *
 * Garantías:
 * - REGENERACIÓN: `setChallenge` reemplaza atómicamente el desafío de la misma
 *   clave (upsert + $set): el OTP anterior deja de ser válido y `attempts`
 *   vuelve a 0. Dos instancias regenerando una clave nueva → E11000 del índice
 *   único → UN ÚNICO retry (mismo upsert), nunca loops.
 * - CONSUMO ÚNICO: `consumeIfMatches` borra el documento con
 *   `findOneAndDelete({ key, otpHash })`. Dos validaciones concurrentes del
 *   mismo OTP: solo la primera elimina el documento y gana; la segunda recibe
 *   null (ya consumido). Imposible consumir dos veces.
 * - ATTEMPTS COMPARTIDOS: `incrementAttempts` hace $inc atómico con filtro
 *   { key, otpHash } (si el desafío fue regenerado entre tanto, no matchea y
 *   devuelve null → el intento no cuenta contra el desafío nuevo).
 * - FAIL-CLOSED: cualquier error de MongoDB distinto del E11000 manejado se
 *   propaga y el llamador lo convierte en rechazo genérico. NUNCA hay fallback
 *   a memoria (no se reintroduce el Map).
 */
@Injectable()
export class OtpChallengeService {
  constructor(
    @InjectModel(CopasstOtpChallenge.name)
    private readonly model: Model<CopasstOtpChallengeDocument>,
  ) {}

  /**
   * Registra (o reemplaza) el desafío vigente de una clave.
   *
   * Un nuevo OTP para la misma identidad INVALIDA el anterior: $set sobrescribe
   * otpHash/expiresAt y reinicia attempts a 0. Upsert atómico; ante E11000 por
   * carrera de dos inserciones concurrentes de una clave nueva, se reintenta
   * UNA única vez la misma operación.
   */
  async setChallenge(key: string, otpHash: string, ttlMs: number): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlMs);
    const write = async () =>
      this.model
        .updateOne(
          { key },
          { $set: { otpHash, expiresAt, attempts: 0 } },
          { upsert: true },
        )
        .exec();
    try {
      await write();
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        // Carrera de regeneración de una clave nueva: retry único (el
        // documento ya existe → el upsert pasa a update).
        await write();
        return;
      }
      throw error;
    }
  }

  /** Lectura del desafío vigente de una clave (null si no existe). */
  async getChallenge(key: string): Promise<CopasstOtpChallengeDocument | null> {
    return this.model.findOne({ key }).exec();
  }

  /**
   * Incrementa atómicamente attempts del desafío SOLO si su otpHash sigue
   * siendo el vigente (filtro { key, otpHash }). Devuelve el nuevo conteo, o
   * null si el desafío fue regenerado/eliminado entre tanto.
   */
  async incrementAttempts(key: string, otpHash: string): Promise<number | null> {
    const updated = await this.model
      .findOneAndUpdate({ key, otpHash }, { $inc: { attempts: 1 } }, { new: true })
      .exec();
    return updated ? updated.attempts : null;
  }

  /**
   * Consumo atómico de un solo uso: elimina el documento SOLO si su otpHash
   * coincide. Devuelve true si lo eliminó (éxito); false si ya fue consumido o
   * reemplazado (rechazo). Bajo concurrencia, exactamente una llamada recibe
   * true.
   */
  async consumeIfMatches(key: string, otpHash: string): Promise<boolean> {
    const removed = await this.model.findOneAndDelete({ key, otpHash }).exec();
    return removed !== null;
  }

  /** Elimina el desafío (expiración lógica, agotamiento de intentos). */
  async deleteChallenge(key: string): Promise<void> {
    await this.model.deleteOne({ key }).exec();
  }
}
