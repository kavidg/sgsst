import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { FirebaseAdminService } from '../../auth/firebase-admin.service';
import { createStorageProvider } from './storage-provider.factory';
import { LegacyFirebaseStorageProvider } from './legacy-firebase-storage.provider';
import { R2StorageProvider } from './r2-storage.provider';
import { B2StorageProvider } from './b2-storage.provider';

/**
 * Tests del StorageProviderFactory: selección por STORAGE_PROVIDER sin
 * credenciales reales ni llamadas aInternet.
 */

const fakeFirebaseAdmin = {} as FirebaseAdminService;

/** Helper: setea STORAGE_PROVIDER para un test y lo restaura al salir. */
function withStorageProvider(value: string | undefined, fn: () => void): void {
  const previous = process.env.STORAGE_PROVIDER;
  if (value === undefined) {
    delete process.env.STORAGE_PROVIDER;
  } else {
    process.env.STORAGE_PROVIDER = value;
  }
  try {
    fn();
  } finally {
    if (previous === undefined) {
      delete process.env.STORAGE_PROVIDER;
    } else {
      process.env.STORAGE_PROVIDER = previous;
    }
  }
}

describe('createStorageProvider', () => {
  it('b2 → B2StorageProvider', () => {
    withStorageProvider('b2', () => {
      // Configuración B2 válida solo para el test (sin credenciales reales).
      const previous = { ...process.env };
      process.env.B2_ENDPOINT = 'https://s3.test.backblazeb2.com';
      process.env.B2_KEY_ID = 'test-key';
      process.env.B2_APPLICATION_KEY = 'test-key-secret';
      process.env.B2_BUCKET = 'test-bucket';
      try {
        const provider = createStorageProvider(fakeFirebaseAdmin);
        assert.ok(provider instanceof B2StorageProvider);
        assert.equal(provider.name, 'b2');
        assert.equal(provider.supportsPublicUrls, false);
      } finally {
        process.env.B2_ENDPOINT = previous.B2_ENDPOINT;
        process.env.B2_KEY_ID = previous.B2_KEY_ID;
        process.env.B2_APPLICATION_KEY = previous.B2_APPLICATION_KEY;
        process.env.B2_BUCKET = previous.B2_BUCKET;
      }
    });
  });

  it('b2 sin configuración → error con mensaje claro (sin fallback silencioso)', () => {
    withStorageProvider('b2', () => {
      const previous = { ...process.env };
      delete process.env.B2_ENDPOINT;
      delete process.env.B2_KEY_ID;
      delete process.env.B2_APPLICATION_KEY;
      delete process.env.B2_BUCKET;
      try {
        assert.throws(
          () => createStorageProvider(fakeFirebaseAdmin),
          (error: Error) =>
            /STORAGE_PROVIDER=b2 requires missing environment variables/.test(error.message) &&
            /B2_ENDPOINT/.test(error.message),
        );
      } finally {
        process.env.B2_ENDPOINT = previous.B2_ENDPOINT;
        process.env.B2_KEY_ID = previous.B2_KEY_ID;
        process.env.B2_APPLICATION_KEY = previous.B2_APPLICATION_KEY;
        process.env.B2_BUCKET = previous.B2_BUCKET;
      }
    });
  });

  it('r2 → R2StorageProvider', () => {
    withStorageProvider('r2', () => {
      const previous = { ...process.env };
      process.env.R2_ACCOUNT_ID = 'test-account';
      process.env.R2_ACCESS_KEY_ID = 'test-key';
      process.env.R2_SECRET_ACCESS_KEY = 'test-key-secret';
      process.env.R2_BUCKET = 'test-bucket';
      try {
        const provider = createStorageProvider(fakeFirebaseAdmin);
        assert.ok(provider instanceof R2StorageProvider);
        assert.equal(provider.name, 'r2');
        assert.equal(provider.supportsPublicUrls, false);
      } finally {
        process.env.R2_ACCOUNT_ID = previous.R2_ACCOUNT_ID;
        process.env.R2_ACCESS_KEY_ID = previous.R2_ACCESS_KEY_ID;
        process.env.R2_SECRET_ACCESS_KEY = previous.R2_SECRET_ACCESS_KEY;
        process.env.R2_BUCKET = previous.R2_BUCKET;
      }
    });
  });

  it('firebase → LegacyFirebaseStorageProvider', () => {
    withStorageProvider('firebase', () => {
      const provider = createStorageProvider(fakeFirebaseAdmin);
      assert.ok(provider instanceof LegacyFirebaseStorageProvider);
      assert.equal(provider.name, 'legacy-firebase');
      assert.equal(provider.supportsPublicUrls, true);
    });
  });

  it('legacy-firebase → LegacyFirebaseStorageProvider', () => {
    withStorageProvider('legacy-firebase', () => {
      const provider = createStorageProvider(fakeFirebaseAdmin);
      assert.ok(provider instanceof LegacyFirebaseStorageProvider);
    });
  });

  it('vacío (sin configurar) → LegacyFirebaseStorageProvider (la app arranca sin storage config)', () => {
    withStorageProvider(undefined, () => {
      const provider = createStorageProvider(fakeFirebaseAdmin);
      assert.ok(provider instanceof LegacyFirebaseStorageProvider);
    });
  });

  it('gcs → error explícito (reservado para una fase futura)', () => {
    withStorageProvider('gcs', () => {
      assert.throws(
        () => createStorageProvider(fakeFirebaseAdmin),
        /gcs está reservado/,
      );
    });
  });

  it('valor inválido → error con la lista de valores soportados', () => {
    withStorageProvider('dropbox', () => {
      assert.throws(
        () => createStorageProvider(fakeFirebaseAdmin),
        (error: Error) =>
          /STORAGE_PROVIDER inválido: "dropbox"/.test(error.message) &&
          /b2/.test(error.message),
      );
    });
  });
});
