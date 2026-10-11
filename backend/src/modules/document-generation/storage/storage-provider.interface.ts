/**
 * CONTRATO DE ALMACENAMIENTO — agnóstico del proveedor.
 *
 * FASE 1 (abstracción R2/GCS): cualquier provider (R2, futuro GCS, legacy
 * Firebase) implementa esta interfaz. El contrato NO expone conceptos de
 * proveedor (buckets de Firebase, makePublic, storage.googleapis.com,
 * S3Client, R2Bucket...): los detalles viven dentro de cada provider.
 *
 * Los módulos de negocio SOLO dependen de StorageService, que delega aquí.
 */

/** Entrada de upload: el path ya viene construido por la capa común. */
export interface StorageUploadRequest {
  /** Contenido binario del archivo. */
  buffer: Buffer;
  /** Ruta completa dentro del storage (ej: `companies/{companyId}/company-documents/{ts}-{nombre}`). */
  storagePath: string;
  /** MIME type real del archivo (el facade lo infiere del nombre si falta). */
  contentType?: string;
}

/** Capacidad opcional: proveedores que sirven objetos públicamente (legacy Firebase). */
export interface PublicUrlCapability {
  /** URL pública estable. SOLO válido cuando `supportsPublicUrls === true`. */
  getPublicUrl(storagePath: string): string;
}

export interface StorageProvider {
  /** Identificador estable del provider (útil en logs y diagnóstico). */
  readonly name: string;
  /**
   * `true` si el provider produce URLs públicas estables (modo legacy).
   * `false` (R2 privado) indica que la lectura DEBE hacerse vía getSignedUrl
   * y que ninguna URL permanente debe persistirse en MongoDB.
   */
  readonly supportsPublicUrls: boolean;
  upload(request: StorageUploadRequest): Promise<void>;
  download(storagePath: string): Promise<Buffer>;
  delete(storagePath: string): Promise<void>;
  exists(storagePath: string): Promise<boolean>;
  /**
   * URL temporal de LECTURA para un objeto privado. Es responsabilidad del
   * caller NO persistirla: caduca tras `ttlSeconds`.
   */
  getSignedUrl(storagePath: string, ttlSeconds: number): Promise<string>;
}

/** Token de inyección NestJS del provider activo. */
export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');

/**
 * TTL por defecto de las signed URLs (5 minutos): suficientes para abrir el
 * documento, lo bastante corto para no ser un "enlace permanente" disfrazado.
 * Configurable con STORAGE_SIGNED_URL_TTL_SECONDS (no obligatorio).
 */
export const DEFAULT_SIGNED_URL_TTL_SECONDS = 300;

/** Mínimo razonable: por debajo de 30s una URL sería inutilizable en la práctica. */
export const MIN_SIGNED_URL_TTL_SECONDS = 30;

/**
 * Resuelve el TTL de las signed URLs desde el entorno, con default seguro y
 * sin requerir configuración manual para arrancar.
 */
export function resolveSignedUrlTtlSeconds(raw?: string): number {
  const value = raw ?? process.env.STORAGE_SIGNED_URL_TTL_SECONDS;
  const parsed = value ? Number.parseInt(value, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_SIGNED_URL_TTL_SECONDS;
  }
  return Math.max(parsed, MIN_SIGNED_URL_TTL_SECONDS);
}
