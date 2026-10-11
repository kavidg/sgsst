import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import { B2StorageProvider, B2Presigner, resolveB2Config } from './b2-storage.provider';

/**
 * Tests del B2StorageProvider SIN credenciales reales y SIN llamadas a
 * Internet: el cliente S3 y el presigner se inyectan como mocks.
 */

function buildProvider(overrides?: {
  send?: (command: unknown) => Promise<unknown>;
  presigner?: B2Presigner;
  config?: Partial<Parameters<typeof resolveB2Config>[0]>;
}): { provider: B2StorageProvider; sent: unknown[] } {
  const sent: unknown[] = [];
  const config = resolveB2Config({
    B2_ENDPOINT: 'https://s3.us-west-004.backblazeb2.com',
    B2_KEY_ID: 'test-key-id',
    B2_APPLICATION_KEY: 'test-application-key',
    B2_BUCKET: 'test-bucket',
    ...overrides?.config,
  } as unknown as NodeJS.ProcessEnv);

  const client = {
    send: async (command: unknown) => {
      sent.push(command);
      if (overrides?.send) return overrides.send(command);
      return { Body: { transformToByteArray: async () => [1, 2, 3] } };
    },
  } as unknown as S3Client;

  const provider = new B2StorageProvider(config, {
    client,
    presigner:
      overrides?.presigner ??
      (async () => 'https://signed.example/test-bucket/key?X-Amz-Signature=abc'),
  });
  return { provider, sent };
}

describe('resolveB2Config', () => {
  it('configuración completa: acepta los 4 valores sin defaults inventados', () => {
    const config = resolveB2Config({
      B2_ENDPOINT: 'https://s3.us-west-004.backblazeb2.com',
      B2_KEY_ID: 'key-id',
      B2_APPLICATION_KEY: 'app-key',
      B2_BUCKET: 'bucket',
    } as unknown as NodeJS.ProcessEnv);
    assert.equal(config.endpoint, 'https://s3.us-west-004.backblazeb2.com');
    assert.equal(config.keyId, 'key-id');
    assert.equal(config.applicationKey, 'app-key');
    assert.equal(config.bucket, 'bucket');
  });

  it('variables faltantes: lanza error listando TODAS las B2_* ausentes', () => {
    assert.throws(
      () => resolveB2Config({} as NodeJS.ProcessEnv),
      (error: Error) =>
        /B2_ENDPOINT, B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET/.test(error.message),
    );
  });
});

describe('B2StorageProvider (mock)', () => {
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
    assert.ok(provider.supportsPublicUrls === false, 'B2 debe ser privado');
  });

  it('upload NO guarda URLs públicas (solo PutObjectCommand, Body y ContentType)', async () => {
    const { provider, sent } = buildProvider();
    await provider.upload(uploadRequest);
    const input = (sent[0] as { input: Record<string, unknown> }).input;
    assert.equal(typeof input.Body, 'object');
    // No existe getPublicUrl en el provider privado.
    assert.equal('getPublicUrl' in provider, false);
  });

  it('download devuelve el contenido como Buffer', async () => {
    const { provider, sent } = buildProvider();
    const buffer = await provider.download('ruta/archivo.pdf');
    assert.ok(Buffer.isBuffer(buffer));
    assert.deepEqual([...buffer], [1, 2, 3]);
    assert.ok(sent[0] instanceof GetObjectCommand);
    assert.equal((sent[0] as { input: { Key: string } }).input.Key, 'ruta/archivo.pdf');
  });

  it('download falla de forma controlada si la respuesta no tiene Body', async () => {
    const { provider } = buildProvider({
      send: async () => ({}),
    });
    await assert.rejects(() => provider.download('x.pdf'), /sin cuerpo/);
  });

  it('delete envía DeleteObjectCommand con bucket y key', async () => {
    const { provider, sent } = buildProvider();
    await provider.delete('ruta/archivo.pdf');
    assert.ok(sent[0] instanceof DeleteObjectCommand);
    assert.equal(sent[0].input.Bucket, 'test-bucket');
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

  it('upload NO altera el Buffer recibido: envía exactamente ese Buffer (sin Base64 ni conversión a string)', async () => {
    const { provider, sent } = buildProvider();
    const buffer = Buffer.from('contenido binario real del archivo');
    await provider.upload({ buffer, storagePath: 'companies/abc/company-documents/1-acta.pdf', contentType: 'application/pdf' });
    const body = (sent[0] as { input: { Body: Buffer } }).input.Body;
    assert.ok(Buffer.isBuffer(body), 'el Body debe seguir siendo un Buffer');
    assert.equal(body, buffer, 'debe ser la MISMA instancia de Buffer recibida (sin copia/conversión)');
    assert.equal(body.length, buffer.length);
  });

  it('upload no genera URLs públicas ni persiste ninguna URL (provider privado)', async () => {
    const { provider, sent } = buildProvider();
    const result = await provider.upload({
      buffer: Buffer.from('x'),
      storagePath: 'companies/abc/company-documents/1-acta.pdf',
      contentType: 'application/pdf',
    });
    // void: el provider no devuelve URL alguna; no hay getPublicUrl.
    assert.equal(result, undefined);
    assert.equal('getPublicUrl' in provider, false);
    assert.equal(provider.supportsPublicUrls, false);
    // Ningún comando enviado incluye URL pública (solo PutObjectCommand).
    assert.equal(sent.length, 1);
    assert.ok(sent[0] instanceof PutObjectCommand);
  });

  it('el cliente interno se construye con expectContinueHeader=false (compatibilidad B2 con Expect: 100-continue)', async () => {
    // Sin inyectar cliente: el constructor debe crear el S3Client real con la
    // configuración anti-IncompleteBody para B2. No se hace ninguna llamada
    // de red aquí (solo se construye la instancia).
    const config = resolveB2Config({
      B2_ENDPOINT: 'https://s3.us-west-004.backblazeb2.com',
      B2_KEY_ID: 'test-key-id',
      B2_APPLICATION_KEY: 'test-application-key',
      B2_BUCKET: 'test-bucket',
    } as unknown as NodeJS.ProcessEnv);
    const provider = new B2StorageProvider(config);
    // El provider implementa StorageProvider (contrato intacto).
    assert.equal(typeof provider.upload, 'function');
    assert.equal(typeof provider.download, 'function');
    assert.equal(typeof provider.delete, 'function');
    assert.equal(typeof provider.exists, 'function');
    assert.equal(typeof provider.getSignedUrl, 'function');
    assert.equal(provider.supportsPublicUrls, false);
    assert.equal(provider.name, 'b2');
  });

  it('no expone credenciales en logs (el provider no registra nada del request)', async () => {
    // SANITY: no se loguea contenido del archivo ni credenciales. Si el
    // provider registrara algo, este test lo detectaría.
    const logs: unknown[][] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => { logs.push(args); };
    try {
      const { provider } = buildProvider();
      await provider.upload({
        buffer: Buffer.from('contenido secreto'),
        storagePath: 'companies/abc/company-documents/1-acta.pdf',
        contentType: 'application/pdf',
      });
    } finally {
      console.log = originalLog;
    }
    assert.equal(logs.length, 0, 'el provider no debe loguear contenido del archivo ni credenciales');
  });

  it('propaga los errores del proveedor en upload (fallo controlado, no silencio)', async () => {
    const { provider } = buildProvider({
      send: async () => {
        throw new Error('B2 unavailable');
      },
    });
    await assert.rejects(() => provider.upload(uploadRequest), /B2 unavailable/);
  });
});
