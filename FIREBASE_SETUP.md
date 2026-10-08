# PosteFinder + Firebase (feature branch, not production)

**Status:** implementation scaffold is committed but Firebase is NOT activated until you configure a Firebase project. The existing Netlify production deployment is untouched. `main` remains unchanged until you choose to merge the draft pull request.

## What is implemented

- Original Netlify HTML / Leaflet map and its 31 embedded locations remain intact.
- Optional Firebase Authentication (email/password) with a small login UI in the existing header.
- Private user document `users/{uid}/private/preferences`: favorites, ratings, hidden points and personal places.
- Client synchronizes edited preferences and observes changes from other devices (last-write-wins).
- Public read-only `locations/{locationId}`, optionally merged over the built-in dataset; empty/unavailable Firestore falls back to the 31 original locations.
- No backend writes, remote AI calls, or Netlify deploys happen automatically.

## Configuration (use a SEPARATE Firebase test project)

1. Open [Firebase Console](https://console.firebase.google.com/) and create a **new test project**. Register a Web app.
2. Enable **Authentication → Sign-in method → Email/Password**.
3. Create a **Cloud Firestore** database in your preferred European location. Do not select development/test rules as your permanent policy.
4. Deploy the supplied `firestore.rules` through Firebase Console → Firestore → Rules (or with the Firebase CLI: `firebase deploy --only firestore:rules --project YOUR_PROJECT_ID`). Read the rules before publishing them. No credentials go into Git.
5. Open `firebase-config.js` **in the test branch**, replacing `null` with the public Web SDK configuration copied from Firebase → Project settings → Your apps. Web `apiKey` is a public project identifier, **not** a service-account key.
6. Add the **preview domain** to Authentication → Settings → Authorized domains. Add `localhost` only if testing locally and remove it when finished. Projects created after April 2025 do not automatically authorize localhost.
7. Serve the files through an HTTP server: `python3 -m http.server 8000`. Open localhost and check search, 31 points, map, and account sync. To avoid touching production, use a separate Netlify test site or a Deploy Preview of this pull request (only if you have linked this repository to Netlify).
8. If you wish to migrate the public directory into Firestore, dry-run `node scripts/seed-firestore.mjs`. To actually import, run `npm install`, authenticate Google Application Default Credentials **locally**, set `FIREBASE_PROJECT_ID`, then run `node scripts/seed-firestore.mjs --write`. This imports all 31 points, marking each unverified. It does not delete existing Firestore documents. Never upload a service-account JSON to GitHub.

## Schema

```
locations/{id}                        Public read, admin-SDK writes only
users/{uid}/private/preferences        Owner-only read/write (version, favorites, removedIds, ratings, customPlaces, updatedAt)
```

Firestore does not independently verify shop hours, couriers or availability. Source data should be independently checked before displaying it as confirmed. Cloud Messaging push notifications, moderation dashboard and server-side Gemini are **planned**, not implemented in this branch.

## Security and privacy

- All personal addresses and preferences use owner-only Firestore Security Rules.
- Firebase Web config is publicly visible by design; never publish service-account credentials.
- The Gemini API key in the original site is still local to the browser; the legacy AI chat has NOT yet been moved behind a server function.
- No Firestore persistent disk cache is enabled; the app maintains localStorage preferences for offline fallback. Do not sign in on an untrusted/shared computer without considering locally stored data.
- When signing out, user-synced preferences are removed from this browser; data remains in Firebase for the next sign-in.
- Registration requires users to choose their own credentials. Passwords are processed by Firebase Auth, not saved by PosteFinder.
- Sync conflicts currently use last-write-wins. Backup and merge workflows should be considered before broad adoption.

## Verification before shipping

Run `node scripts/check-source.mjs` and `node --test`. In the browser, check: original yellow header, map on the left, sidebar on the right, 31 locations and colored pins, search/open-now, register/login, add/change Casa privately, favorite a point, sign out/in, and review the same state from a second device. **Do not merge into main or deploy to production until tested.**
