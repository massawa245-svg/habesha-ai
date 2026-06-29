# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # Start local dev server (localhost:3000)
npm run build    # Production build
npm run lint     # Run ESLint
```

No test suite is configured. Verify changes by running the dev server.

## Architecture Overview

**Habesha AI** is a Next.js 16.2.0 (App Router, React 19) web app that helps the Eritrean/Ethiopian (Habesha) community in Germany understand German bureaucratic letters. It supports four languages: German (de), English (en), Tigrinya (ti), Amharic (am).

### AI Routing (the core logic)

`app/api/chat/route.ts` detects the user's language from message content and routes to different AI providers:

- **Tigrinya / Amharic / Unknown Ethiopic script** → Google Gemini 2.5 Flash (`@google/generative-ai`)
- **German / English / Code** → Groq `llama-3.3-70b-versatile` with automatic fallback to DeepSeek
- **Single-word translation requests** → Gemini (specialized prompt)

`app/api/analyze-document/route.ts` handles file uploads:
- **Images** → Gemini Vision (multimodal)
- **PDFs** → `pdf-parse` text extraction → DeepSeek/Groq text analysis
- Results are MD5-hashed and cached in the `document_analyses` Supabase table

The Groq and DeepSeek clients are both instantiated using the OpenAI SDK with custom `baseURL`.

### Supabase Tables

| Table | Purpose |
|---|---|
| `profiles` | `full_name`, `preferred_language` per user |
| `conversations` | Chat sessions with `title`, `user_id` |
| `messages` | Individual chat messages per conversation |
| `chat_history` | All Q&A pairs stored for admin review |
| `training_data` | Admin-approved examples used as style hints |
| `document_analyses` | Cached document analysis results (keyed by MD5 hash) |
| `user_limits` | Daily free-tier request counter + premium flag |
| `trusted_users` | Roles: `admin` or `premium` (admin-granted) |

Server-side Supabase client: `lib/supabase/server.ts` (uses `@supabase/ssr` with cookies).  
Client-side: `lib/supabase/client.ts`.

### Auth Flow

- Email/password and Google OAuth via Supabase (`/auth/callback` handles the OAuth redirect)
- `app/page.tsx` calls `supabase.auth.getUser()` on mount; unauthenticated users are redirected to `/login`
- Premium status is read from `trusted_users` (role `premium` or `admin`) OR from `user_limits.premium` / `user_limits.premium_until`

### Free Tier Limits

Two separate systems:
1. **Backend**: `lib/premium.ts` — 5 requests/day tracked in `user_limits.requests_today`, reset daily
2. **Frontend**: 30-minute session timer in `app/page.tsx` (`remainingSeconds` state)

### Payments

Stripe subscription flow: `app/api/stripe/checkout/route.ts` creates a Checkout Session; `app/api/stripe/webhook/route.ts` handles post-payment events.

### Admin Dashboard

`app/admin/page.tsx` — accessible only to users in `trusted_users` with `role = 'admin'`. Admins can review `chat_history` entries, edit AI responses, and approve them into `training_data`. Approved training examples are fetched back into the Gemini prompt as style examples.

### Key Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
GOOGLE_GEMINI_API_KEY
GROQ_API_KEY
DEEPSEEK_API_KEY
STRIPE_SECRET_KEY
STRIPE_PRICE_ID
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_BASE_URL
```

### Ethiopic Script Handling

`removeGermanFromEthiopic()` in `app/api/chat/route.ts` strips accidental German words from Tigrinya/Amharic responses while preserving protected loan-words (LinkedIn, GitHub, Visa, etc.). `isGoodResponse()` validates that responses for Ethiopic languages actually contain Ge'ez characters.

### `/download` Route

Unrelated to the main product — a landing page for **WolfCall**, a separate calling app by Massawa Software Technology, with deep links to App Store and Google Play.
