import { FirebaseAdminService } from '../../auth/firebase-admin.service';
import {
  StorageProvider,
} from './storage-provider.interface';
import { LegacyFirebaseStorageProvider } from './legacy-firebase-storage.provider';
import { R2StorageProvider, resolveR2Config } from './r2-storage.provider';
import { B2StorageProvider, resolveB2Config } from './b2-storage.provider';

/**
 * SELECCIÓN DE PROVIDER (FASE 1) mediante STORAGE_PROVIDER:
 *
 * - (sin valor) | 'legacy-firebase' | 'firebase' → LegacyFirebaseStorageProvider
 *   COMPATIBILIDAD: el proyecto actual sigue funcionando tal cual (Firebase
 *   con objetos públicos). Este provider es TEMPORAL y NO debe confundirse
 *   con R2; existe para que la transición no exija configurar nada.
 * - 'r2' → R2StorageProvider (privado + signed URLs). Falla al arranque si
 *   faltan variables R2_* (configuración explícita incompleta).
 * - 'b2' → B2StorageProvider (Backblaze B2, API S3-compatible, privado +
 *   signed URLs). Falla al arranque si faltan variables B2_*: NO hay
 *   fallback silencioso a Firebase cuando el usuario eligió 'b2'.
 * - 'gcs' → NO implementado todavía (Fase futura): error explícito, nunca
 *   una implementación silenciosa.
 */
export function createStorageProvider(firebaseAdminService: FirebaseAdminService): StorageProvider {
  const mode = (process.env.STORAGE_PROVIDER ?? '').trim().toLowerCase();

  if (!mode || mode === 'legacy-firebase' || mode === 'firebase') {
    return new LegacyFirebaseStorageProvider(firebaseAdminService);
  }

  if (mode === 'r2') {
    return new R2StorageProvider(resolveR2Config());
  }

  if (mode === 'b2') {
    return new B2StorageProvider(resolveB2Config());
  }

  if (mode === 'gcs') {
    throw new Error(
      'STORAGE_PROVIDER=gcs está reservado para una fase futura: GcsStorageProvider no está implementado todavía.',
    );
  }

  throw new Error(
    `STORAGE_PROVIDER inválido: "${mode}". Valores soportados: (vacío)=legacy-firebase, r2, b2.`,
  );
}
