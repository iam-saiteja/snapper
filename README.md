# Snapper

An Android app that keeps Instagram, YouTube, Shorts and Reels locked until you've done your daily tasks.
Each task ends with a short AI voice quiz. Pass it to earn points, then spend points to unlock apps.
Miss a deadline and you lose points. Go below zero and payment apps (PhonePe, CRED, GPay, Paytm) lock too.

- [How it works](#how-it-works)
- [Writing your schedule (JSON guide)](#writing-your-schedule-json-guide)
- [Generating a schedule with AI](#generating-a-schedule-with-ai)
- [Blocking rules (JSON)](#blocking-rules-json)
- [Installing on your phone](#installing-on-your-phone)
- [Project layout and configuration](#project-layout-and-configuration)

---

## How it works

| Event | Points |
|---|---|
| Pass a task's quiz | **+points** of that task (once per task) |
| Miss a task's deadline (quiz not passed by then) | **−penalty** of that task |
| Unlock an app for 15 min | **−costPer15Min** (from rules, default 10) |
| Blocker (Accessibility) turned off after it was on | **−violationPenalty** (default 50) |

- You start at **0 points**. With no points, Instagram and YouTube stay blocked.
- **Shorts and Reels stay blocked** even while the app is unlocked, unless the rules allow them.
- **Below 0 points**, the payment apps are locked until you earn your way back to 0 or above.
- **Quizzes:** the AI writes fresh questions from the task's `topic`. You answer by voice or text. Grading is strict, and vague answers fail. Each task allows 3 quiz attempts.
- **Emergency unlock:** explain the problem, and the AI decides whether it's a real emergency. Unlocks last 20 minutes at most, you get 3 per week, and every request is logged.
- **"Today" means India time (Asia/Kolkata).** Deadlines, dates and reminder times are all in IST.

### What you can and can't change

| | Today and past | Tomorrow onwards |
|---|---|---|
| Add tasks | ❌ | ✅ |
| Remove tasks | ❌ | ✅ |
| Edit a task | ❌ (remove and re-add a future one instead) | ❌ |
| Change blocking rules | Changes apply from **tomorrow** | ✅ |

The database enforces these rules (Supabase row-level security), not just the app.

---

## Writing your schedule (JSON guide)

Open **Admin → Import plan**, then paste the JSON or pick a `.json` file. An import only **adds** tasks.
Importing the same file twice creates duplicates. To undo something, remove it under **Admin → Upcoming tasks**.

### Smallest valid example

```json
{
  "plan": "DSA Course",
  "days": [
    {
      "date": "2026-10-21",
      "tasks": [{ "title": "Two pointers", "topic": "two pointers technique on arrays" }]
    }
  ]
}
```

Every field you leave out gets its default value (see below).

### Full example

```json
{
  "plan": "DSA Course",
  "start": "2026-10-21",
  "days": [
    {
      "day": 1,
      "tasks": [
        {
          "title": "Two pointers",
          "topic": "two pointers: pair sum in a sorted array, remove duplicates in place, container with most water",
          "deadline": "21:00",
          "quiz": { "questions": 5, "passScore": 4 },
          "points": 20,
          "penalty": 15
        },
        {
          "title": "Revise arrays",
          "topic": "array basics: prefix sums, Kadane's algorithm",
          "deadline": "23:00",
          "quiz": { "questions": 3, "passScore": 2 },
          "points": 10,
          "penalty": 5
        }
      ],
      "reminders": [
        { "time": "07:30", "text": "Start two pointers" },
        { "time": "20:00", "text": "One hour left for the quiz" }
      ]
    },
    {
      "day": 2,
      "tasks": [
        { "title": "Sliding window", "topic": "sliding window: fixed-size window max sum, longest substring without repeating characters" }
      ]
    },
    {
      "date": "2026-10-25",
      "tasks": [{ "title": "Mock test", "topic": "two pointers and sliding window mixed problems", "quiz": { "questions": 10, "passScore": 7 }, "points": 50, "penalty": 30 }]
    }
  ]
}
```

### Top level

| Field | Required | Format | Meaning |
|---|---|---|---|
| `plan` | ✅ | text | Name of the plan, e.g. `"DSA Course"`. Stored on every task. |
| `start` | only if any day uses `day` | `YYYY-MM-DD` | The date of `"day": 1`. |
| `days` | ✅ | list (at least 1) | One entry per day that has tasks or reminders. |

### Each entry in `days`

Give each day **either** a `date` **or** a `day` number.

| Field | Format | Meaning |
|---|---|---|
| `date` | `YYYY-MM-DD` | An exact date. |
| `day` | whole number ≥ 1 | Counted from `start`: `1` = start date, `2` = the next day, and so on. |
| `tasks` | list | The day's tasks (can be empty). |
| `reminders` | list | Notifications for that day (can be empty). |

You can mix `date` and `day` entries in the same file. Days you leave out simply have no tasks.

### Each task

| Field | Required | Default | Format | Meaning |
|---|---|---|---|---|
| `title` | ✅ | | text | Shown in the app. |
| `topic` | ✅ | | text | **What the quiz asks about.** Be specific (see tips). |
| `deadline` | | `"21:00"` | `HH:MM`, 24h, IST | Pass the quiz by this time, or you lose `penalty` points. |
| `quiz.questions` | | `5` | 1–20 | Number of questions in the quiz. |
| `quiz.passScore` | | `4` | 1 to `questions` | Correct answers needed to pass. |
| `points` | | `20` | ≥ 0 | Earned when you pass. |
| `penalty` | | `15` | ≥ 0 | Lost when the deadline passes without a pass. |

### Each reminder

| Field | Required | Format | Meaning |
|---|---|---|---|
| `time` | ✅ | `HH:MM`, 24h, IST | When the phone notifies you and reads the text aloud. |
| `text` | ✅ | text | What it says. |

### Rules the import checks

- **Every date must be tomorrow or later.** If one day is today or in the past, the whole import is rejected and nothing is saved.
- `passScore` can't be bigger than `questions`.
- Times must be `HH:MM` in 24-hour format (`"07:30"`, `"21:00"`, not `"9pm"`).
- Large files are fine. They're imported in batches of 500 tasks.
- Mistakes are listed with their location, e.g. `days.3.tasks.0.deadline: use HH:MM (24h)`.

### Tips

- **Write `topic` as a list of sub-topics**, not just a name. `"recursion"` gives vague questions. `"recursion: base case, call stack, factorial, fibonacci with memoization"` gives sharp ones.
- **Earn more than you need.** At the default cost of 10 points per 15 minutes, a 20-point task buys 30 minutes. Plan your points around how much screen time you want to allow yourself.
- **Make penalties hurt, but stay recoverable.** If missing one day sends you deeply negative, your payment apps stay locked for days.
- **Use bigger point values for weekly mock tests.**

---

## Generating a schedule with AI

Paste this into any AI chat (ChatGPT, Gemini, Claude) and fill in the parts in brackets:

```text
Create a study schedule as JSON for my app. Use exactly this format and nothing else:

{
  "plan": "<plan name>",
  "start": "<YYYY-MM-DD, tomorrow or later>",
  "days": [
    {
      "day": 1,
      "tasks": [
        {
          "title": "<short title>",
          "topic": "<topic: 3-5 specific sub-topics, comma separated>",
          "deadline": "<HH:MM 24h>",
          "quiz": { "questions": 5, "passScore": 4 },
          "points": 20,
          "penalty": 15
        }
      ],
      "reminders": [{ "time": "<HH:MM 24h>", "text": "<reminder text>" }]
    }
  ]
}

Rules:
- "day" counts from "start" (day 1 = start date). One entry per day.
- "topic" is what I'll be quizzed on, so list concrete sub-topics.
- Times are 24-hour HH:MM.
- passScore must be <= questions.
- Output only the JSON, no explanation.

My goal: <e.g. finish Striver's DSA sheet arrays + two pointers + sliding window>
Duration: <e.g. 30 days>, starting <date>
Daily study time: <e.g. 2 hours>, deadline <e.g. 21:00>
Rest days: <e.g. none / every Sunday>
Add a morning reminder at <07:30> and a mock test every <7th> day worth 50 points.
```

Then paste the result into **Admin → Import plan**. If anything is wrong, the import tells you exactly which field.

---

## Blocking rules (JSON)

**Admin → Blocking rules** holds what gets blocked and what it costs. Your first save applies today; every later
change applies from **tomorrow**, so you can't loosen the rules in a weak moment.

```json
{
  "blocked": [
    { "package": "com.instagram.android", "name": "Instagram", "costPer15Min": 10, "allowShortsWhenUnlocked": false },
    { "package": "com.google.android.youtube", "name": "YouTube", "costPer15Min": 10, "allowShortsWhenUnlocked": false }
  ],
  "penaltyLock": [
    { "package": "com.phonepe.app", "name": "PhonePe" },
    { "package": "com.dreamplug.androidapp", "name": "CRED" },
    { "package": "com.google.android.apps.nbu.paisa.user", "name": "Google Pay" },
    { "package": "net.one97.paytm", "name": "Paytm" }
  ],
  "violationPenalty": 50,
  "maxQuizAttemptsPerTask": 3,
  "emergency": { "maxMinutes": 20, "maxPerWeek": 3 }
}
```

| Field | Meaning |
|---|---|
| `blocked` | Apps that are always blocked unless you spend points. `package` is the Android package name (shown in the app's Play Store URL after `id=`). |
| `costPer15Min` | Points per 15 minutes of unlock. |
| `allowShortsWhenUnlocked` | `true` lets Shorts/Reels play while the app is unlocked. Default `false`. |
| `penaltyLock` | Apps locked while points are below 0. |
| `violationPenalty` | Points lost when the blocker is switched off. |
| `maxQuizAttemptsPerTask` | Quiz retries allowed per task. |
| `emergency.maxMinutes` / `maxPerWeek` | Limits for AI-approved emergency unlocks. |

To block another app (e.g. Snapchat), add `{ "package": "com.snapchat.android", "name": "Snapchat", "costPer15Min": 10 }` to `blocked`.

---

## Installing on your phone

1. Download the latest **snapper-apk** artifact from [GitHub Actions](https://github.com/iam-saiteja/snapper/actions) (open the newest run on `main` and look under "Artifacts"). Unzip it and install `app-release.apk`.
2. Sign in, then turn off new sign-ups in Supabase → Authentication.
3. **Setup** tab: turn on Accessibility, Device admin, Notifications and Background sync.
   - On Android 13+, if the Accessibility switch is greyed out ("Restricted setting"), go to Settings → Apps → Snapper → ⋮ → **Allow restricted settings**.
4. **Admin** tab: save the rules, then import your schedule.

Once the blocker is on, Snapper also hides its own Settings and uninstall screens. Use **Emergency → Settings** if you really need them.

---

## Project layout and configuration

| Path | What |
|---|---|
| `src/` | React app (the Android UI, also served on the web as the admin panel) |
| `shared/schema.ts` | Schedule and rules JSON schemas, shared by the app and the server |
| `worker/` | Cloudflare Worker: `/api/*` (quiz, grading, unlocks, emergency, transcription, device sync). Everything else is static files from `dist/` |
| `supabase/migrations/` | Database schema, row-level security, missed-deadline penalty job |
| `android/app/src/main/java/com/saiteja/snapper/` | Native blocker (AccessibilityService), reminders, background sync |

- **Public client config** (Supabase URL, publishable key, API URL) lives in `.env.production`. It's safe to commit.
- **Cloudflare Worker** `snapper` on account `6223f4755cd165d71614d9659c53c84c` (pinned in `wrangler.jsonc`) is deployed by Workers Builds when `main` changes. Secrets are set with `wrangler secret put <NAME> --name snapper`: `GEMINI_API`, `GROQ_API`, `SUPABASE_SECRET_KEY`.
- **AI**: Groq (`openai/gpt-oss-120b`, Whisper) answers first in about 2 seconds. Gemini Flash is the fallback, and handles YouTube summaries.
- **Voice recordings** stay on the phone. Only transcripts are stored in Supabase.
- **GitHub Actions** builds a signed APK for every PR (artifact `snapper-apk`). Signing secrets: `SNAPPER_KEYSTORE_B64`, `SNAPPER_KEYSTORE_PASSWORD`, `SNAPPER_KEY_ALIAS`, `SNAPPER_KEY_PASSWORD`. Back up the keystore in `~/.snapper/`: without it, updates can't install over the existing app.

## Credits

Shorts/Reels detection adapted from [Shorts-Blocker](https://github.com/atick-faisal/Shorts-Blocker) by Atick Faisal (Apache-2.0).
