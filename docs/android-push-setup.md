# Android / Web Push

The app stores browser Push subscriptions in `public.push_subs`. The active server sender is the Supabase Edge Function `bright-endpoint`; the database trigger `public.push_on_msg` calls it after each `msgs` INSERT and sends the message id as `{ "id": ... }`.

The sender never reads or transmits encrypted message contents. It sends generic notifications, excludes the sender, respects each member's muted setting, and removes expired subscriptions (HTTP 404/410).

## Runtime configuration

The deployed function expects these Edge Function environment variables:

- `VAPID_PUBLIC`: must exactly match `CFG.vapid` in `config.js`.
- `VAPID_PRIVATE`: the private key paired with that public key. It cannot be derived from the public key.
- `VAPID_SUBJECT`: contact URI, for example `mailto:admin@example.com`.
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

- `bright-endpoint` is deployed and active (version 7).
- The database trigger has generated successful HTTP 200 invocations before the auth hardening.
- The invalid-secret test now returns HTTP 401; the Vault secret exists and is not readable by `anon` or `authenticated`.
- The database currently contains 4 subscriptions across 2 users. The newest subscription was created on 2026-11-08.
- Remote delivery still needs confirmation on a real Android device. An HTTP 200 from the Edge Function only confirms that the handler ran.
