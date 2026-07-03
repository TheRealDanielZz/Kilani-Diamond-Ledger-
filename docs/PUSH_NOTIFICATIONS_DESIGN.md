# Push Notification System — Design Doc

Status: Design confirmed, ready for implementation.

## Understanding Summary

- **Goal:** Add real push notifications (sound + lockscreen on Android/iOS + browser popups) to the existing Kilani Diamond Reporter web app, layered on top of the already-working in-app `NotificationCenter` / `AppNotification` Firestore system.
- **Platform approach:** PWA + Web Push (no native app wrapper). Android gets full support via Chrome; iOS gets support only after the user "Add to Home Screen" (Apple's requirement — cannot be bypassed on the web).
- **Scope:** Push fires for `ASSIGNMENT`, `REQUEST`, `RETURN`, `HANDOFF`, `MENTION`, `SYSTEM`. `STATUS_UPDATE` stays in-app-only (no push).
- **Send mechanism:** A Firebase Cloud Function triggers on new `AppNotification` document writes in Firestore (the same place `services/store.ts` already writes), looks up the recipient's stored FCM device token(s), and sends via FCM Admin SDK.
- **Sound:** Lockscreen/background notifications use the device's default OS notification sound — custom sound files are not supported by web push on any platform. No custom foreground sound either.
- **Permission:** App auto-prompts for notification permission shortly after login (custom pre-prompt explanation, then the real browser dialog).
- **Rollout:** Enabled for all users at once, no staged/canary test group. User has explicitly accepted this risk and will revert the whole change if something goes wrong.

## Assumptions

- iOS support requires the user to "Add to Home Screen" first — a plain Safari tab cannot receive lockscreen push on iOS. This is an Apple platform limitation, not a build choice.
- Multi-device: a user may be logged in on more than one device (phone + desktop) — every device gets its own saved token, so all of a user's devices get pushed.
- Scale: small/internal team-sized user base (tens of users) — Cloud Function fan-out cost/throughput is a non-issue at this scale.
- Notifications targeted at a `role` (not a specific `userId`) fan out to all devices of all users currently holding that role.
- Clicking a push notification opens/focuses the PWA and navigates to the notification's `link`, mirroring today's in-app click behavior.
- No app-icon badge count requested — left out (YAGNI) unless requested later.
- No `firestore.rules` file currently exists in this repo (rules are console-managed today). New rules for the token subcollection need to be reconciled with whatever rules currently exist in the Firebase console before deploy.

## Decision Log

| # | Decision | Alternatives Considered | Why |
|---|----------|--------------------------|-----|
| 1 | PWA + Web Push, no native app wrapper | Capacitor native app shell (real APNs/FCM, no "add to home screen" requirement) | User chose to stay web-only; avoids app store builds/signing/maintenance overhead |
| 2 | Push only for a subset of notification types (ASSIGNMENT, REQUEST, RETURN, HANDOFF, MENTION, SYSTEM); STATUS_UPDATE stays in-app-only | Push for all notification types | User wants to avoid notification fatigue from lower-urgency events |
| 3 | Firebase Cloud Function, Firestore `onCreate` trigger on `AppNotification` docs | Separate custom Node/Express backend | Already fully on Firebase; zero new infra; triggers off the exact point where notifications are already created |
| 4 | Default OS/browser notification sound only, no custom sound anywhere | Custom sound in-app only + default on lockscreen; full custom sound (would require native wrapper) | Simplicity chosen over branding; web push technically can't do custom lockscreen sound regardless |
| 5 | Auto-prompt for notification permission shortly after login | Explicit opt-in toggle in Settings only | User prioritized visibility/adoption over minimizing prompt friction |
| 6 | Token storage: subcollection `users/{uid}/pushTokens/{token}` | Array field `users/{uid}.fcmTokens: string[]` | Avoids read-modify-write races across multiple simultaneous device logins; single-doc delete for cleanup instead of array filtering |
| 7 | Foreground messages show existing in-app toast/bell only (no OS popup); background/closed shows OS notification | Always show OS notification even in foreground | Avoids double-alerting a user who already has the app open |
| 8 | Full rollout to all users immediately, no staged/canary group | Phased rollout (self → small group → everyone) | User accepted the risk explicitly; will revert the entire change if something breaks |

## Final Design

### Architecture / Data Flow

```
[User's browser/phone]
   1. User logs in -> app auto-prompts Notification permission (custom pre-prompt, then browser dialog)
   2. If granted: register public/firebase-messaging-sw.js,
      get FCM token, save to users/{uid}/pushTokens/{token}
   3. App continues writing AppNotification docs to Firestore exactly as today (services/store.ts, unchanged)

[Firebase Cloud Function] (new - Firestore trigger)
   4. onCreate(appNotifications/{id}) fires
   5. If notification.type is in the push-worthy set (ASSIGNMENT/REQUEST/RETURN/HANDOFF/MENTION/SYSTEM):
        - Resolve recipients: notification.userId (one user) OR notification.role (all users with that role)
        - Read each recipient's pushTokens subcollection
        - Send via FCM Admin SDK (multicast) to all resolved tokens
        - Any token FCM reports as invalid/unregistered -> delete that token doc

[Recipient device]
   6a. App in foreground -> onMessage() fires in JS -> show existing in-app toast/bell update only
   6b. App backgrounded/closed -> service worker's onBackgroundMessage() shows the OS notification
       (title/body/icon), device plays its default sound, appears on lockscreen
   7. User taps notification -> SW notificationclick handler focuses/opens the PWA and navigates to the link
```

### Components

**New file — `public/firebase-messaging-sw.js`**
Plain (non-bundled) service worker at the site root. Initializes Firebase independently, listens for background messages, shows the OS notification, and handles notification clicks by opening/focusing the app and navigating to the event's link.

**New file — `services/push.ts`**
- `requestPushPermission(uid)`: requests permission, registers the service worker, retrieves an FCM token (via VAPID key from Firebase Console → Cloud Messaging), saves it to `users/{uid}/pushTokens/{token}`.
- `onForegroundMessage(callback)`: wraps `onMessage()` so the app shows its existing in-app toast instead of a duplicate OS notification while the tab is active.

**Trigger point — `App.tsx`**
A top-level effect, gated on "user just logged in AND `Notification.permission === 'default'`" (not already granted/denied), shows a brief custom explanation, then calls `requestPushPermission`.

**New — Firebase Cloud Function**
Firestore `onCreate` trigger on the `AppNotification` collection. Filters by type, resolves recipients (by `userId` or `role`), reads each recipient's `pushTokens` subcollection, sends via FCM Admin SDK multicast, and deletes any token FCM reports as invalid.

**New — Firestore security rule**
Scoped to `users/{uid}/pushTokens/{token}`: readable/writable only by that `uid`. To be reconciled with existing console-managed rules before deploy (no `firestore.rules` file is currently checked into this repo).

### Risks Acknowledged

- **iOS reach is limited** to users who install the PWA to their home screen; plain Safari-tab users on iPhone will not get lockscreen push until they do.
- **No custom notification sound** on lockscreen — platform limitation, not a build gap.
- **Full immediate rollout, no staged testing.** If the Cloud Function, VAPID key, or service worker is misconfigured, all users could get broken/missing/duplicate notifications simultaneously. Accepted risk — mitigation is a full revert of the change if it goes wrong.
- **Firestore rules gap.** No rules file currently exists in-repo; the new token-subcollection rule needs to be checked against whatever is live in the console so it doesn't conflict with or fail to protect other collections.
