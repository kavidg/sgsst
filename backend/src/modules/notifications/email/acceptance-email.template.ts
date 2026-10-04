/**
 * Fase 3A — Plantilla transaccional del correo de aceptación de
 * responsabilidades SG-SST (1.1.2).
 *
 * Reglas del correo:
 * - Profesional y sencillo; el contenido completo vive SOLO en /sign/:token.
 * - NO incluye OTP, firma, ni el detalle completo de responsabilidades.
 * - El enlace es EXACTAMENTE el mismo token del worker (misma URL).
 */

export interface AcceptanceEmailInput {
  workerName: string;
  companyName?: string;
  /** URL ABSOLUTA del enlace de aceptación (misma /sign/:token). */
  signUrl: string;
  /** Fecha de expiración del enlace, cuando esté disponible. */
  expiresAt?: Date;
}

const BRAND_COLOR = '#0f766e';
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL ?? '';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Fecha local formateada (solo presentación). */
function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'long', timeStyle: 'short' }).format(date);
}

export function buildAcceptanceEmailSubject(companyName?: string): string {
  return companyName
    ? `Tienes responsabilidades SG-SST pendientes de aceptación — ${companyName}`
    : 'Tienes responsabilidades SG-SST pendientes de aceptación';
}

export function buildAcceptanceEmailHtml(input: AcceptanceEmailInput): string {
  const name = escapeHtml(input.workerName || 'Trabajador');
  const company = input.companyName ? escapeHtml(input.companyName) : '';
  const url = input.signUrl;
  const expiration = input.expiresAt
    ? `<p style="margin:16px 0 0;font-size:13px;color:#374151;">El enlace está disponible hasta el <strong>${escapeHtml(formatDate(input.expiresAt))}</strong>.</p>`
    : '';

  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background-color:#f3f4f6;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:10px;border:1px solid #e5e7eb;">
            <tr>
              <td style="padding:28px 32px 8px 32px;">
                <h1 style="margin:0;font-size:18px;color:#111827;">Responsabilidades SG-SST pendientes de aceptación</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 0 32px;font-size:14px;line-height:1.6;color:#374151;">
                <p style="margin:0 0 12px 0;">Hola <strong>${name}</strong>,</p>
                <p style="margin:0 0 12px 0;">${
                  company
                    ? `La empresa <strong>${company}</strong> te notifica que`
                    : 'Te notificamos que'
                } tienes <strong>responsabilidades en Seguridad y Salud en el Trabajo (SG-SST)</strong> pendientes de revisión y aceptación.</p>
                <p style="margin:0 0 20px 0;">Debes revisarlas y aceptarlas en el siguiente enlace seguro:</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 8px 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td align="center" bgcolor="${BRAND_COLOR}" style="border-radius:8px;">
                      <a href="${url}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">Revisar y aceptar responsabilidades</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 32px 0 32px;font-size:13px;color:#6b7280;">
                Si el botón no funciona, copia y pega este enlace en tu navegador:<br />
                <a href="${url}" style="color:${BRAND_COLOR};word-break:break-all;">${url}</a>
              </td>
            </tr>
            ${expiration}
            <tr>
              <td style="padding:16px 32px 0 32px;">
                <div style="border-left:3px solid ${BRAND_COLOR};background-color:#f0fdfa;padding:12px 16px;font-size:13px;color:#134e4a;">
                  🔒 <strong>Este enlace es personal e intransferible.</strong> No lo compartas: quien lo use podrá ver tus
                  responsabilidades y firmar en tu nombre. Al ingresar se te pedirá tu documento de identidad para validarte.
                </div>
              </td>
            </tr>
            ${
              SUPPORT_EMAIL
                ? `<tr><td style="padding:12px 32px 0 32px;font-size:12px;color:#6b7280;">¿Dudas? Escribe a <a href="mailto:${escapeHtml(SUPPORT_EMAIL)}" style="color:${BRAND_COLOR};">${escapeHtml(SUPPORT_EMAIL)}</a>.</td></tr>`
                : ''
            }
            <tr>
              <td style="padding:20px 32px 28px 32px;font-size:12px;color:#9ca3af;">
                Este es un correo automático de notificación; no responda a este mensaje.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildAcceptanceEmailText(input: AcceptanceEmailInput): string {
  const lines: string[] = [];
  lines.push(`Hola ${input.workerName || 'Trabajador'},`);
  lines.push('');
  lines.push(
    input.companyName
      ? `${input.companyName} te notifica que tienes responsabilidades en Seguridad y Salud en el Trabajo (SG-SST) pendientes de revisión y aceptación.`
      : 'Tienes responsabilidades en Seguridad y Salud en el Trabajo (SG-SST) pendientes de revisión y aceptación.',
  );
  lines.push('');
  lines.push('Revisa y acepta en el siguiente enlace seguro:');
  lines.push(input.signUrl);
  lines.push('');
  if (input.expiresAt) {
    lines.push(`El enlace está disponible hasta: ${formatDate(input.expiresAt)}`);
    lines.push('');
  }
  lines.push('SEGURIDAD: Este enlace es personal e intransferible. No lo compartas: quien lo use');
  lines.push('podrá ver tus responsabilidades y firmar en tu nombre. Al ingresar se te pedirá');
  lines.push('tu documento de identidad para validarte.');
  lines.push('');
  lines.push('Este es un correo automático de notificación; no responda a este mensaje.');
  return lines.join('\n');
}
