import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl as presignObject } from '@aws-sdk/s3-request-presigner';

import { StorageProvider, StorageUploadRequest } from './storage-provider.interface';

/** Firma del presigner, abstraída para poder mockearla en tests unitarios. */
export type StoragePresigner = (
  client: S3Client,
  command: GetObjectCommand,
  options: { expiresIn: number },
) => Promise<string>;

/** Configuración de R2 resuelta desde el entorno (sin valores por defecto inventados). */
export interface R2StorageConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Opcional: solo si se necesita un endpoint no derivable del accountId. */
  endpoint?: string;
}

/**
 * Resuelve y VALIDA la configuración R2 desde el entorno. Lanza un error
 * descriptivo con TODAS las variables faltantes (falla al construir el
 * provider, es decir, solo cuando STORAGE_PROVIDER=r2 está seleccionado:
 * sin la variable el proyecto arranca con el provider legacy).
 */
export function resolveR2Config(env: NodeJS.ProcessEnv = process.env): R2StorageConfig {
  const missing: string[] = [];
  // `?? ''` garantiza tipos `string` (el error de config se lanza abajo con la
  // lista completa de variables faltantes).
  const accountId = env.R2_ACCOUNT_ID?.trim() ?? '';
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim() ?? '';
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim() ?? '';
  const bucket = env.R2_BUCKET?.trim() ?? '';
  const endpoint = env.R2_ENDPOINT?.trim() || undefined;

  if (!accountId) missing.push('R2_ACCOUNT_ID');
  if (!accessKeyId) missing.push('R2_ACCESS_KEY_ID');
  if (!secretAccessKey) missing.push('R2_SECRET_ACCESS_KEY');
  if (!bucket) missing.push('R2_BUCKET');

  if (missing.length > 0) {
    throw new Error(
      `STORAGE_PROVIDER=r2 requires missing environment variables: ${missing.join(', ')}`,
    );
  }

  return { accountId, accessKeyId, secretAccessKey, bucket, endpoint };
}

/**
 * PROVIDER — Cloudflare R2 (API S3-compatible), modo PRIVADO.
 *
 * FASE 1: los objetos nunca se hacen públicos (no existe makePublic aquí);
 * toda lectura se realiza con signed URLs presignadas de corta duración.
 * El endpoint se deriva de R2_ACCOUNT_ID salvo que R2_ENDPOINT lo sobreescriba.
 */
export class R2StorageProvider implements StorageProvider {
  readonly name = 'r2';
  readonly supportsPublicUrls = false as const;

  private readonly client: S3Client;
  private readonly presigner: StoragePresigner;

  constructor(
    private readonly config: R2StorageConfig,
    dependencies?: { client?: S3Client; presigner?: StoragePresigner },
  ) {
    this.client =
      dependencies?.client ??
      new S3Client({
        region: 'auto',
        endpoint: config.endpoint ?? `https://${config.accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      });
    this.presigner = dependencies?.presigner ?? presignObject;
  }

  async upload(request: StorageUploadRequest): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: request.storagePath,
        Body: request.buffer,
        ...(request.contentType ? { ContentType: request.contentType } : {}),
      }),
    );
  }

  async download(storagePath: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: storagePath }),
    );
    const body = response.Body;
    if (!body) {
      throw new Error(`R2 devolvió una respuesta sin cuerpo para "${storagePath}"`);
    }
    const bytes = await body.transformToByteArray();
    return Buffer.from(bytes);
  }

  async delete(storagePath: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.config.bucket, Key: storagePath }),
    );
  }

  async exists(storagePath: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: storagePath }),
      );
      return true;
    } catch (error) {
      if (error instanceof NoSuchKey || error instanceof NotFound) {
        return false;
      }
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode;
      if (status === 404) {
        return false;
      }
      throw error;
    }
  }

  async getSignedUrl(storagePath: string, ttlSeconds: number): Promise<string> {
    return this.presigner(
      this.client,
      new GetObjectCommand({ Bucket: this.config.bucket, Key: storagePath }),
      { expiresIn: ttlSeconds },
    );
  }
}
