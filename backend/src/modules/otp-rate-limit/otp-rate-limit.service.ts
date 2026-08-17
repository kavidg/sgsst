import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OtpRateLimitCounter, OtpRateLimitCounterDocument } from './otp-rate-limit.schema';

/** Máximo de solicitudes de OTP por ventana por clave (sin cambios vs F7B-10.2). */
export const OTP_RATE_LIMIT_MAX = 3;
/** Ventana del rate-limit: 10 minutos (sin cambios vs F7B-10.2). */
export const OTP_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

/** Mensaje genérico: no revela si el contador existe ni su configuración. */
const RATE_LIMIT_MESSAGE = 'Demasiadas solicitudes de OTP. Intente nuevamente más tarde.';
/** Mensaje genérico del rate-limit de registro público (F7B-10.6-A). */
const GENERIC_RATE_LIMIT_MESSAGE = 'Demasiadas solicitudes. Intente nuevamente más tarde.';

/**
 * Rate-limit DISTRIBUIDO de solicitudes OTP (F7B-10.5-B).
 *
 * Reemplaza el rate-limit local en memoria (Map<string, number[]>) de
 * F7B-10.2 por un contador persistente y atómico en MongoDB, seguro en
 * multi-instancia y sobreviviente a reinicios. Independiente de
 * MAX_OTP_ATTEMPTS (intentos de validación del OTP vigente).
 *
 * La ventana se fija SOLO al crear el contador ($setOnInsert): las solicitudes
 * posteriores NUNCA extienden `expiresAt`. Al vencer, el índice TTL purga el
 * documento y la ventana se reabre; además, el servicio maneja la expiración
 * LÓGICA (contador vencido que el monitor TTL aún no purgó) reiniciándolo de
 * forma atómica para no depender del ciclo del TTL.
 */
@Injectable()
export class OtpRateLimitService {
  constructor(
    @InjectModel(OtpRateLimitCounter.name)
    private readonly counterModel: Model<OtpRateLimitCounterDocument>,
  ) {}

  /**
   * Autoriza una solicitud de OTP para la clave dada, o rechaza con un error
   * genérico cuando se superó el máximo en la ventana vigente.
   *
   * Atomicidad: UNA operación findOneAndUpdate con filtro `count < MAX` +
   * $inc + upsert + $setOnInsert. El chequeo del límite y el incremento son
   * una sola operación atómica (nunca find() + update() separados).
   *
   * Concurrencia: dos solicitudes simultáneas sobre una clave nueva compiten
   * por el mismo upsert; el perdedor recibe E11000 (índice único) y se
   * reintenta UNA única vez la misma operación atómica (nunca loops). Cuando
   * el contador ya está lleno, el filtro no matchea → el upsert intenta
   * insertar una clave duplicada → E11000 → tras el reintento fallido se
   * rechaza (o se reinicia la ventana si venció lógicamente).
   *
   * Fail-closed: cualquier error de MongoDB distinto del E11000 manejado
   * explícitamente rechaza la solicitud con el mismo mensaje genérico; NUNCA
   * hay fallback a memoria (no se reintroduce el Map).
   */
  async assertOtpRateLimit(key: string): Promise<void> {
    // F7B-10.6-A: delega en el rate-limit genérico con las constantes OTP
    // (misma operación atómica, límite/ventana de F7B-10.2 sin cambios).
    await this.assertRateLimit(
      key,
      OTP_RATE_LIMIT_MAX,
      OTP_RATE_LIMIT_WINDOW_MS,
      RATE_LIMIT_MESSAGE,
    );
  }

  /**
   * Rate-limit DISTRIBUIDO genérico (F7B-10.6-A): misma operación atómica
   * (findOneAndUpdate + $inc + $setOnInsert + upsert), E11000 con máximo un
   * retry, expiración lógica y fail-closed, pero con límite/ventana/mensaje
   * configurables. Permite reutilizar el mecanismo de F7B-10.5-B para otros
   * flujos (p. ej. el registro público de candidatos COPASST) sin duplicar
   * infraestructura ni reintroducir Maps en memoria.
   */
  async assertRateLimit(
    key: string,
    max: number,
    windowMs: number,
    message: string = GENERIC_RATE_LIMIT_MESSAGE,
  ): Promise<void> {
    try {
      // Éxito → la solicitud quedó registrada en la ventana vigente.
      await this.incrementIfBelowLimit(key, max, windowMs);
      return;
    } catch (error) {
      if (!this.isDuplicateKeyError(error)) {
        // Fail-closed: MongoDB caído/error inesperado → rechazo genérico.
        throw new BadRequestException(message);
      }
      // E11000: reintento ÚNICO de la misma operación atómica.
      try {
        await this.incrementIfBelowLimit(key, max, windowMs);
        return;
      } catch (retryError) {
        if (!this.isDuplicateKeyError(retryError)) {
          throw new BadRequestException(message);
        }
      }
      // Dos E11000 consecutivos: contador existente y lleno (o vencido sin
      // purgar). Antes de rechazar se evalúa la expiración LÓGICA: si la
      // ventana venció, se reinicia de forma atómica y la solicitud actual es
      // la primera (count=1) de la nueva ventana.
      if (await this.resetIfLogicallyExpired(key, windowMs)) return;
      throw new BadRequestException(message);
    }
  }

  /**
   * Operación atómica: incrementa el contador SOLO si está por debajo del
   * límite y dentro de una ventana NO vencida. `expiresAt` se fija únicamente
   * en el insert ($setOnInsert): las solicitudes posteriores no extienden la
   * ventana. Si el filtro no matchea (contador lleno o vencido) y existe el
   * documento, el upsert colisiona con el índice único (E11000), señal que el
   * llamador maneja.
   */
  private async incrementIfBelowLimit(
    key: string,
    max: number,
    windowMs: number,
  ): Promise<void> {
    const now = new Date();
    // upsert + new:true nunca devuelve null (o inserta o actualiza, o lanza
    // E11000 si la clave ya existe y el filtro no matchea). Guarda defensiva
    // siguiendo la convención de F7B-6.
    const doc = await this.counterModel
      .findOneAndUpdate(
        {
          key,
          count: { $lt: max },
          expiresAt: { $gt: now },
        },
        {
          $inc: { count: 1 },
          $setOnInsert: {
            expiresAt: new Date(now.getTime() + windowMs),
          },
        },
        { upsert: true, new: true },
      )
      .exec();
    if (!doc) throw new Error('No se pudo registrar la solicitud');
  }

  /**
   * Expiración LÓGICA: reinicia el contador de forma atómica SOLO si
   * `expiresAt` ya venció (ventana vencida que el monitor TTL aún no purgó).
   * La solicitud actual queda como primera (count=1) de la nueva ventana.
   */
  private async resetIfLogicallyExpired(key: string, windowMs: number): Promise<boolean> {
    const now = new Date();
    const doc = await this.counterModel
      .findOneAndUpdate(
        { key, expiresAt: { $lte: now } },
        {
          $set: {
            count: 1,
            expiresAt: new Date(now.getTime() + windowMs),
          },
        },
        { new: true },
      )
      .exec();
    return doc !== null;
  }

  /** Detecta el error E11000 (clave duplicada) de MongoDB. */
  private isDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: number }).code === 11000
    );
  }
}
