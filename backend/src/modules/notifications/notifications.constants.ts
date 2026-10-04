/**
 * Fase 3A/3B — Tokens de inyección del módulo de notificaciones.
 * En archivo propio para evitar la importación circular
 * service ↔ module (el símbolo debe existir al decorar el service).
 */
export const EMAIL_PROVIDER_TOKEN = Symbol('EMAIL_DELIVERY_PROVIDER');
/** Fase 3B-1 — proveedor WhatsApp (Meta | mock | sin configurar). */
export const WHATSAPP_PROVIDER_TOKEN = Symbol('WHATSAPP_DELIVERY_PROVIDER');

/**
 * Fase 3B-2A — Claves de configuración del webhook de Meta. En constants para
 * reutilizarlas entre service/tests sin acoplarlos al module.
 * - VERIFY_TOKEN: suscripción del webhook en la app de Meta (≠ access token).
 * - APP_SECRET: valida X-Hub-Signature-256 del POST (NUNCA reutilizar el
 *   WHATSAPP_ACCESS_TOKEN como secreto de firma).
 */
export const WHATSAPP_WEBHOOK_VERIFY_TOKEN_CONFIG_KEY = 'WHATSAPP_WEBHOOK_VERIFY_TOKEN';
export const WHATSAPP_WEBHOOK_APP_SECRET_CONFIG_KEY = 'WHATSAPP_WEBHOOK_APP_SECRET';
