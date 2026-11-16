# Android / Web Push

The app stores browser Push subscriptions in `public.push_subs`. The active server sender is the Supabase Edge Function `bright-endpoint`; the database trigger `public.push_on_msg` calls it after each `msgs` INSERT and sends the message id as `{ "id": ... }`.

The sender reads only the separate `msgs.push_preview` field, not the encrypted `msgs.data` payload. It sends the sender name, up to 180 characters of plaintext preview, and the conversation id to active push subscriptions; it excludes the sender, respects each member's muted setting, and removes expired subscriptions (HTTP 404/410). The client currently writes `push_preview` for every text message regardless of whether recipients have enabled push. This is an explicit confidentiality trade-off, not end-to-end encrypted content.

## Runtime configuration

The deployed function expects these Edge Function environment variables:

- `VAPID_PUBLIC`: must exactly match `CFG.vapid` in `config.js`.
- `VAPID_PRIVATE`: the private key paired with that public key. It cannot be derived from the public key.
- `VAPID_SUBJECT`: a real monitored contact URI. `mailto:admin@example.com` is only a placeholder and must not be used for a public service.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`: standard Supabase function environment values.

Do not generate a new VAPID key pair unless both the server private key and client public key are replaced together. Never commit private keys or the service-role key.

## Webhook authentication

The database migration `20261114105432_secure_push_webhook.sql` creates a random 256-bit secret directly in Supabase Vault. The `notify_msg` trigger reads it from Vault and sends it in the `x-webhook-secret` header. The Edge Function validates that header through `verify_push_webhook_secret`, a database RPC executable only by `service_role`.

The Edge Function has JWT verification disabled because the database trigger calls it directly; the shared-secret check is mandatory. Do not remove the check or expose the Vault secret.

## Android verification

1. Install the TWA APK built for the same verified domain and signing certificate.
2. In Android Settings → Apps → the app → Notifications, allow notifications.
3. Open the app, sign in, and tap Settings → Notifications to grant browser permission and register the device.
4. Use the in-app test for local notification display. This does not prove remote push delivery.
5. Send a message from another account while the recipient app is backgrounded.

## Current project audit

Read-only inspection on 2026-11-16 found:
- `bright-endpoint` is deployed and active (version 8); the deployed source uses the same webhook authentication and plaintext-preview flow as this repository.
- The `msgs` notification trigger exists and the Vault webhook secret is present.
- The database contains 65 push-subscription rows across 3 user accounts.
- No `bright-endpoint` function log entries were returned for 2026-11-15 08:07 UTC through 2026-11-16 08:07 UTC. This does not prove failure, but it provides no evidence of successful delivery in that window.
- The read-only inspection did not expose Edge Function environment values, so the presence and correctness of `VAPID_PUBLIC`, `VAPID_PRIVATE`, and `VAPID_SUBJECT` remain unverified.

Remote delivery still requires a controlled test with two real accounts and an Android device. The local in-app notification test proves only that the browser can display a local notification; it does not prove remote Push delivery.
