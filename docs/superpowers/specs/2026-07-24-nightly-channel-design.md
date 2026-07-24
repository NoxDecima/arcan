# Nightly release channel — design

Date: 2026-07-24
Status: approved (brainstorm)

## Problem

Testing an iteration on a real phone currently requires a `v*` tag — which
deploys the prod VPS and publishes a "Latest" release everyone sees. Wanted: a
deliberate, installable build channel that is visibly NOT a stable release.

## Decisions (brainstorm)

- Trigger: **`nightly-*` tags** (deliberate publish moments, recorded in git).
  Rejected: every-main-push (noisy), workflow_dispatch (no git record).
- APK identity: **same applicationId — replace-in-place**. Rejected:
  `.nightly` side-by-side variant (second Tauri config, icon work).
- Scope: **APK only**. No web/VPS nightly. Rejected: nightly VPS stack.

## Behavior

- `android.yml` also triggers on `nightly-*` tags: same signing, same
  ARCAN_ORIGIN release gate, same build. The GitHub Release step publishes
  nightly tags with `prerelease: true`, a `Nightly <tag>` title, and a body
  warning ("testing build — not a stable release"). Pre-releases never become
  "Latest", so the releases page still leads with the last stable.
- `deploy.yml` remains `v*`-only — **a nightly can never deploy prod**; a
  guard comment pins this against future edits.
- `android-v*` and `v*` behavior unchanged.

## Versioning (deliberately none)

Nightly builds carry whatever version the tagged ref has — no bump, no
versionCode override. With replace-in-place this gives clean transitions:
stable v0.1.7 → nightly (same versionCode, sideload same-version replace with
matching signature) → next nightly (same) → next stable v0.1.8 (higher code,
normal upgrade). No downgrade block, no uninstall, device data survives.
Accepted tradeoff: the app cannot display WHICH nightly it runs — the
pre-release body records tag + commit. Device checklist gains a line verifying
the same-version sideload replace.

## Verification

CI is verified by CI: after merge, push the first `nightly-*` tag and confirm
(a) APK pre-release published, marked pre-release, not "Latest"; (b) deploy
workflow did NOT run; (c) stable release list unchanged. (Tag-triggered
workflows read the workflow file at the tag's ref — the tag must be cut after
the merge.)

## Out of scope

- Web nightly deploys; side-by-side app ids; auto-pruning old nightlies
  (manual for now); in-app nightly identification.
