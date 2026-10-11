import { InternalServerErrorException } from '@nestjs/common';
import type { Bucket } from '@google-cloud/storage';
import { getStorage } from 'firebase-admin/storage';

import { FirebaseAdminService } from '../../auth/firebase-admin.service';
import { PublicUrlCapability, StorageProvider, StorageUploadRequest } from './storage-provider.interface';
import { inferContentType } from './storage.utils';

/**
 * PROVIDER LEGACY — Firebase Storage (GCS) con objetos PÚBLICOS.
 *
 * FASE 1: encapsula el comportamiento EXACTO que hoy tiene el proyecto
 * (bucket FIREBASE_STORAGE_BUCKET con fallback a app.options.storageBucket,
 * makePublic, URL storage.googleapis.com) para que el sistema siga
 * funcionando sin STORAGE_PROVIDER configurado y para que los registros
 * históricos con fileUrl pública no se rompan.
 *
 * NO confundir con R2: este provider es temporal (Fase 2 lo dejará atrás).
 * Implementa además getSignedUrl (v4 de GCS) para que el endpoint de
 * visualización firmada de CompanyProfile funcione también en legacy.
 */
export class LegacyFirebaseStorageProvider implements StorageProvider, PublicUrlCapability {
  readonly name = 'legacy-firebase';
  readonly supportsPublicUrls = true as const;

  constructor(private readonly firebaseAdminService: FirebaseAdminService) {}

  async upload(request: StorageUploadRequest): Promise<void> {
    const bucketFile = this.getBucket().file(request.storagePath);

    await bucketFile.save(request.buffer, {
      metadata: {
        contentType: request.contentType ?? inferContentType(request.storagePath),
      },
      resumable: false,
    });

    // Compatibilidad legacy: el proyecto actual sirve los archivos públicos.
    await bucketFile.makePublic();
  }

  async download(storagePath: string): Promise<Buffer> {
    const [fileBuffer] = await this.getBucket().file(storagePath).download();
    return fileBuffer;
  }

  async delete(storagePath: string): Promise<void> {
    await this.getBucket().file(storagePath).delete();
  }

  async exists(storagePath: string): Promise<boolean> {
    const [exists] = await this.getBucket().file(storagePath).exists();
    return exists;
  }

  async getSignedUrl(storagePath: string, ttlSeconds: number): Promise<string> {
    const expires = Date.now() + ttlSeconds * 1000;
    const [signedUrl] = await this.getBucket()
      .file(storagePath)
      .getSignedUrl({ action: 'read', expires });
    return signedUrl;
  }

  /** URL pública estable (solo legacy). Idéntica a la construida hoy en el proyecto. */
  getPublicUrl(storagePath: string): string {
    return `https://storage.googleapis.com/${this.resolveBucketName()}/${storagePath}`;
  }

  private getBucket(): Bucket {
    const app = this.firebaseAdminService.getApp();
    return getStorage(app).bucket(this.resolveBucketName(app));
  }

  /**
   * Resolución del bucket con el MISMO fallback que hoy usan los controllers
   * duplicados (documents/phva-advanced): env primero, options.storageBucket
   * después. Al consolidarlos sobre el facade el comportamiento no cambia.
   */
  private resolveBucketName(app?: { options?: { storageBucket?: string } }): string {
    const bucketName =
      process.env.FIREBASE_STORAGE_BUCKET ??
      (app ?? this.safeApp())?.options?.storageBucket;

    if (!bucketName) {
      throw new InternalServerErrorException('Missing FIREBASE_STORAGE_BUCKET configuration');
    }

    return bucketName;
  }

  private safeApp(): { options: { storageBucket?: string } } | undefined {
    try {
      const options = this.firebaseAdminService.getApp().options as { storageBucket?: string };
      return { options };
    } catch {
      return undefined;
    }
  }
}
