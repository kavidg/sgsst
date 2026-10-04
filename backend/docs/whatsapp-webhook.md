# Fase 3B-2A — Webhook de WhatsApp (Meta Cloud API)

Seguimiento real de entregas de los mensajes WhatsApp enviados por el flujo de
aceptación de responsabilidades 1.1.2.

## Endpoint

```text
GET  /webhooks/whatsapp   → verificación de suscripción (challenge de Meta)
POST /webhooks/whatsapp   → eventos de estado (SENT/DELIVERED/READ/FAILED)
```

Endpoint PÚBLICO: sin Firebase Auth, sin CompanyAccess, sin Roles (Meta no se
autentica con la aplicación).

## Variables de entorno

| Variable | Uso |
|---|---|
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Token de verificación de la suscripción (lo defines tú y lo pegas en Meta). Es **independiente** de `WHATSAPP_ACCESS_TOKEN`. |
| `WHATSAPP_WEBHOOK_APP_SECRET` | App Secret de la app de Meta para validar `X-Hub-Signature-256` (HMAC-SHA256 del body **crudo**). NUNCA reutilizar el access token como secreto. |

Sin estas variables el backend inicia normalmente: el GET rechaza verificaciones
y el POST rechaza writes con error controlado (`WHATSAPP_WEBHOOK_NOT_CONFIGURED`).

## Estados de la entrega (NotificationDelivery)

```text
PENDING → SENT → DELIVERED → READ
PENDING/SENT/DELIVERED → FAILED (terminal)
```

Significado real:

- `SENT` — Meta **aceptó/procesó** el mensaje según la respuesta de la API.
  **NO** equivale a entrega al teléfono.
- `DELIVERED` — confirmado **solo vía webhook** (deliveredAt).
- `READ` — confirmado **solo vía webhook** (readAt).
- `FAILED` — Meta reportó fallo; guarda `errorCode`/`errorMessage` saneados y
  `failedAt`. `BOUNCED` queda reservado (uso futuro de email).

Los estados **nunca retroceden** (READ→DELIVERED o DELIVERED→SENT se ignoran) y
los eventos duplicados de Meta son idempotentes: no re-escriben timestamps ni
duplican auditoría.

## Identificación de la entrega

La única asociación válida es `message.id` de Meta con
`NotificationDelivery.providerMessageId` (con `channel=WHATSAPP` y
`provider=WHATSAPP_META`). Jamás se confía en teléfono, companyId o employeeId
enviados por el caller.

## Seguridad

- `X-Hub-Signature-256` validada con `timingSafeEqual` sobre el body crudo
  (`rawBody: true` en `main.ts`; el resto de controllers no se ve afectado).
- Body limitado a 64 KB; JSON inválido → 400 sin stack trace; firma inválida → 401.
- Sin config del secreto el POST se rechaza (superficie pública: no se aceptan
  writes no autenticables). No desactivar esta validación en producción.
- Auditoría `WHATSAPP_DELIVERED` / `WHATSAPP_READ` / `WHATSAPP_FAILED`
  (una vez por transición real, en `SignatureAudit`) sin access token, sin
  secretos, sin OTP, sin URL con token y sin payload crudo de Meta.

## Pendiente (fuera de esta fase)

- Configurar el webhook en Meta Business (Callback URL + verify token + app
  secret) — requiere acceso a la cuenta business del cliente.
- Botón de reenvío manual por WhatsApp (el servicio `resendAcceptanceWhatsApp`
  ya existe; falta exponerlo en controller/UI).
- Estados de email vía webhooks de Resend (BOUNCED).
