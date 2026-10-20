# Wen Jing & Javen's Streak

A one-page fitness streak tracker for two people. It shows a personal streak for each of you, a together streak and two freezes per week. It's a static site on Vercel, with check-ins stored in Firebase (Firestore) and sign-in through Google.

```
public/               what Vercel serves
  index.html          the page
  manifest.webmanifest, icons/   home-screen app name and icon
  streak.js           streak rules (no DOM, unit-tested)
  firebase-config.js  your Firebase settings + the two Google emails
firestore.rules       who can read and write check-ins
test/                 node --test 'test/*.test.js'
```

## One-time setup

### 1. Firebase project

1. Go to <https://console.firebase.google.com> and click **Add project**. You can turn Google Analytics off.
2. **Build → Firestore Database → Create database.** Choose a location near you (e.g. `asia-southeast1` for Singapore) and start in **production mode**.
3. **Build → Authentication → Get started → Sign-in method → Google → Enable.**
4. **Project settings (gear icon) → Your apps → Web (`</>`).** Register an app; you don't need Firebase Hosting. Copy the `firebaseConfig` values it shows.

### 2. Fill in the settings

In `public/firebase-config.js`:
- paste `apiKey`, `authDomain`, `projectId` and `appId`
- set `PEOPLE_EMAILS.wenjing` and `PEOPLE_EMAILS.javen` to the Google accounts you'll each sign in with

These values end up in the public site. That's how Firebase web apps work: the security comes from the rules in the next step.

### 3. Lock down the database

In `firestore.rules`, replace `WENJING_EMAIL@example.com` and `JAVEN_EMAIL@example.com` with the same two emails, **in lowercase**. Then do one of the following:

- **Console:** open Firestore → **Rules**, paste in the contents of `firestore.rules`, and click **Publish**.
- **CLI:**

  ```bash
  npx firebase-tools login
  ```

  ```bash
  npx firebase-tools deploy --only firestore:rules --project YOUR_PROJECT_ID
  ```

The rules let only your two accounts read check-ins, and each of you can only add or remove your own.

### 4. Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel, click **Add New → Project** and import the repo. `vercel.json` already tells Vercel to serve `public/` with no build step.
3. Click **Deploy**. You get a `*.vercel.app` URL.

### 5. Custom domain

1. Vercel → your project → **Settings → Domains** → add your domain, then follow the DNS records it shows at your registrar.
2. Firebase → **Authentication → Settings → Authorized domains** → add your domain **and** the `*.vercel.app` one. Without this step, Google sign-in fails with "This website isn't allowed to sign in yet."
3. Google Cloud console (<https://console.cloud.google.com/apis/credentials>, project `streak-5241d`) → **OAuth 2.0 Client IDs → Web client (auto created by Google Service)** → **Authorized redirect URIs** → add `https://YOUR-DOMAIN/__/auth/handler`, and the same for your `*.vercel.app` URL. The home-screen app signs in through your own domain (`vercel.json` proxies `/__/auth` to Firebase). Without this step, Google shows a `redirect_uri_mismatch` error.

## Using it

Each of you opens the site and taps **Continue with Google**. Your account decides whose button you're pressing, so there's nothing to pick.

**Add to Home Screen:**
- **iPhone:** in Safari, tap **Share → Add to Home Screen**.
- **Android:** in Chrome, tap **⋮ → Add to Home screen**.

It opens full-screen with the ring icon. On iPhone, the home-screen app keeps its own login, separate from Safari, so you sign in once more the first time you open it.

## Development

```bash
node --test 'test/*.test.js'
```

Module scripts don't load from `file://`, so preview the page with any static server, for example:

```bash
npx serve public
```

Then add `localhost` to Firebase's Authorized domains (it's usually there already).
