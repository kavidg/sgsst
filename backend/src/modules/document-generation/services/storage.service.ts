import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { getStorage } from 'firebase-admin/storage';
import { FirebaseAdminService } from '../../auth/firebase-admin.service';

/** Resultado de un upload a Firebase Storage. */
export interface StorageUploadResult {
  fileUrl: string;
  storagePath: string;
}

/**
 * Servicio centralizado de Storage (Firebase Storage).
 *
 * Encapsula la lógica repetida que hoy existe en templates.controller,
 * documents.controller y phva-advanced.controller (getStorage → bucket →
 * save → makePublic). Fase 0: ningún controller existente se migra todavía;
 * este servicio queda como la base para futuras fases.
 */
@Injectable()
export class StorageService {
  constructor(private readonly firebaseAdminService: FirebaseAdminService) {}

  /**
   * Sube un buffer a Firebase Storage y lo deja público.
   *
   * @param fileBuffer - Contenido binario del archivo.
   * @param filename - Nombre original del archivo (se sanitiza).
   * @param folder - Carpeta destino dentro del bucket.
   */
  async upload(fileBuffer: Buffer, filename: string, folder: string): Promise<StorageUploadResult> {
    const bucket = this.getBucket();
    const sanitizedName = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `${folder}/${Date.now()}-${sanitizedName}`;
    const bucketFile = bucket.file(storagePath);

    await bucketFile.save(fileBuffer, {
      metadata: { contentType: this.inferContentType(filename) },
      resumable: false,
    });

    await bucketFile.makePublic();

    return {
      fileUrl: this.getPublicUrl(storagePath),
      storagePath,
    };
  }

  /**
   * Descarga el contenido de un archivo desde Firebase Storage.
   */
  async download(path: string): Promise<Buffer> {
    const bucket = this.getBucket();
    const [fileBuffer] = await bucket.file(path).download();
    return fileBuffer;
  }

  /**
   * Elimina un archivo de Firebase Storage.
   */
  async delete(path: string): Promise<void> {
    const bucket = this.getBucket();
    await bucket.file(path).delete();
  }

  /**
   * Construye la URL pública de un archivo almacenado.
   */
  getPublicUrl(path: string): string {
    const bucketName = this.getBucketName();
    return `https://storage.googleapis.com/${bucketName}/${path}`;
  }

  private getBucket() {
    const app = this.firebaseAdminService.getApp();
    return getStorage(app).bucket(this.getBucketName());
  }

  private getBucketName(): string {
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET;

    if (!bucketName) {
      throw new InternalServerErrorException('Missing FIREBASE_STORAGE_BUCKET configuration');
    }

    return bucketName;
  }

  private inferContentType(filename: string): string {
    const normalized = filename.toLowerCase();

    if (normalized.endsWith('.pdf')) {
      return 'application/pdf';
    }

    if (normalized.endsWith('.docx')) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }

    if (normalized.endsWith('.doc')) {
      return 'application/msword';
    }

    return 'application/octet-stream';
  }
}
