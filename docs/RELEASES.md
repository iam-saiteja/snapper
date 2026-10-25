# Releases

Snapper ships as a signed Android APK attached to a [GitHub Release](https://github.com/iam-saiteja/snapper/releases),
built automatically when a version tag is pushed. Planned work is tracked in
[milestones](https://github.com/iam-saiteja/snapper/milestones).

- [Roadmap](#roadmap)
- [Version numbers](#version-numbers)
- [Cutting a release](#cutting-a-release)
- [Upgrading your copy](#upgrading-your-copy)
- [Hotfixes](#hotfixes)

## Roadmap

Each release is a milestone. A release ships when its milestone's "done when" is true, not on a fixed date.

| Release | Goal | Done when |
|---|---|---|
| [**v0.1.0**](https://github.com/iam-saiteja/snapper/milestone/1) | First tagged release: what runs on the author's phone today, plus tag-based releases | v0.1.0 is tagged and its release has a signed APK |
| [**v0.2.0** · Reliable blocker](https://github.com/iam-saiteja/snapper/milestone/2) | No unfair penalties, locks always hold: the accessibility service turning itself off ([#10](https://github.com/iam-saiteja/snapper/issues/10)), payment-app lock ([#11](https://github.com/iam-saiteja/snapper/issues/11)), battery-optimisation prompt, recording why the blocker stopped | A full week on a real phone with no unexplained blocker-off, and payment apps locked whenever points are below 0 |
| [**v0.3.0** · Open-source launch](https://github.com/iam-saiteja/snapper/milestone/3) | Anyone can run their own: public repo + private personal deployment, a license, a server-address screen so one APK works with any backend, a project signing key, issue templates | Someone new follows the README to a working phone without help |
| [**v0.4.0** · Polish](https://github.com/iam-saiteja/snapper/milestone/4) | Pleasant every day: design and onboarding, Worker tests, other languages, more phone brands | A few outside users use it daily and report it works on their phones |
| [**v1.0.0** · Stable](https://github.com/iam-saiteja/snapper/milestone/5) | A stability promise | No open P1 bugs, 2+ weeks on 3+ phone brands, docs complete, every upgrade path documented |

## Version numbers

Tags are `vMAJOR.MINOR.PATCH` (for example `v0.2.0`), following [Semantic Versioning](https://semver.org/):

- **MINOR** (`v0.2.0` → `v0.3.0`): a milestone. New features and fixes.
- **PATCH** (`v0.2.0` → `v0.2.1`): urgent fixes only, nothing new.
- **MAJOR**: `v1.0.0` once the stability criteria are met. While on `0.x`, any release may change the rules or
  the JSON formats (the release notes say how to migrate).

The Android version comes from the tag, so nothing needs editing by hand:

| Build | `versionName` | `versionCode` |
|---|---|---|
| Tag `vX.Y.Z` | `X.Y.Z` | `X*10000 + Y*100 + Z` (e.g. `v0.2.0` → 200) |
| `main` or a pull request | `X.Y.Z-dev.<run>+<commit>` (last release) | same as the last release |
| Local build | `0.0.0-local` | 1 |

Android only installs an update with an equal or higher version code, and only if it's signed with the same key.
Development builds reuse the last release's code, so they install over it, and the next release (higher code)
installs over them. Minor and patch must stay 0–99. The app's version is shown at the bottom of the **Setup** tab.

## Cutting a release

1. **Finish the milestone.** Every issue in it is closed, or moved to a later milestone.
2. **Make sure `main` is green**: the `Build APK` and Cloudflare checks pass on the latest commit.
3. **Apply new migrations** to the live database (anything added under `supabase/migrations/` since the last
   release). The Worker on `main` may already depend on them.
4. **Tag and push** from an up-to-date `main`:

   ```bash
   git checkout main && git pull
   git tag -a v0.2.0 -m "Snapper v0.2.0"
   git push origin v0.2.0
   ```

5. **The workflow does the rest.** It builds the signed APK, then creates the GitHub Release `Snapper v0.2.0` with:
   - `snapper-v0.2.0.apk` attached
   - upgrade steps, listing the migrations added since the previous release
   - notes generated from the merged pull requests
6. **Close the milestone**, and install the APK on your phone.

A tag that isn't `vX.Y.Z` (e.g. `v1.2`, `v1.2.3-rc.1`) fails the workflow on purpose. A release also needs the
signing secrets and the `SNAPPER_API_BASE` variable, so it fails instead of publishing an unsigned or unusable APK.

## Upgrading your copy

Always in this order, because each step can depend on the one before:

1. **Database:** run the migrations listed in the release notes, in order, in the Supabase SQL Editor.
2. **Server:** deploy the Worker from the release (automatic when your repo is connected to Cloudflare and you've
   pulled the release into `main`).
3. **Phone:** install the release APK over the old one. Your data stays because it's signed with the same key.

Migrations are never edited after release; changes always come as a new numbered file.

## Hotfixes

For a release that's broken in a way that can't wait for the next milestone (for example the blocker failing,
or wrong penalties):

1. Fix it on `main` through a normal pull request.
2. Tag the next patch version (`v0.2.0` → `v0.2.1`) and push the tag.
