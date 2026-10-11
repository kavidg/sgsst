import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import {
  R2StorageProvider,
  StoragePresigner,
  resolveR2Config,
} from './r2-storage.provider';

/**
 * FASE 1 — Tests del R2StorageProvider SIN credenciales reales:
 * el cliente S3 y el presigner se inyectan como mocks.
 */

function buildProvider(overrides?: {
  send?: (command: unknown) => Promise<unknown>;
  presigner?: StoragePresigner;
  config?: Partial<Parameters<typeof resolveR2Config>[0]>;
}): { provider: R2StorageProvider; sent: unknown[] } {
  const sent: unknown[] = [];
  const config = resolveR2Config({
    R2_ACCOUNT_ID: 'test-account-id',
    R2_ACCESS_KEY_ID: 'test-access-key',
    R2_SECRET_ACCESS_KEY: 'test-secret',
    R2_BUCKET: 'test-bucket',
    ...overrides?.config,
  } as unknown as NodeJS.ProcessEnv);

  const client = {
    send: async (command: unknown) => {
      sent.push(command);
      if (overrides?.send) return overrides.send(command);
      return { Body: { transformToByteArray: async () => [1, 2, 3] } };
    },
  } as unknown as S3Client;

  const provider = new R2StorageProvider(config, {
    client,
    presigner:
      overrides?.presigner ??
      (async () => 'https://signed.example/test-bucket/key?X-Amz-Signature=abc'),
  });
  return { provider, sent };
}

describe('resolveR2Config', () => {
  it('lanza error descriptivo listando TODAS las variables faltantes', () => {
    assert.throws(
      () => resolveR2Config({} as NodeJS.ProcessEnv),
      (error: Error) =>
        /R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET/.test(error.message),
    );
  });

  it('acepta configuración completa y deriva el endpoint del accountId', () => {
    const config = resolveR2Config({
      R2_ACCOUNT_ID: 'acc',
      R2_ACCESS_KEY_ID: 'ak',
      R2_SECRET_ACCESS_KEY: 'sk',
      R2_BUCKET: 'bucket',
    } as unknown as NodeJS.ProcessEnv);
    assert.equal(config.endpoint, undefined);
  });

  it('respeta R2_ENDPOINT cuando está presente', () => {
    const config = resolveR2Config({
      R2_ACCOUNT_ID: 'acc',
      R2_ACCESS_KEY_ID: 'ak',
      R2_SECRET_ACCESS_KEY: 'sk',
      R2_BUCKET: 'bucket',
      R2_ENDPOINT: 'https://custom.example',
    } as unknown as NodeJS.ProcessEnv);
    assert.equal(config.endpoint, 'https://custom.example');
  });
});

describe('R2StorageProvider (mock)', () => {
  const uploadRequest = {
    buffer: Buffer.from('contenido'),
    storagePath: 'companies/abc/company-documents/123-acta.pdf',
    contentType: 'application/pdf',
  };

  it('upload envía PutObjectCommand con bucket, key y contentType (sin makePublic)', async () => {
    const { provider, sent } = buildProvider();
    await provider.upload(uploadRequest);

    assert.equal(sent.length, 1);
    assert.ok(sent[0] instanceof PutObjectCommand);
    assert.equal(sent[0].input.Bucket, 'test-bucket');
    assert.equal(sent[0].input.Key, uploadRequest.storagePath);
    assert.equal(sent[0].input.ContentType, 'application/pdf');
    assert.ok(provider.supportsPublicUrls === false, 'R2 debe ser privado');
  });

  it('download devuelve el contenido como Buffer', async () => {
    const { provider } = buildProvider();
    const buffer = await provider.download('ruta/archivo.pdf');
    assert.ok(Buffer.isBuffer(buffer));
    assert.deepEqual([...buffer], [1, 2, 3]);
  });

  it('delete envía DeleteObjectCommand con bucket y key', async () => {
    const { provider, sent } = buildProvider();
    await provider.delete('ruta/archivo.pdf');
    assert.ok(sent[0] instanceof DeleteObjectCommand);
    assert.equal(sent[0].input.Key, 'ruta/archivo.pdf');
  });

  it('exists devuelve true con HeadObjectCommand exitoso', async () => {
    const { provider, sent } = buildProvider();
    assert.equal(await provider.exists('ruta/archivo.pdf'), true);
    assert.ok(sent[0] instanceof HeadObjectCommand);
  });

  it('exists devuelve false ante NoSuchKey/NotFound', async () => {
    const { NoSuchKey } = await import('@aws-sdk/client-s3');
    const { provider } = buildProvider({
      send: async () => {
        throw new NoSuchKey({ message: 'no such key', $metadata: {} });
      },
    });
    assert.equal(await provider.exists('inexistente.pdf'), false);
  });

  it('exists devuelve false ante un 404 genérico y propaga otros errores', async () => {
    const notFoundError = Object.assign(new Error('not found'), {
      $metadata: { httpStatusCode: 404 },
    });
    const { provider } = buildProvider({
      send: async () => {
        throw notFoundError;
      },
    });
    assert.equal(await provider.exists('inexistente.pdf'), false);

    const { provider: strictProvider } = buildProvider({
      send: async () => {
        throw new Error('network down');
      },
    });
    await assert.rejects(() => strictProvider.exists('x'), /network down/);
  });

  it('getSignedUrl usa el presigner con el TTL solicitado (URL temporal, no permanente)', async () => {
    const presignerCalls: Array<{ expiresIn: number }> = [];
    const { provider } = buildProvider({
      presigner: async (_client, _command, options) => {
        presignerCalls.push({ expiresIn: options.expiresIn });
        return `https://signed.example/objeto?ttl=${options.expiresIn}`;
      },
    });

    const signedUrl = await provider.getSignedUrl('companies/abc/company-documents/x.pdf', 120);

    assert.equal(signedUrl, 'https://signed.example/objeto?ttl=120');
    assert.equal(presignerCalls[0].expiresIn, 120);
  });

  it('getSignedUrl firma un GetObjectCommand sobre el bucket y key correctos', async () => {
    let signedCommand: GetObjectCommand | undefined;
    const { provider } = buildProvider({
      presigner: async (_client, command) => {
        signedCommand = command;
        return 'https://signed.example/x';
      },
    });
    await provider.getSignedUrl('companies/abc/company-documents/x.pdf', 300);
    assert.ok(signedCommand instanceof GetObjectCommand);
    assert.equal(signedCommand!.input.Key, 'companies/abc/company-documents/x.pdf');
    assert.equal(signedCommand!.input.Bucket, 'test-bucket');
  });

  it('propaga los errores del proveedor en upload (fallo controlado, no silencio)', async () => {
    const { provider } = buildProvider({
      send: async () => {
        throw new Error('R2 unavailable');
      },
    });
    await assert.rejects(() => provider.upload(uploadRequest), /R2 unavailable/);
  });
});
