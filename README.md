# Snapper

An Android app that keeps Instagram, YouTube, Shorts and Reels locked until you've done your daily tasks.
Each task ends with a short AI voice quiz. Pass it to earn points, then spend points to unlock apps.
Miss a deadline and you lose points. Go below zero and payment apps (PhonePe, CRED, GPay, Paytm) lock too.

- [How it works](#how-it-works)
- [Writing your schedule (JSON guide)](#writing-your-schedule-json-guide)
- [Generating a schedule with AI](#generating-a-schedule-with-ai)
- [Blocking rules (JSON)](#blocking-rules-json)
- [Sleep mode](#sleep-mode)
- [Content filter (DNS lock)](#content-filter-dns-lock)
- [Asking the gatekeeper to unlock](#asking-the-gatekeeper-to-unlock)
- [Blocking apps yourself (Apps tab)](#blocking-apps-yourself-apps-tab)
- [Blocking whole app categories](#blocking-whole-app-categories)
- [One JSON for everything](#one-json-for-everything)
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
- **Sleep mode** locks the whole phone at night, except calls, alarms and the websites you allow.
- **Content filter** (DNS lock) keeps the phone locked until you set AdGuard Family DNS, then enforces it.
- **"Today" means India time (Asia/Kolkata).** Deadlines, dates, reminders and sleep times are all in IST.

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

**Admin → Blocking rules** holds what gets blocked, what it costs, and the sleep schedule. Your first save applies
today; every later change applies from **tomorrow**, so you can't loosen the rules in a weak moment.

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
  "blockCategories": ["social"],
  "categoryCostPer15Min": 10,
  "penaltyLockCategories": ["payments"],
  "exceptApps": ["com.whatsapp", "com.whatsapp.w4b"],
  "sleep": {
    "windows": [
      { "start": "23:00", "end": "06:30", "days": ["sun", "mon", "tue", "wed", "thu"] },
      { "start": "00:30", "end": "08:00", "days": ["sat", "sun"] }
    ],
    "allowApps": [],
    "allowWebsites": ["just-us-0kbw.onrender.com"]
  },
  "dns": { "lock": true, "host": "family.adguard-dns.com" },
  "violationPenalty": 50,
  "maxQuizAttemptsPerTask": 3,
  "emergency": { "maxMinutes": 20, "maxPerWeek": 3 }
}
```

Every field is optional. Missing fields get their defaults, and missing lists are empty.

| Field | Default | Meaning |
|---|---|---|
| `blocked` | `[]` | Specific apps that are always blocked unless you spend points. `package` is the Android package name (copy it from the **Apps** tab, or from the Play Store URL after `id=`). |
| `blocked[].costPer15Min` | | Points per 15 minutes of unlock. |
| `blocked[].allowShortsWhenUnlocked` | `false` | `true` lets Shorts/Reels play while the app is unlocked. |
| `penaltyLock` | `[]` | Specific apps locked while points are below 0. |
| `blockCategories` | `[]` | Block **every installed app** in these categories (see [categories](#blocking-whole-app-categories)). |
| `categoryCostPer15Min` | `10` | Unlock price for category-blocked apps. |
| `penaltyLockCategories` | `[]` | Lock every installed app in these categories while points are below 0. |
| `exceptApps` | `[]` | Packages never caught by `blockCategories` / `penaltyLockCategories`. |
| `sleep` | none | Sleep schedule (see [Sleep mode](#sleep-mode)). |
| `dns` | off | Content filter via Private DNS (see [Content filter](#content-filter-dns-lock)). |
| `violationPenalty` | `50` | Points lost when the blocker is switched off after it was on. |
| `maxQuizAttemptsPerTask` | `3` | Quiz retries allowed per task. |
| `emergency.maxMinutes` / `maxPerWeek` | `20` / `3` | Limits for AI-approved emergency unlocks. |

---

## Sleep mode

During a sleep window, Snapper blocks **the whole phone** except:

- **phone calls** (dialer, the incoming-call screen, contacts) and your SMS app (for OTPs)
- the **clock**, so alarms ring and can be turned off
- the keyboard, the home screen, and Snapper itself
- apps in `sleep.allowApps`
- **Chrome, only while it shows a site in `sleep.allowWebsites`.** Any other site gets closed. The sleep screen has an **Open just-us-0kbw.onrender.com** button that opens the site in Chrome.

| Field | Format | Meaning |
|---|---|---|
| `sleep.windows[].start` / `end` | `HH:MM`, 24h, IST | Start and end time. A window can cross midnight (`23:00` → `06:30`). |
| `sleep.windows[].days` | `["mon", …, "sun"]`, default every day | The days the window **starts** on. `23:00 fri → 06:30` covers Friday night and Saturday morning. |
| `sleep.allowApps` | package names | Extra apps allowed during sleep. |
| `sleep.allowWebsites` | host or URL | Sites Chrome may show during sleep, e.g. `"just-us-0kbw.onrender.com"`. |

- Points can't unlock sleep mode. **Emergency → Sleep mode** asks the AI, and approved requests count toward the weekly limit.
- Settings are blocked during sleep too, unless you have an emergency unlock for Settings.

---

## Content filter (DNS lock)

`"dns": { "lock": true, "host": "family.adguard-dns.com" }` turns on an adult-content filter for the **whole phone**,
in every app and browser, using Android's Private DNS with [AdGuard Family DNS](https://adguard-dns.io/).

**Snapper never changes the DNS itself — you set it once:**

1. When the lock is on and Private DNS isn't set, the phone is locked: only calls, alarms, the keyboard, the home screen and Settings work. The block screen has a **Set Private DNS** button.
2. Go to **Settings → Network & internet → Private DNS → Private DNS provider hostname**, enter `family.adguard-dns.com`, and save.
3. The phone unlocks. From then on Snapper watches the setting: if Private DNS is ever changed away from that host, you lose the violation penalty, it's logged, and the phone locks again until you set it back.

The Private DNS settings screen is reachable (so you can set it), but turning the lock *off* only happens by [asking the gatekeeper](#asking-the-gatekeeper-to-unlock), and like all rule changes it takes effect the next day.

| Field | Default | Meaning |
|---|---|---|
| `dns.lock` | `false` | Turn the content filter on. |
| `dns.host` | `family.adguard-dns.com` | The Private DNS hostname you must set. |

---

## Asking the gatekeeper to unlock

Every unlock that isn't bought with points — a payment app while points are negative, sleep mode, the content
filter, Settings — goes through **Today → Ask to unlock**, a conversation with an AI gatekeeper.

- It's a back-and-forth: you explain, it can ask questions, then it approves (a short, logged unlock) or denies.
- **It knows your history.** Before replying it sees your points, your task record, your past unlock requests and
  how they were decided, and your rule violations. So it can say things like *"you asked for this two days ago and
  it was refused"* or *"you changed the content-filter DNS last week, the filter stays on."*
- It's strict by design, and strictest about the content filter and sleep mode. Boredom, cravings and vague or
  manipulative reasons are refused. Genuine, time-sensitive needs (medical, safety, a payment due now) are approved
  for the fewest minutes needed.
- Approved unlocks count toward `emergency.maxPerWeek`; denials don't. Everything is logged.

---

## Blocking apps yourself (Apps tab)

Every app in the **Apps** tab has two buttons:

| Button | What it does | Can you undo it? |
|---|---|---|
| **Block** | Blocks the app right away. | Yes: tap **Unblock** any time. |
| **Block until tasks** | Blocks the app while any of today's tasks are still pending. Once they're all done, it's allowed for the rest of the day, and it's blocked again tomorrow. | **No.** It's a commitment. The database refuses to remove it. |

These take effect immediately (unlike rules, which wait until tomorrow), because they only ever make things stricter
or remove a block you chose to be removable. They can't be unlocked with points.

---

## Blocking whole app categories

Snapper reads every installed app on the phone and the category its developer declared on Android. The **Apps** tab
lists them all, with category, package name, today's screen time (from the same data Digital Wellbeing uses, so it
needs **Usage access**) and whether Snapper blocks the app right now.

| Category | What it catches |
|---|---|
| `social` | Apps declared as social, plus a built-in list: Instagram, Threads, Facebook, Snapchat, X, Reddit, ShareChat, Moj, Josh, Pinterest, LinkedIn |
| `payments` | Every app that can open UPI payment links (PhonePe, GPay, Paytm, CRED, BHIM, bank apps, Amazon…) |
| `video` | Streaming / video apps (YouTube, Netflix, Hotstar…) |
| `games` | Games |
| `audio`, `image`, `news`, `maps`, `productivity` | Android's other declared categories |

- `"blockCategories": ["social"]` blocks all social apps, including ones you install later. Unlocking one costs `categoryCostPer15Min`.
- `"penaltyLockCategories": ["payments"]` locks every payment app while points are negative.
- Put apps you never want caught (e.g. WhatsApp, which also handles UPI) in `exceptApps`.
- The Apps tab shows what each rule catches, so check it after changing categories.

---

## One JSON for everything

A schedule file can include `"rules"`, so **one file sets up everything**: tasks, reminders, blocking, categories,
sleep, costs and emergency limits. Import it in **Admin → Import plan**. The rules part is saved as new rules
(effective tomorrow, or today if you've never saved rules).

```json
{
  "plan": "DSA Course",
  "start": "2026-10-21",
  "rules": {
    "blocked": [
      { "package": "com.instagram.android", "name": "Instagram", "costPer15Min": 10 },
      { "package": "com.google.android.youtube", "name": "YouTube", "costPer15Min": 10 }
    ],
    "blockCategories": ["social"],
    "penaltyLockCategories": ["payments"],
    "exceptApps": ["com.whatsapp"],
    "sleep": {
      "windows": [{ "start": "23:00", "end": "06:30" }],
      "allowWebsites": ["just-us-0kbw.onrender.com"]
    }
  },
  "days": [
    { "day": 1, "tasks": [{ "title": "Two pointers", "topic": "two pointers: pair sum, remove duplicates, container with most water" }] }
  ]
}
```

A file with only `"rules"` (and no `days`) is also valid. Use it to change just the rules.

**What JSON can't do:** Android only lets you turn on Accessibility, Device admin, Usage access, Notifications
and exact alarms yourself, in the **Setup** tab. Everything else is in the JSON.

---

## Installing on your phone

1. Download the latest **snapper-apk** artifact from [GitHub Actions](https://github.com/iam-saiteja/snapper/actions) (open the newest run on `main` and look under "Artifacts"). Unzip it and install `app-release.apk`.
2. Sign in, then turn off new sign-ups in Supabase → Authentication.
3. **Setup** tab: turn on Accessibility, Device admin, Notifications, Exact alarms, Usage access and Background sync. If the content filter is on, set Private DNS to the host it shows.
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
| `android/app/src/main/java/com/saiteja/snapper/` | Native blocker (AccessibilityService), sleep mode, app categories and screen time, reminders, background sync |

- **Public client config** (Supabase URL, publishable key, API URL) lives in `.env.production`. It's safe to commit.
- **Cloudflare Worker** `snapper` on account `6223f4755cd165d71614d9659c53c84c` (pinned in `wrangler.jsonc`) is deployed by Workers Builds when `main` changes. Secrets are set with `wrangler secret put <NAME> --name snapper`: `GEMINI_API`, `GROQ_API`, `SUPABASE_SECRET_KEY`.
- **AI**: Groq (`openai/gpt-oss-120b`, Whisper) answers first in about 2 seconds. Gemini Flash is the fallback, and handles YouTube summaries.
- **Voice recordings** stay on the phone. Only transcripts are stored in Supabase.
- **GitHub Actions** builds a signed APK for every PR (artifact `snapper-apk`). Signing secrets: `SNAPPER_KEYSTORE_B64`, `SNAPPER_KEYSTORE_PASSWORD`, `SNAPPER_KEY_ALIAS`, `SNAPPER_KEY_PASSWORD`. Back up the keystore in `~/.snapper/`: without it, updates can't install over the existing app.

## Credits

Shorts/Reels detection adapted from [Shorts-Blocker](https://github.com/atick-faisal/Shorts-Blocker) by Atick Faisal (Apache-2.0).
