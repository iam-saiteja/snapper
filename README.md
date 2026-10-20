# Snapper

**An Android app that keeps your distracting apps locked until you've done your work.**

You plan your days (for example "two pointers today, sliding window tomorrow"). Each task ends with a short AI
quiz that you answer by voice. Pass it and you earn points; spend points to unlock Instagram or YouTube for
15 minutes at a time. Miss a deadline and you lose points, and if you go below zero your payment apps lock too.
Shorts and Reels stay blocked even while an app is unlocked.

It's built to be hard to cheat: points, quiz grading and unlocks are decided on the server, today's plan can't be
edited once the day starts, and loosening any rule only takes effect the next day.

> **Status:** early and actively developed. It runs on the author's phone; expect rough edges. Android only.

## Features

| | |
|---|---|
| 🧠 **Voice quizzes** | AI writes fresh questions from each task's topic, reads them aloud, listens to your answer and grades it strictly. |
| 🔒 **App blocker** | Blocks chosen apps, or whole categories (all social apps, all payment apps), until you spend points. |
| 📵 **Shorts & Reels** | Closes YouTube Shorts and Instagram Reels even inside an unlocked app. |
| 💸 **Penalties** | Missed deadlines cost points. Below zero, every UPI payment app locks. |
| 🌙 **Sleep mode** | Locks the whole phone at night except calls, alarms and websites you allow. |
| 🛡️ **Content filter** | Requires Android Private DNS set to [AdGuard Family](https://adguard-dns.io/) and keeps it locked. |
| 🤖 **AI gatekeeper** | For real emergencies, you talk to an AI that sees your history (past requests, violations) and decides. |
| ⏰ **Voice reminders** | Reminders that play your own recorded voice. Voice notes with transcripts. |
| 🔗 **Saved links** | Share a reel or link to Snapper; it saves it, summarises YouTube videos, and reminds you later. |
| 📅 **Calendar & Apps** | Month view of tasks and points; per-app screen time like Digital Wellbeing. |
| 🧾 **Everything in JSON** | One JSON file sets up your whole schedule and every rule. [Configuration guide →](docs/configuration.md) |

Recordings never leave the phone (only transcripts are stored). The AI runs on the free tiers of
[Groq](https://console.groq.com/) and [Gemini](https://aistudio.google.com/).

## How it's built

```
Android app (React + Capacitor)          Cloudflare Worker (/api)              Supabase (Postgres)
 ├─ screens: Today, Calendar, Apps,  ──▶  quiz generation + grading      ──▶  tasks, rules, points ledger,
 │  Notes, Reminders, Links, Admin        unlocks, AI gatekeeper,              unlocks, chats, violations
 └─ native Java plugin:                   transcription, device sync           row-level security + pg_cron
    accessibility blocker, sleep,               │
    DNS check, alarms, share target             └─▶ Groq (gpt-oss, Whisper), Gemini (fallback, YouTube)
```

| Path | What |
|---|---|
| `src/` | React app (also served on the web as the admin panel) |
| `shared/schema.ts` | Schedule and rules JSON schemas, shared by app and server |
| `worker/` | Cloudflare Worker: `/api/*`. Everything else is static files from `dist/` |
| `supabase/migrations/` | Database schema, row-level security, penalty job, rule guards |
| `android/app/src/main/java/com/saiteja/snapper/` | Native blocker, sleep mode, DNS lock, app catalog, reminders, background sync |

## Using it

Snapper isn't on the Play Store (Google restricts apps that use Accessibility like this), and it needs its own
backend. To use it, you run your own copy. Everything it needs has a free tier.

### What you need

- An Android phone (Android 9+ recommended; the content filter needs 9+)
- Accounts on [Supabase](https://supabase.com), [Cloudflare](https://dash.cloudflare.com), [Groq](https://console.groq.com) and [Google AI Studio](https://aistudio.google.com) (all free)
- Node.js 22+ and a GitHub account. Android Studio is **not** required: GitHub Actions builds the APK.

### 1. Fork and install

Fork this repo, then:

```bash
git clone https://github.com/<you>/snapper.git
cd snapper
npm install
```

### 2. Database (Supabase)

1. Create a Supabase project.
2. In the **SQL Editor**, run every file in `supabase/migrations/` **in order** (`0001_…` first).
3. From **Project Settings → API Keys**, note the project URL, the **publishable** key and the **secret** key.

### 3. Server (Cloudflare Worker)

1. In `wrangler.jsonc`, set `account_id` to your Cloudflare account ID (`npx wrangler whoami` shows it) and
   `vars.SUPABASE_URL` to your Supabase URL.
2. Log in and add the three secrets:

   ```bash
   npx wrangler login
   npx wrangler secret put GEMINI_API           # Google AI Studio key
   npx wrangler secret put GROQ_API             # Groq key
   npx wrangler secret put SUPABASE_SECRET_KEY  # Supabase secret key (sb_secret_…)
   ```

3. Deploy with `npm run build && npx wrangler deploy`, or connect the repo in **Workers & Pages → Create → Import
   a repository** (build command `npm run build`, deploy command `npx wrangler deploy`) so every push to `main`
   deploys.

### 4. App config

Edit `.env.production` with **your** values. These are public by design; never put secrets here.

```env
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_API_BASE=https://snapper.<your-subdomain>.workers.dev
```

### 5. Build the APK

The `Build APK` workflow signs and builds the app on every pull request and push to `main`. It needs a signing
key, which must stay the same forever (Android only installs updates signed with the same key):

```bash
keytool -genkeypair -keystore snapper-release.jks -storetype PKCS12 -alias snapper \
  -keyalg RSA -keysize 4096 -validity 36500
```

Back the keystore up somewhere safe, then add these **repository secrets** (Settings → Secrets and variables →
Actions):

| Secret | Value |
|---|---|
| `SNAPPER_KEYSTORE_B64` | `base64 -w0 snapper-release.jks` |
| `SNAPPER_KEYSTORE_PASSWORD` | keystore password |
| `SNAPPER_KEY_ALIAS` | `snapper` |
| `SNAPPER_KEY_PASSWORD` | key password |

Push to `main`, open the workflow run, and download **snapper-apk** from "Artifacts".

### 6. Set up the phone

1. Install the APK, open Snapper and create your account. Then **turn off sign-ups** in Supabase →
   Authentication, so nobody else can use your backend and AI quota.
2. **Setup** tab: turn on Accessibility, Device admin, Notifications, Exact alarms, Usage access and Background sync.
   On Android 13+, if Accessibility is greyed out ("Restricted setting"): Settings → Apps → Snapper → ⋮ →
   **Allow restricted settings**.
3. **Admin** tab: save your rules and import a schedule. The [configuration guide](docs/configuration.md) covers
   every option and has a ready-made prompt for generating a schedule with any AI chat.

> Once the blocker is on, Instagram and YouTube are blocked straight away, and Snapper hides its own settings
> screens. Your first tasks can start tomorrow at the earliest, so turn it on when you're ready.

## Local development

```bash
npm run dev                          # app UI at http://localhost:5173 (native features are stubbed)
npx wrangler dev                     # API at http://localhost:8787
npm run typecheck                    # app types
npx tsc -p worker/tsconfig.json      # Worker types
```

For `wrangler dev`, put the three secrets in a `.dev.vars` file (git-ignored) as `NAME=value` lines.
Native (Android) code compiles in CI; to build locally you need the Android SDK: `npm run sync`, then
`cd android && ./gradlew assembleDebug`.

## Contributing

Contributions are very welcome. **Open a pull request directly**; no need to ask first. For bigger changes, an
issue to discuss the idea first saves everyone time.

1. Fork the repo and create a branch from `main`.
2. Make your change, keeping it focused on one thing.
3. Check it: `npm run typecheck`, `npx tsc -p worker/tsconfig.json` and `npm run build`.
4. Open a pull request against `main`. Say what changed, why, and how you tested it.

CI builds the APK and type-checks the Worker on every pull request; it needs to pass. See
[CONTRIBUTING.md](CONTRIBUTING.md) for conventions (database migrations, the native code, security).

**Good places to start:**

- **Shorts / Reels detection** (`ShortsDetectors.java`) relies on view IDs that change when Instagram or YouTube
  update. Reports and fixes for new app versions are always useful.
- **Other languages:** the Settings protection and the Private DNS check look for English text.
- **More phones:** dialer, clock and settings package names differ between manufacturers (`SleepMode.java`).
- Docs, translations, and tests for the Worker.

Found a security issue (a way to get around a lock, or to read another user's data)? Please report it privately
through [GitHub security advisories](../../security/advisories/new) instead of a public issue.

## Limitations

- **Android only**, installed outside the Play Store.
- **Not unbreakable.** Safe mode or a factory reset gets around it. It's designed so cheating takes deliberate,
  annoying effort and costs points, not to be impossible.
- **App detection can break** when Instagram, YouTube or Chrome change their screens.
- **Free AI tiers** have rate limits; Snapper falls back from Groq to Gemini when one is busy.

## Credits

Shorts/Reels detection is adapted from [Shorts-Blocker](https://github.com/atick-faisal/Shorts-Blocker) by
Atick Faisal (Apache-2.0).
