/**
 * Fase 3B-1 — Normalización de teléfonos para WhatsApp Cloud API.
 *
 * Meta espera el destinatario en formato E.164 SIN el '+'
 * (p. ej. 573001112233 para Colombia). Fuente de los números:
 * Employee.mobilePhone / SignatureCampaignWorker.phone — carga histórica
 * heterogénea (10 dígitos nacionales '3001112233', '+57…', '57…', espacios,
 * guiones). Esta utilidad es PURA y NO muta datos: prepara el número solo
 * para el envío (sin migraciones de Employee, regla 13).
 *
 * Reglas:
 * - No asume que todos los números ya son internacionales.
 * - NO destruye números ya internacionalizados (+57…, 57… con longitud
 *   válida se conservan tal cual tras quitar el '+' y separadores).
 * - defaultCountryCode config: p. ej. '57' (Colombia) para 10 dígitos
 *   nacionales que empiezan con '3' (móviles colombianos).
 * - Devuelve null cuando no hay número utilizable (condición controlada
 *   WHATSAPP_RECIPIENT_MISSING / WHATSAPP_RECIPIENT_INVALID).
 */

/** Parámetros de país para la normalización (config, NO hardcode). */
export interface PhoneNormalizationOptions {
  /** Código de país por defecto, p. ej. '57'. Vacío = no inferir. */
  defaultCountryCode?: string;
}

/** longitud mínima razonable de un número E.164 (país + suscriptor). */
const MIN_E164_LENGTH = 8;
/** longitud máxima E.164 según ITU-T E.164. */
const MAX_E164_LENGTH = 15;

/**
 * Normaliza un teléfono para WhatsApp Cloud API.
 * @returns dígitos E.164 sin '+' o null si no es utilizable.
 */
export function normalizePhoneForWhatsApp(
  rawPhone: string | null | undefined,
  options: PhoneNormalizationOptions = {},
): string | null {
  if (!rawPhone) return null;
  let digits = String(rawPhone).replace(/[^\d+]/g, '');
  if (!digits) return null;

  const country = (options.defaultCountryCode ?? '').replace(/\D/g, '');

  // 1) Internacional explícito con '+': fuente de verdad, solo se limpia.
  if (digits.startsWith('+')) {
    digits = digits.slice(1);
    return isValidE164(digits) ? digits : null;
  }

  // 2) Ya trae código de país embebido (p. ej. '573001112233'): conservarlo
  //    SOLO si es un E.164 válido Y NO es un nacional del país por defecto
  //    (evita duplicar el prefijo a números de 12+ dígitos atípicos).
  if (country && digits.startsWith(country) && isValidE164(digits)) {
    return digits;
  }

  // 3) Nacional del país por defecto (p. ej. móvil colombiano 10 dígitos
  //    que empieza con '3'): anteponer el código configurado.
  if (country && digits.length === 10 && digits.startsWith('3')) {
    const e164 = `${country}${digits}`;
    return isValidE164(e164) ? e164 : null;
  }

  // 4) Cualquier otra cosa: válida solo si ya cuadra como E.164 completo.
  return isValidE164(digits) ? digits : null;
}

function isValidE164(digits: string): boolean {
  return digits.length >= MIN_E164_LENGTH && digits.length <= MAX_E164_LENGTH;
}

/** Versión segura para auditoría: últimos 2 dígitos (mismo criterio de PII). */
export function maskPhoneForAudit(phone?: string | null): string {
  if (!phone) return 'n/d';
  return `•••${phone.slice(-2)}`;
}
