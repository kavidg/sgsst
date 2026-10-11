/**
 * Lógica COMÚN de la capa de storage (compartida por todos los providers).
 *
 * FASE 1 — centraliza lo que antes estaba duplicado entre StorageService y
 * los tres controllers con uploadToFirebaseStorage propio:
 * - sanitización de nombres;
 * - generación del storagePath;
 * - inferencia de content-type.
 * Ningún provider debe reimplementar esto.
 */

/** Sanitiza el nombre: solo letras, números, punto y guion (comportamiento histórico). */
export function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9.-]/g, '_');
}

/**
 * Construye el storagePath con la convención histórica del proyecto:
 * `{folder}/{Date.now()}-{nombreSanitizado}` (timestamp evita colisiones).
 */
export function buildStoragePath(folder: string, filename: string): string {
  return `${folder}/${Date.now()}-${sanitizeFilename(filename)}`;
}

/** Inferencia de content-type por extensión (fallback histórico del facade). */
export function inferContentType(filename: string): string {
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
