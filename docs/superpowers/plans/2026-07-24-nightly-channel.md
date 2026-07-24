# Nightly Release Channel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `nightly-*` tags publish a signed APK as a GitHub PRE-release (never "Latest", never deploying prod), so iterations are phone-testable without a stable release.

**Architecture:** One conditional in `android.yml`'s existing release step + the tag trigger; a guard comment in `deploy.yml`; docs. No new workflows, no signing/version changes.

**Tech Stack:** GitHub Actions, softprops/action-gh-release@v2.

**Design decisions already locked (do not relitigate):** nightly-* tags; same applicationId (replace-in-place); APK only; no version/versionCode surgery (see spec `2026-07-24-nightly-channel-design.md`).

---

## Task 1: Workflow conditional + guard comment + docs

**Files:**
- Modify: `.github/workflows/android.yml` (tags list ~line 9; GitHub Release step ~line 136)
- Modify: `.github/workflows/deploy.yml` (trigger comment ~line 10)
- Modify: `deploy/README.md` (Automated deploys section)
- Modify: `docs/testing/android-device-checklist.md`

- [ ] **Step 1: Tag trigger**

In `.github/workflows/android.yml`, the `on.push.tags` list currently reads:

```yaml
    # v* is the general release convention (APK + VPS deploy via deploy.yml);
    # android-v* kept as a forgiving alias that builds the APK only.
    tags: ["v*", "android-v*"]
```

becomes:

```yaml
    # v* is the general release convention (APK + VPS deploy via deploy.yml);
    # android-v* kept as a forgiving alias that builds the APK only.
    # nightly-* publishes a PRE-release APK for testing — never "Latest",
    # never deployed (deploy.yml is v*-only by design).
    tags: ["v*", "android-v*", "nightly-*"]
```

- [ ] **Step 2: Pre-release conditional**

The `GitHub Release` step:

```yaml
      - name: GitHub Release
        if: startsWith(github.ref, 'refs/tags/')
        # third-party action — consider SHA-pinning before secrets-bearing releases become routine
        uses: softprops/action-gh-release@v2
        with:
          # NOTE: verify this path after the first CI run — see Build APK note above.
          files: src-tauri/gen/android/app/build/outputs/apk/universal/release/*.apk
          generate_release_notes: true
          fail_on_unmatched_files: true
```

becomes:

```yaml
      - name: GitHub Release
        if: startsWith(github.ref, 'refs/tags/')
        # third-party action — consider SHA-pinning before secrets-bearing releases become routine
        uses: softprops/action-gh-release@v2
        with:
          # NOTE: verify this path after the first CI run — see Build APK note above.
          files: src-tauri/gen/android/app/build/outputs/apk/universal/release/*.apk
          generate_release_notes: true
          fail_on_unmatched_files: true
          # nightly-* → pre-release: never shown as "Latest"; body warns testers.
          prerelease: ${{ startsWith(github.ref, 'refs/tags/nightly-') }}
          name: ${{ startsWith(github.ref, 'refs/tags/nightly-') && format('Nightly {0}', github.ref_name) || github.ref_name }}
          body: ${{ startsWith(github.ref, 'refs/tags/nightly-') && format('⚠️ Nightly testing build from `{0}` — not a stable release. Install the latest stable unless you are testing.', github.sha) || '' }}
```

- [ ] **Step 3: deploy.yml guard comment**

In `.github/workflows/deploy.yml`, above `tags: ["v*"]` add:

```yaml
    # v* ONLY — nightly-* tags must NEVER deploy prod (nightly-channel spec
    # 2026-07-24). Do not widen this filter.
```

- [ ] **Step 4: Docs**

`deploy/README.md` § Automated deploys (CI): add a "Nightly channel" paragraph — `git tag nightly-YYYY-MM-DD && git push origin <tag>` on main publishes a signed pre-release APK; never deploys; stable flow unchanged.

`docs/testing/android-device-checklist.md`: add one item — "Nightly channel: sideload a nightly APK over the installed stable (same versionCode replace) and back to the next stable — both transitions succeed without uninstall."

- [ ] **Step 5: Verify**

`nix-shell --run 'npx yaml-lint .github/workflows/android.yml'` if available, else a YAML parse check via node:
`nix-shell --run "node -e \"const y=require('js-yaml');y.load(require('fs').readFileSync('.github/workflows/android.yml','utf8'));y.load(require('fs').readFileSync('.github/workflows/deploy.yml','utf8'));console.log('yaml ok')\""`
Expected: `yaml ok`. (js-yaml is available transitively; if not, `npx --yes yaml-lint`.)

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/android.yml .github/workflows/deploy.yml deploy/README.md docs/testing/android-device-checklist.md
git commit -m "ci(nightly): nightly-* tags publish a pre-release APK — never Latest, never deployed"
```

---

## Task 2: Live verification (controller-executed)

- [ ] Merge to main (`--no-ff`, project convention).
- [ ] Push the first tag: `nightly-2026-07-24` on main (user-requested build of the appearance iteration).
- [ ] Confirm: android workflow runs + publishes a PRE-release (not "Latest"); deploy workflow does NOT trigger; `gh release list` shows stable v0.1.7 as latest.

## Coverage

Spec behavior → Task 1 Steps 1–2; deploy guard → Step 3; docs/checklist → Step 4; verification → Task 2.
