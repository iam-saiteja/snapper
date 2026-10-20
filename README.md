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
| `src/` | React app (also served on Cloudflare Pages as the admin panel) |
| `shared/schema.ts` | Plan/rules JSON schema shared by app and server |
| `functions/api/` | Cloudflare Pages Functions: quiz, grading, unlocks, emergency, transcription, device sync |
| `supabase/migrations/` | Database schema, row-level security and the missed-deadline penalty job |
| `android/app/src/main/java/com/saiteja/snapper/` | Native blocker (AccessibilityService), reminders, background sync |

## Configuration

Cloudflare Pages (Settings → Variables and secrets):

| Name | Kind |
|---|---|
| `GEMINI_API`, `GROQ_API`, `SUPABASE_SECRET_KEY` | secret |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | variable (build + runtime) |

Build command `npm run build`, output directory `dist`.

GitHub repository variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SNAPPER_API_BASE`
(the Pages URL). Secrets: `SNAPPER_KEYSTORE_B64`, `SNAPPER_KEYSTORE_PASSWORD`, `SNAPPER_KEY_ALIAS`, `SNAPPER_KEY_PASSWORD`.

The APK is built by GitHub Actions on every PR (artifact `snapper-apk`).

## Credits

Shorts/Reels detection adapted from [Shorts-Blocker](https://github.com/atick-faisal/Shorts-Blocker) by Atick Faisal (Apache-2.0).
