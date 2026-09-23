# Setup

Verified: `npm install` → `tsc --noEmit` clean → `vite build` succeeds on Node 20.

---

## 1. Install dependencies

From the project root:

PowerShell users: run these on separate lines — PowerShell 5.1 rejects `&&`.

```bash
npm install
cd worker
npm install
cd ..
```

Two packages. The root is your React app; `worker/` is the Cloudflare Worker that holds your API keys. Both are needed.

**No Blaze plan required.** Firebase is used only for Auth, Firestore and Storage, which are free on the Spark plan. The API proxy runs on Cloudflare's free tier instead.

---

## 2. Create the Firebase project

At [console.firebase.google.com](https://console.firebase.google.com):

1. **Add project** → name it → you can skip Analytics.
2. **Build → Authentication → Get started.** Enable **Email/Password** and **Google**.
3. **Build → Firestore Database → Create database.** Start in **production mode** (the rules in this repo replace the defaults). Pick a region close to your users — `europe-west1` matches the region pinned in `firebase.ts` and `functions/src/index.ts`.
4. **Build → Storage → Get started.** Same region.
5. **Project settings (gear icon) → Your apps → Web (`</>`)** → register an app. Copy the config object it shows you.

---

## 3. Wire up your environment

```bash
cp .env.local.example .env.local
```

Fill each value from the config object in step 2.5. These are public keys and ship in your bundle — that is normal and safe. Your Firestore rules are what protect the data, not key secrecy.

Restart `npm run dev` after editing `.env.local`. Vite only reads it at startup.

---

## 4. Install the Firebase CLI and push the rules

```bash
npm install -g firebase-tools
firebase login
firebase use --add            # pick the project you just made, alias it "default"

firebase deploy --only firestore:rules,firestore:indexes,storage
```

The index deploy matters: `watchConversations` queries `where userId` + `orderBy lastMessageAt`, which Firestore refuses without the composite index in `firestore.indexes.json`.

---

## 5. Run the frontend

```bash
npm run dev
```

Open `http://localhost:5173`. You should get the sign-in screen, and creating an account should write a `users/{uid}` document you can see in the Firestore console.

**At this point voice will not work yet** — the mic button calls a Cloud Function that doesn't exist. The text composer also won't get replies. That's expected; step 6 fixes it.

---

## 6. Deploy the API worker

You need one key, and it is free:

**Gemini** — go to [aistudio.google.com](https://aistudio.google.com/apikey), sign in with Google, click **Create API key**. No credit card. This covers both the chat replies and the speech-to-text, since Gemini accepts audio directly.

Then:

```bash
cd worker
npm install
```

Open `wrangler.toml` and set `FIREBASE_PROJECT_ID` to your real project id. Without it the Worker rejects every request — it uses that value to confirm ID tokens were minted for *your* project and not someone else's.

```bash
npx wrangler login
npx wrangler secret put GEMINI_API_KEY      # paste the key when prompted
npx wrangler deploy
```

Deploy prints a URL like `https://ohun-api.<your-name>.workers.dev`. Put it in your root `.env.local`:

```
VITE_API_BASE=https://ohun-api.your-name.workers.dev
```

Then add your site's origin to `ALLOWED_ORIGINS` in `wrangler.toml` and redeploy. `http://localhost:5173` is already there for development; add your Hosting domain before you go live, or the browser will block every call with a CORS error.

Restart `npm run dev`. Text chat and voice input should both work now.

### Voice output (optional, and the only thing that costs money)

Chat and transcription are free. Text-to-speech is not — Gemini has no reliable Yorùbá or Hausa voice, so it runs through Spitch.

Without a key, `/synthesise` returns 501 and the app hides its play buttons. Everything else works. When you want audio:

```bash
npx wrangler secret put SPITCH_API_KEY
npx wrangler deploy
```

Get the key at [spi-tch.com](https://spi-tch.com), and check their live voice catalogue — the names in `handleSynthesise` (`lucy`, `sade`, `hasan`) are placeholders.

### About the free tier

Gemini's free tier is permanent, not a trial. Two limits to know:

- **Roughly 10–15 requests per minute, shared across all your users** — not per user. Fine for development and a small pilot; it will throttle the moment you demo to a room. The Worker returns a clear "wait a moment" message on 429 rather than failing silently.
- **Google may use free-tier inputs and outputs to train their models.** For a prototype that's fine. Before real users speak Yorùbá into your app, decide deliberately and say so in a privacy notice.

## Local development

Run the Worker locally instead of deploying on every change:

```bash
cd worker
npx wrangler dev        # serves on http://localhost:8787
```

Point `VITE_API_BASE=http://localhost:8787` in `.env.local` while you do.

For Firebase itself you can use the emulators — set `VITE_USE_EMULATORS=true` and run `firebase emulators:start`. Set it back to `false` before building for production.

## 7. Deploy the site

```bash
npm run build
firebase deploy --only hosting
```

`firebase.json` is already pointed at `dist/` with an SPA rewrite.

---

## Testing voice on a phone

`getUserMedia` requires a secure context. `localhost` counts; your laptop's LAN address does not — `http://192.168.x.x:5173` will fail silently with a permission error and no obvious cause.

Two options: deploy to Firebase Hosting (you get HTTPS free), or tunnel with `npx localtunnel --port 5173`.

---

## Things that will bite you

**Vite caches env vars.** Changed `.env.local` and nothing happened? Restart the dev server.

**`auth/unauthorized-domain` on Google sign-in.** Add your domain under Authentication → Settings → Authorized domains. `localhost` is there by default; your Hosting domain is added automatically, but a tunnel URL is not.

**Permission-denied on first write.** Confirm you actually deployed the rules (step 4) rather than leaving Firestore's default locked-down mode in place.

**429 from Gemini.** You hit the free-tier rate limit. Wait a minute. If it happens constantly, you need the paid tier or a queue.

**401 from the Worker.** Either `FIREBASE_PROJECT_ID` in `wrangler.toml` doesn't match your real project id, or the user isn't signed in.

**CORS error in the console.** Your origin isn't in `ALLOWED_ORIGINS`. Add it to `wrangler.toml` and redeploy the Worker.

**Safari MediaRecorder.** Safari produces `audio/mp4`, not WebM. `cloudStt.ts` already negotiates this, but confirm your speech provider accepts that MIME type; some only take WebM/Opus and WAV.

**Bundle size.** The build warns at ~678 kB. Firebase's SDK is most of it. When you care, split it with `manualChunks` in `vite.config.ts` — not urgent for a prototype.
