# In-App Chat Module

## Summary

Gestelit now has a planned and implemented in-app chat module for operational conversations between admins and production workers.

The module is intentionally MES-focused, not a generic messenger:

- Admins communicate with workers in active production sessions.
- Workers can read, reply, and open a short help thread from the work screen.
- Threads carry production context: worker, station, job, job item, step, and status snapshot.
- Chat is read/write inside Gestelit only. It does not write to BINA and does not change production state.

## Expert Review Decisions

Product workflow:

- Start with session-scoped conversations because that matches the real operational need: "what is happening now at this station?"
- Admins can initiate to active sessions.
- Workers can open a help thread for their current session.
- Chat-driven production actions are out of scope for v1.

Backend:

- Use service-role server APIs only. No browser-side Supabase access.
- Keep RLS closed to `anon` and `authenticated`.
- Use polling in v1; realtime can be enabled later through the `chat_messages` publication.
- Store read receipts separately from messages.

UI/UX:

- Admin view is an operational console with conversation list, thread, context panel, and active-session composer.
- Worker view is a compact bottom sheet from `/work` with quick replies.
- RTL Hebrew is the default; mixed production identifiers are wrapped in `bdi` where shown.

## Data Model

Migration:

`supabase/migrations/20260708120000_create_in_app_chat.sql`

Tables:

- `chat_threads`
- `chat_messages`
- `chat_thread_reads`

Enums:

- `chat_thread_status`: `open`, `closed`
- `chat_priority`: `normal`, `urgent`
- `chat_sender_type`: `admin`, `worker`, `system`
- `chat_message_kind`: `text`, `system`
- `chat_reader_type`: `admin`, `worker`

Important fields:

- `chat_threads.context_snapshot`: immutable-ish JSON context captured when the thread opens.
- `chat_threads.last_message_at`, `last_message_preview`, `last_sender_type`: maintained by trigger.
- `chat_messages.client_message_id`: idempotency key for retry-safe sends.
- `chat_thread_reads.reader_key`: supports one admin reader and per-worker read state.

## APIs

Admin:

- `GET /api/admin/chat/threads`
- `POST /api/admin/chat/threads`
- `GET /api/admin/chat/threads/[threadId]`
- `PATCH /api/admin/chat/threads/[threadId]`
- `GET /api/admin/chat/threads/[threadId]/messages`
- `POST /api/admin/chat/threads/[threadId]/messages`
- `PATCH /api/admin/chat/threads/[threadId]/read`

Worker:

- `GET /api/chat/threads`
- `POST /api/chat/threads`
- `GET /api/chat/threads/[threadId]/messages`
- `POST /api/chat/threads/[threadId]/messages`
- `PATCH /api/chat/threads/[threadId]/read`

Auth:

- Admin routes require the existing admin session cookie and reject query-password auth.
- Worker routes require the existing worker request authentication.
- Worker access is scoped to the authenticated worker's own threads.

## UI Surfaces

Admin page:

`/admin/messages`

Features:

- Search by worker, station, job, subject, or preview.
- Filter open/all/closed and unread.
- Start new message to an active production session.
- View production context panel.
- Reply, mark read, close, and reopen.

Worker integration:

`/work`

Features:

- Persistent `הודעות` button in the active work header.
- Bottom-sheet chat UI.
- Quick replies: `קיבלתי`, `צריך עזרה`, `בוצע`, `אפשר להתקשר`.
- Worker can open a new thread for the current session.

Shared component:

`components/chat/chat-ui.tsx`

## Rollout Gate

The code is implemented, but production usage requires the Supabase migration to be applied first.

Verification command:

```bash
npm run verify:chat-schema
```

Expected green output:

```text
chat_threads: OK
chat_messages: OK
chat_thread_reads: OK

Chat schema ready.
```

If it fails with `PGRST205`, apply:

`supabase/migrations/20260708120000_create_in_app_chat.sql`

## Manual Acceptance

After schema verification is green:

1. Open `/admin/messages`.
2. Confirm active sessions appear in "הודעה חדשה".
3. Send an admin message to an active worker session.
4. Open `/work` as that worker.
5. Confirm unread badge appears on `הודעות`.
6. Reply using a quick reply.
7. Confirm the admin console receives the reply.
8. Close and reopen the thread from admin.
9. Check desktop and mobile layouts.

## Deferred

- Push notifications.
- Realtime subscriptions beyond optional `chat_messages` publication.
- Attachments, photos, and audio.
- Multi-admin per-thread read state.
- Chat-to-production actions.
