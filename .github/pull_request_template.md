## What

<!-- What does this change? -->

## Why

<!-- The problem it solves, or the issue it closes (e.g. "Closes #12"). -->

## How I tested it

<!-- Commands run, phone + Android version, app versions (for detection changes). -->

## Checklist

- [ ] `npm run typecheck`, `npx tsc -p worker/tsconfig.json` and `npm run build` pass
- [ ] Database changes are in a new migration file, with row-level security
- [ ] New or changed options are documented in `docs/configuration.md`
- [ ] This doesn't create a way around a lock (or the PR explains why not)
