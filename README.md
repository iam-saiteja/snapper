# Snapper

Android app (React + Capacitor) that blocks Instagram, YouTube, Shorts and Reels until you finish your daily tasks,
and locks payment apps when your points go negative.

- **Tasks & quizzes**: each task has an AI voice quiz (Gemini, with Groq as fallback). Pass it to earn points.
- **Unlocks**: spend points for 15-minute windows. Missed deadlines cost points; negative points lock PhonePe, CRED, GPay, Paytm.
- **Emergency**: explain the problem; the AI decides whether to grant a short unlock (logged, limited per week).
- **Voice notes & voice reminders**: recordings stay on the phone; only transcripts go to Supabase.
- **Links & reels**: Share → Snapper, with optional reminder and AI summary (YouTube).
- **Admin**: JSON plan import. Only tomorrow onwards can be changed; today and the past are locked by the database.

## Layout

| Path | What |
|---|---|
| `src/` | React app (also served by the Cloudflare Worker as the web/admin panel) |
| `shared/schema.ts` | Plan/rules JSON schema shared by app and server |
| `worker/` | Cloudflare Worker: `/api/*` (quiz, grading, unlocks, emergency, transcription, device sync); everything else is static assets from `dist/` |
| `supabase/migrations/` | Database schema, row-level security and the missed-deadline penalty job |
| `android/app/src/main/java/com/saiteja/snapper/` | Native blocker (AccessibilityService), reminders, background sync |

## Configuration

- **Public client config** (Supabase URL, publishable key, API URL) is committed in `.env.production`.
- **Cloudflare Worker** `snapper` (`wrangler.jsonc`) is deployed by Workers Builds on push to `main`
  (build `npm run build`, deploy `npx wrangler deploy`). Secrets, set with `wrangler secret put <NAME> --name snapper`:
  `GEMINI_API`, `GROQ_API`, `SUPABASE_SECRET_KEY`.
- **AI**: Groq (`openai/gpt-oss-120b`, Whisper) first, ~2s per call; Gemini Flash as fallback and for YouTube summaries.
- **GitHub Actions** builds a signed APK on every PR (artifact `snapper-apk`). Secrets: `SNAPPER_KEYSTORE_B64`,
  `SNAPPER_KEYSTORE_PASSWORD`, `SNAPPER_KEY_ALIAS`, `SNAPPER_KEY_PASSWORD`.

## Credits

Shorts/Reels detection adapted from [Shorts-Blocker](https://github.com/atick-faisal/Shorts-Blocker) by Atick Faisal (Apache-2.0).
