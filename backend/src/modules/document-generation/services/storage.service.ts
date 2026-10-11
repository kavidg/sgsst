import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';

import {
  DEFAULT_SIGNED_URL_TTL_SECONDS,
  PublicUrlCapability,
  STORAGE_PROVIDER,
  StorageProvider,
  resolveSignedUrlTtlSeconds,
} from '../storage/storage-provider.interface';
import { buildStoragePath, inferContentType } from '../storage/storage.utils';

/** Resultado de un upload. `fileUrl` es '' en providers privados (ej: R2). */
export interface StorageUploadResult {
  fileUrl: string;
  storagePath: string;
}

/** Resultado de una signed URL bajo demanda. NUNCA persistir `signedUrl`. */
export interface StorageSignedUrlResult {
  signedUrl: string;
  expiresIn: number;
}

export interface StorageUploadOptions {
  /** MIME type real del archivo (p. ej. file.mimetype de multer). */
  contentType?: string;
}

/**
 * FACHADA de almacenamiento — agnóstica del proveedor.
 *
 * FASE 1: delega en un StorageProvider inyectado (legacy Firebase por defecto,
 * Cloudflare R2 con STORAGE_PROVIDER=r2). Los módulos de negocio NO conocen
 * el proveedor.
 *
 * Compatibilidad con consumidores existentes:
 * - upload/download/delete mantienen su firma actual.
 * - getPublicUrl se conserva para el modo legacy (URLs públicas históricas);
 *   en providers privados (R2) no existe URL pública estable y lanza error
 *   controlado — la lectura debe hacerse con getSignedUrl().
 * - Nuevos: exists() y getSignedUrl().
 */
@Injectable()
export class StorageService {
  constructor(@Inject(STORAGE_PROVIDER) private readonly provider: StorageProvider) {}

  /**
   * Sube un buffer y devuelve la ruta de storage (y la URL pública SOLO en
   * providers públicos; '' en privados — la URL firmada se pide bajo demanda).
   *
   * @param fileBuffer - Contenido binario del archivo.
   * @param filename - Nombre original del archivo (se sanitiza).
   * @param folder - Carpeta destino (p. ej. `companies/{companyId}/company-documents`).
   * @param options - ContentType real del archivo; si falta, se infiere por extensión.
   */
  async upload(
    fileBuffer: Buffer,
    filename: string,
    folder: string,
    options?: StorageUploadOptions,
  ): Promise<StorageUploadResult> {
    const storagePath = buildStoragePath(folder, filename);

    await this.provider.upload({
      buffer: fileBuffer,
      storagePath,
      contentType: options?.contentType ?? inferContentType(filename),
    });

    return {
      fileUrl: this.provider.supportsPublicUrls
        ? this.getPublicUrl(storagePath)
        : '',
      storagePath,
    };
  }

  /** Descarga el contenido de un archivo. */
  async download(path: string): Promise<Buffer> {
    return this.provider.download(path);
  }

  /** Elimina un archivo del proveedor activo. */
  async delete(path: string): Promise<void> {
    await this.provider.delete(path);
  }

  /** Indica si un archivo existe en el proveedor activo. */
  async exists(path: string): Promise<boolean> {
    return this.provider.exists(path);
  }

  /**
   * Genera una URL temporal de LECTURA (bajo demanda, NUNCA persistida).
   * TTL: STORAGE_SIGNED_URL_TTL_SECONDS o 300s por defecto.
   */
  async getSignedUrl(path: string, ttlSeconds?: number): Promise<StorageSignedUrlResult> {
    const expiresIn = ttlSeconds ?? resolveSignedUrlTtlSeconds();
    const signedUrl = await this.provider.getSignedUrl(path, expiresIn);
    return { signedUrl, expiresIn };
  }

  /**
   * COMPATIBILIDAD LEGACY — URL pública estable. Solo válida en el provider
   * legacy (Firebase con objetos públicos). En providers privados (R2) no
   * existe: usar getSignedUrl().
   */
  getPublicUrl(path: string): string {
    if (!this.provider.supportsPublicUrls) {
      throw new InternalServerErrorException(
        `El provider "${this.provider.name}" es privado: no hay URL pública estable. Use getSignedUrl().`,
      );
    }
    return (this.provider as StorageProvider & PublicUrlCapability).getPublicUrl(path);
  }

  /** TTL por defecto centralizado (exposto para documentación/tests). */
  get defaultSignedUrlTtlSeconds(): number {
    return DEFAULT_SIGNED_URL_TTL_SECONDS;
  }
}
