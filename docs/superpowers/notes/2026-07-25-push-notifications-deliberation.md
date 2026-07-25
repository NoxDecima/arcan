# Push notifications — deliberation notes (deferred, NO decision)

Date: 2026-07-25
Status: **Deferred.** Captured mid-brainstorm; the user chose to skip
implementing notifications for now. No mechanism selected. This is a reference
for when we pick it back up — not a spec.

Related prior deferrals: Slice 8 spec (foreground-only; closed-app push →
"NOX-30"), Android Tauri app spec (background delivery out of scope; names
UnifiedPush/ntfy or FCM as candidates), CLAUDE.md "background push notifier
spec" follow-up. This note supersedes those one-line mentions with the actual
tradeoff analysis.

## The problem

When the Android app is **killed or in Doze**, there is no live WebSocket to
the sync server, so the device cannot learn a message arrived. The sync server
is stock `jazz-run` (`deploy/Dockerfile.sync`) — a dumb E2EE relay with **no
per-account awareness and no message hooks** — so it cannot detect "a message
for user X" either. Slice 8's notifications only fire while the app is open.
Something must bridge that gap, and the options split along Arcan's
self-hosted / Google-free / E2EE values.

## The core insight

**Non-Google push does not create a connection out of nothing — it only moves
the always-on connection somewhere.** There are exactly three places the
always-on connection can live:

1. **In Arcan itself** — a foreground service (Option A).
2. **In a separate shared "distributor" app the user installs** — classic
   UnifiedPush / ntfy (Option B).
3. **In the Google connection every stock phone already runs** — FCM (Option C).

## The three mechanisms

### Option A — Stay connected (foreground service)
A native Android foreground service keeps Arcan's sync connection alive; the
device notices messages itself and raises a local notification.
- **Pros:** Google-free; no push service; **no push tokens stored anywhere**;
  no sync-server changes; fully E2EE; no dependency on anyone else being online.
  Best values fit.
- **Cons:** a permanent "Arcan is running" notification; battery cost; needs a
  battery-optimization exemption (`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`) or
  Doze suspends the socket and notifications are delayed until reopen; real
  native (Kotlin) work; **fragile** — keeping a WebView process + socket alive
  through Doze and OEM battery-killers (Samsung/Xiaomi) is the notoriously
  unreliable part.
- **Battery estimate (honest, not measured):** ~**5–15%/day** for a naive
  "keep the whole Tauri WebView alive" build. Drivers, in order: (1) radio
  wakeups from keepalive pings, not data volume — each cellular ping wakes the
  radio into a ~5–10s high-power tail; (2) WiFi vs cellular swings it 3–4×
  (WiFi-heavy ≈ 2–5%/day, cellular-heavy ≈ 10–15%); (3) Arcan keeps a whole
  Chromium WebView + JS heap resident (heavier than a lean native socket, and
  more likely to be memory-killed). A carefully engineered lean **native**
  socket service that wakes the WebView only on arrival could approach the
  Signal/Molly "websocket mode" range (~2–5%/day) but is substantially more
  Kotlin work and gives up the "it's just the web app" simplicity.

### Option B — Self-hosted push (UnifiedPush / ntfy)
Google-free real push. The phone runs a **distributor app** (ntfy); Arcan
registers an opaque endpoint; a trigger POSTs a contentless wake to it.
- **Pros:** no permanent per-app notification; better battery than A **if** a
  distributor is already present (one shared connection fans out to all
  UnifiedPush apps).
- **Cons / honest wrinkles:**
  - **Requires a second app** (ntfy / NextPush / …) UNLESS the user is on a
    de-Googled ROM (GrapheneOS / /e/OS / LineageOS) that ships a distributor.
    Realistic for a de-Googled crowd; a big ask for everyone else.
  - The distributor is the thing holding the always-on socket — so B is really
    "Option A's cost centralized into one shared app," not free push.
  - **On a stock Google phone the ntfy distributor often just uses FCM under
    the hood** — so you land back on Google's transport indirectly (though
    Arcan itself contains zero Google code and your server only talks to your
    own ntfy).
  - Still needs a **trigger source** (see below) and stores opaque per-device
    endpoints + a server push endpoint.
  - **Embedded distributor** avoids the second app, but then it collapses into
    Option A (Arcan runs its own foreground service holding a socket, just
    pointed at ntfy instead of jazz-sync).

### Option C — FCM (Firebase)
The "normal" way: seamless, reliable, battery-optimal (Google multiplexes every
app's pushes over one shared system connection, so the radio wakes once for all
apps), no permanent notification.
- **Cons:** hard Google dependency — Google Play Services on-device, a Firebase
  project + `google-services.json`, a Kotlin `FirebaseMessagingService`, and
  device tokens tied to Google. Google sees "device X pinged at time T" (never
  content, if the payload is contentless). Breaks the Google-free stance.
- **Minimal build (arguably LESS finicky than A — its hard parts are
  deterministic and well-documented, whereas A's hard part is unreliable):**
  - *Receive (client):* Firebase project + Android app for `dev.nox-decima.arcan`;
    drop `google-services.json` into `gen/android`; add the
    `com.google.gms.google-services` Gradle plugin + `firebase-messaging`; add a
    ~40-line `FirebaseMessagingService` (on message → post a "Messages"-channel
    notification; on new token → hand to app); add `POST_NOTIFICATIONS` +
    runtime request. No first-party Tauri FCM plugin → custom Kotlin+Gradle in
    the regenerated `gen/android` tree (must make edits durable).
  - *Trigger (server), reusing the existing `api` container:* client `POST
    /push/register` (bearer auth already exists) stores `token → accountID` in
    the api DB (**no Jazz schema change**); on send, the sender's client calls
    `POST /push/wake { recipientAccountID }`; the api looks up the token and
    calls FCM HTTP v1 with a **contentless** payload (service-account key as a
    VPS secret, same pattern as `LINEAR_API_TOKEN`). Woken app syncs → real
    content appears locally. Message bodies never touch Google or the server.

## Orthogonal sub-problem — the trigger source (applies to B and C)

Because the relay can't detect messages, B and C both need something to decide
"a message arrived for X":
- **Sender-triggered (recommended, minimal):** the sender's client pokes the
  push endpoint on send. Simple; cost is the `api` server learns
  sender→recipient wake timing (metadata it already largely sees per the threat
  model, but this adds device-push linkage).
- **Server-watched:** a notifier subscribes to the sync stream — but to know
  *who* to notify it would need group membership (breaks E2EE) or only sees
  opaque "group X changed." Heavier and invasive; not minimal.
- Option A needs **no trigger** — the device sees the message directly.

## Threat-model deltas (per docs/security/threat-model.md)

- Content stays E2EE in every option (contentless payloads).
- A: leaks nothing new (no tokens, no server changes).
- B: opaque endpoints stored; on stock phones may transit FCM indirectly.
- C: `api` stores per-account FCM tokens (device↔account linkage) and Google
  sees per-device ping timing.

## Where this landed

The decision is **purely values vs convenience**, not difficulty:
- Most private / Google-free / lowest-infra → **A** (accept the permanent
  notification + battery + Doze fragility).
- Google-free without a permanent notification → **B**, but only pays off if
  the user runs a distributor (de-Googled ROM crowd); otherwise adds an app for
  little gain.
- Seamless & reliable, lightest build → **C**, at the cost of the first hard
  Google dependency in the app (could be a later opt-in "convenience mode").

Revisit when notifications become a priority. No code was written.
