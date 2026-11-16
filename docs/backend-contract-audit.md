# Backend contract audit

Status: **audit only — not a migration**. This document is derived from the current `app.js` queries. It is not a substitute for checking the live Supabase schema, RLS policies, triggers, and storage configuration.

## Critical warning

The existing `setup.sql` is obsolete for this application and must not be run against a production database:
- It creates `messages`, while the application reads and writes `msgs`.
- It omits the application's `keybackup`, `convs`, `members`, `stories`, `story_views`, and `push_subs` data model.
- Its profile insert policy contains `(select count(*) from profiles)<2`, which would prevent normal account creation once two profiles exist.
- Its message policies are not scoped to conversation membership.

The live project was subsequently verified and updated on 2026-11-14. The changes are recorded in `supabase/migrations/20261114120000_harden_messenger_backend.sql`.

## Tables and fields referenced by the client

Fields below are observed in client payloads, filters, or reads. Fields returned by `select('*')` may exist in addition to this list.

| Table | Observed fields / operations |
|---|---|
| `profiles` | `id`, `pubkey`, `name`, `username`, `bio`, `status_emoji`, `color`, `avatar_url`, `theme`, `last_seen`; lookup by id; username/name prefix search; upsert/update |
| `keybackup` | `user_id`, `data`; select by user_id; upsert encrypted private-key backup |
| `convs` | `id`, `kind`, `dm_key`, `secret_ttl`, `title`, `pinned_id`; insert/select/update/delete |
| `members` | `conv_id`, `user_id`, `role`, `wrapped_by`, `wrapped_key`; client also reads per-member flags and `last_read_at`; insert/select/update/delete |
| `msgs` | `id`, `conv_id`, `sender`, `data`, `created_at`, `edited_at`; insert/select/update/delete; `sender` is written explicitly from the authenticated user; payload is encrypted before upload |
| `stories` | `id`, `user_id`, `kind`, `path`, `caption`, `bg`, `created_at`, `expires_at`; insert/select/delete |
| `story_views` | `story_id`, `viewer_id`; select/upsert |
| `push_subs` | `user_id`, `endpoint`, `sub`; upsert on `endpoint` |

## RPC contract used by the client

| RPC | Named arguments passed by the client |
|---|---|
| `member_flag` | `c`, `f`, `v` |
| `mark_read` | `c` |
| `react` | `mid`, `e` |
| `pin_msg` | `c`, `mid` |
| `purge_secret` | no arguments |

The database implementation must validate that the caller is a member of the affected conversation. Role changes, pinning, deletion, and membership changes need stricter role checks. Any `SECURITY DEFINER` function must use a fixed safe `search_path` and explicitly verify `auth.uid()`.

## Storage and realtime

- Buckets referenced: `avatars` (profile images, covers, story images) and `media` (encrypted message attachments).
- The client currently calls `getPublicUrl()` for both buckets. A private `media` bucket therefore requires a client change to use signed URLs; do not simply make it public without considering that encrypted blobs become publicly retrievable.
- Realtime subscriptions listen to `msgs`, `members`, `convs`, and `profiles`. These tables must be in the Realtime publication and their RLS policies must permit only intended rows.
- Story image objects are stored under `<auth-user-id>/story-...`; profile assets are stored under `<auth-user-id>/...`; storage write policies should enforce that path ownership.

## Required access-control properties

1. A user may read/update only their own `keybackup` row. Never expose the private-key backup to profile search or other users.
2. Conversation, member, and message reads must be limited to current members of that conversation.
3. A user may create a conversation and become its owner atomically, or the backend must safely clean up a partially-created conversation if membership insertion fails.
4. A user may add/remove members or change roles only with the required owner/admin permissions.
5. Message insert/update/delete policies must verify conversation membership and sender/role constraints, not merely that the user is authenticated.
6. Profile search may expose public profile fields and public keys, but not backup material or private account data.
7. Story reads, views, expiry cleanup, and deletes must enforce the intended visibility and ownership rules.
8. Push subscriptions must be scoped to the authenticated user; endpoint uniqueness must not allow one user to overwrite another user's subscription.
9. Secret-message expiry must be enforced server-side. Client-side filtering alone does not delete expired ciphertext from the database.

## Known client-side risks to address after schema verification

- Conversation creation currently uses multiple requests (create conversation, insert owner/member rows, then add other members). A failure can leave orphaned conversations or partially populated groups. Prefer one transactional RPC.
- The initial chat load fetches the newest 120 messages per conversation; older history is fetched in cursor pages of 100. Long-history ordering and continuity still need a multi-device test.
- Conversation creation still spans multiple client requests. The client attempts cleanup after failures, but a transactional backend RPC would provide stronger atomicity.
- The client currently fetches encrypted media through public object URLs. Encryption protects message contents only if key handling and authorization are sound; it does not prevent public retrieval of ciphertext.
- The browser stores the unlocked private key in IndexedDB for convenience. Device-level access and logout/key-removal behavior need an explicit threat-model review.

## Verification still required

The connected live project was inspected read-only on 2026-11-16. Its current schema includes the active `convs`, `members`, and `msgs` model, story tables, `member_key_history`, and push subscription storage. The live Edge Function `bright-endpoint` is ACTIVE at version 8; the `msgs` notification trigger exists and the webhook secret is present in Vault. The database currently has 65 push-subscription rows across 3 user accounts. No function log entries for `bright-endpoint` were returned for 2026-11-15 08:07 UTC through 2026-11-16 08:07 UTC, so remote delivery remains unverified. The read-only inspection did not expose Edge Function environment values; `VAPID_PUBLIC`, `VAPID_PRIVATE`, and `VAPID_SUBJECT` still need an administrator to verify without revealing the private key.

A concrete backend defect remains: the live `rotate_group_add_members_key` function updates the wrapped key for every existing member and inserts new members, but does not first copy the previous wrapped keys into `member_key_history`. The client now retains old keys in memory during the current session, but after an existing member reloads or signs in on another device, old group messages may no longer decrypt. The removal RPC `rotate_group_member_key` does archive the previous wrapped keys. Fixing the add-member path requires a database migration that archives the current `members` rows before updating them. No migration was applied during this review.

The repository migration file is named `20261114184600_atomic_multi_member_add.sql`, while the live migration ledger reports `20261114104812_atomic_multi_member_add`; reconcile migration history before any future `db push`.
