# Contributing to Snapper

Thanks for helping. Pull requests are welcome directly; open one against `main`.

## Workflow

1. Fork, then branch from `main` (`fix/short-description` or `feat/short-description`).
2. Keep each pull request to one change. Small PRs get reviewed and merged faster.
3. Before pushing:

   ```bash
   npm run typecheck
   npx tsc -p worker/tsconfig.json
   npm run build
   ```

4. Open the PR against `main` and fill in the template: what, why, and how you tested it.
   The `Build APK` check (Worker type-check + APK build) must pass. Pull requests from forks don't get the
   signing secrets, so they build a debug APK instead. That still compiles and checks everything.

## Conventions

- **Match the surrounding code.** TypeScript for the app and Worker, Java for the native Android code.
  Comments explain *why*, not *what*.
- **Strictness is the product.** Changes must not create a way around a lock: no client-side point awards,
  no edits to today's or past tasks, no immediate loosening of rules. If you change how a lock works, explain in
  the PR how it still can't be bypassed.
- **The server decides.** Points, quiz grading, unlocks and gatekeeper decisions happen in `worker/` with the
  Supabase secret key; the app only displays them.
- **Database changes** go in a **new** numbered file in `supabase/migrations/` (`0006_…sql`). Never edit a
  migration that's already been released. Every new table needs row-level security.
- **Shared formats** (schedule, rules, device state) live in `shared/schema.ts`. Update the
  [configuration guide](docs/configuration.md) when you add or change an option, and keep its JSON examples valid.
- **Native code:** watch Java string literals; a `\n` must stay an escape, not a real line break.
  Shorts/Reels detection lives in `ShortsDetectors.java`. Note which app version you tested against.

## Security

Never commit keys, `.env` files or anyone's deployment values (URLs, account IDs). Every deployment's settings
live in its own Cloudflare Worker secrets and GitHub repository variable; the code must keep working without them.
Report vulnerabilities privately through GitHub security advisories, not public issues.

## Reporting bugs

Open an issue with your phone model, Android version, Snapper version, and the app version involved (for
example the Instagram version when Reels aren't detected). Screenshots of the Setup tab's "What the blocker is
enforcing" help a lot.
