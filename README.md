# KRZ OneBox

One AI-powered inbox for **WhatsApp Business, Messenger, Viber and email**.

For every conversation, Claude does four things:
- Summarizes it.
- Answers "Do I need to respond?".
- Drafts replies in three tones (friendly, short, formal).
- Pulls out dates you can add to Google Calendar in one click.

Each user signs in and connects **their own** accounts. Nothing is sent without the user pressing Send.

Stack: Next.js 16 (App Router), Supabase (auth + Postgres), Claude API, deployed on Vercel.

---

## What each connection reads

| Connection | How it connects | Gets messages | Replies | Notes |
|---|---|---|---|---|
| **Google** (Gmail + Calendar) | OAuth button | Pulled on connect and with "Sync email" | Gmail, threaded | Gmail read access is a Google *restricted scope*: past 100 test users you need Google's OAuth verification and a security assessment. |
| **WhatsApp Business** | User pastes phone number ID, access token and app secret | Webhook, real time | Cloud API | Only messages to a WhatsApp *Business* number. Free-form replies are allowed only within 24 h of the customer's last message. |
| **Messenger** | User pastes Page ID, Page token and app secret | Webhook, real time | Send API | Only a Facebook *Page's* inbox, not personal chats. Same 24 h rule. |
| **Viber** | User pastes bot token | Webhook (set automatically) | Bot API | Only messages to a Viber *bot*. |

Personal WhatsApp, Messenger and Viber chats have no official API. Getting those would need unofficial bridges (see "Roadmap").

---

## Setup

### 1. Supabase
1. Create a project.
2. Run `supabase/migrations/001_init.sql` in the SQL editor.
3. In **Authentication → URL configuration**, set:
   - Site URL to your app URL.
   - Add `https://YOUR_APP/auth/callback` as a redirect URL.
4. Copy the project URL, the anon key and the service-role key.

### 2. Google Cloud
1. Create a project.
2. Enable the **Gmail API** and the **Google Calendar API**.
3. Configure the OAuth consent screen with these scopes:
   - `gmail.readonly`
   - `gmail.send`
   - `calendar.events`
4. Add yourself as a test user.
5. Create an **OAuth client (Web)** with redirect URI `https://YOUR_APP/api/connections/google/callback`.

### 3. Environment
Copy `.env.example` to `.env.local` and fill it in. Generate `ENCRYPTION_KEY` with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

> Never rotate `ENCRYPTION_KEY` without re-encrypting the stored credentials. Every saved connection would stop working.

### 4. Run
```bash
npm install
npm run dev
```

Meta and Viber webhooks need a public HTTPS URL. For local testing, use a tunnel (e.g. `ngrok http 3000`) and set `NEXT_PUBLIC_APP_URL` to the tunnel URL.

### 5. Deploy to Vercel
1. Import the repo.
2. Add the same environment variables.
3. Set `NEXT_PUBLIC_APP_URL` to the production domain.

---

## How it works

```
WhatsApp / Messenger / Viber ──webhook──▶ /api/webhooks/{provider}/{connectionId}
Gmail ──OAuth pull──────────────────────▶ /api/connections/{id}/sync
                                             │ verify signature (HMAC) → normalize
                                             ▼
                                   ingest() → conversations + messages (Supabase)
                                             │
                                             ▼
                              analyzeConversation() → Claude → insights
                     (summary, needs_reply, verdict, 3 reply drafts, event)
                                             │
       /inbox  ◀── /api/inbox (sorted: needs reply → priority → recency) + AI brief
         ├─ Send  → /api/conversations/{id}/reply    → back out through the same channel
         └─ Add   → /api/conversations/{id}/calendar → Google Calendar
```

### Security
- **Per-user connections.** Each webhook URL contains its connection ID. Each request is checked against that connection's own secret:
  - Meta: `X-Hub-Signature-256` with the app secret.
  - Viber: `X-Viber-Content-Signature` with the bot token.
- **Credentials at rest.** They are encrypted with AES-256-GCM and never sent to the browser. RLS and column grants hide them even from the user's own session.
- **Untrusted message text.** Messages are passed to Claude as untrusted data. The model is told never to follow instructions inside them, and its output is validated with zod.
- **Google OAuth.** The OAuth `state` is HMAC-signed and bound to the signed-in user.

## Key files
- `src/lib/ai.ts`: Claude triage (tool-forced JSON) and the daily brief.
- `src/lib/providers/*`: Meta (WhatsApp + Messenger), Viber, Google (Gmail + Calendar).
- `src/lib/ingest.ts`: normalize, dedupe, store, re-analyze.
- `src/app/inbox/page.tsx`, `src/app/connections/page.tsx`: the UI.
- `supabase/migrations/001_init.sql`: schema and RLS.

## Roadmap
- Gmail push notifications (Pub/Sub `watch`) instead of manual sync.
- Outlook / Microsoft 365 mail via Microsoft Graph.
- WhatsApp message templates for replies outside the 24 h window.
- Optional personal-chat support through a Matrix bridge (mautrix) desktop companion. This is unofficial and can break, so it should be opt-in.
- Mobile app (Expo) on the same API.
