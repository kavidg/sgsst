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

/** Firma del presigner, abstracta para poder injectarla/mockearla en tests. */
export type B2Presigner = (
  client: S3Client,
  command: GetObjectCommand,
  options: { expiresIn: number },
) => Promise<string>;

/** Configuración de Backblaze B2 resuelta desde el entorno (sin defaults inventados). */
export interface B2StorageConfig {
  /** Endpoint S3-compatible de la cuenta/bucket (ej: `https://s3.us-west-004.backblazeb2.com`). */
  endpoint: string;
  keyId: string;
  applicationKey: string;
  bucket: string;
}

/**
 * Resuelve y VALIDA la configuración B2 desde el entorno. Lanza un error
 * descriptivo con TODAS las variables faltantes (falla al construir el
 * provider, es decir, solo cuando STORAGE_PROVIDER=b2 está seleccionado).
 *
 * B2 usa su API S3-compatible; el endpoint S3 REAL de la cuenta es
 * OBLIGATORIO porque no puede derivarse de forma segura del keyId.
 * No hay fallback silencioso: el usuario seleccionó b2 explícitamente.
 */
export function resolveB2Config(env: NodeJS.ProcessEnv = process.env): B2StorageConfig {
  const missing: string[] = [];
  // `?? ''` garantiza tipos `string` (el error de config se lanza abajo con la
  // lista completa de variables faltantes).
  const endpoint = env.B2_ENDPOINT?.trim() ?? '';
  const keyId = env.B2_KEY_ID?.trim() ?? '';
  const applicationKey = env.B2_APPLICATION_KEY?.trim() ?? '';
  const bucket = env.B2_BUCKET?.trim() ?? '';

  if (!endpoint) missing.push('B2_ENDPOINT');
  if (!keyId) missing.push('B2_KEY_ID');
  if (!applicationKey) missing.push('B2_APPLICATION_KEY');
  if (!bucket) missing.push('B2_BUCKET');

  if (missing.length > 0) {
    throw new Error(
      `STORAGE_PROVIDER=b2 requires missing environment variables: ${missing.join(', ')}`,
    );
  }

  return { endpoint, keyId, applicationKey, bucket };
}

/**
 * PROVIDER — Backblaze B2 (API S3-compatible), modo PRIVADO.
 *
 * Debe usarse con un bucket PRIVADO (Application Key limitada al bucket):
 * los objetos NUNCA se hacen públicos (no existe makePublic aquí) y toda
 * lectura se realiza con signed URLs presignadas de duración TEMPORAL
 * (TTL exacto recibido por el contrato; NUNCA persistidas).
 *
 * Reutiliza los paquetes AWS ya presentes en el proyecto
 * (@aws-sdk/client-s3 + @aws-sdk/s3-request-presigner): no se necesita un
 * SDK específico de Backblaze.
 */
export class B2StorageProvider implements StorageProvider {
  readonly name = 'b2';
  readonly supportsPublicUrls = false as const;

  private readonly client: S3Client;
  private readonly presigner: B2Presigner;

  constructor(
    private readonly config: B2StorageConfig,
    dependencies?: { client?: S3Client; presigner?: B2Presigner },
  ) {
    this.client =
      dependencies?.client ??
      new S3Client({
        // B2 no requiere región explícita en el client: el endpoint S3
        // regional (B2_ENDPOINT) es el que determina la ubicación de los
        // objetos. `region: 'us-east-1'` es solo el valor placeholder que el
        // SDK exige; B2 lo ignora cuando se fija un endpoint explícito.
        endpoint: config.endpoint,
        region: 'us-east-1',
        //
        // INCOMPATIBILIDAD B2 CONOCIDA (@aws-sdk/client-s3 3.1147.0):
        // por defecto el SDK añade `Expect: 100-continue` a los PutObject
        // (middleware addExpectContinue, umbral 2 MiB). B2 puede responder
        // 400 IncompleteBody de forma anticipada sin consumir el body y con
        // Connection: close, lo que hace que Node aborte el envío del buffer
        // completo y B2 reciba menos bytes que el Content-Length declarado.
        // Desactivamos el header (corrección mínima, compatible con el SDK
        // actual): el body se envía completo de una vez, sin cambiar el
        // contrato StorageProvider ni afectar a R2/Firebase.
        expectContinueHeader: false,
        credentials: {
          accessKeyId: config.keyId,
          secretAccessKey: config.applicationKey,
        },
        forcePathStyle: true,
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      });
    this.presigner = dependencies?.presigner ?? presignObject;
  }

  async upload(request: StorageUploadRequest): Promise<void> {
    // Sin makePublic: el bucket debe permanecer PRIVADO. El storagePath ya
    // viene construido por StorageService y NO se modifica aquí.
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
      throw new Error(`B2 devolvió una respuesta sin cuerpo para "${storagePath}"`);
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
    // URL temporal de LECTURA con EXACTAMENTE el TTL recibido. El caller es
    // responsable de NO persistirla (caduca tras ttlSeconds).
    return this.presigner(
      this.client,
      new GetObjectCommand({ Bucket: this.config.bucket, Key: storagePath }),
      { expiresIn: ttlSeconds },
    );
  }
}
