# Ohùn — Yorùbá & Hausa voice assistant

Voice-first, bilingual (`yo` / `ha`) chat app. React + TypeScript + Tailwind, Firebase for auth/data/storage, pluggable speech providers behind a single interface.

---

## Folder structure

```
.
├── firestore.rules
├── storage.rules
├── functions/
│   └── src/
│       └── index.ts              Callable fns: stt, tts, chat. All API keys live here.
└── src/
    ├── types/
    │   └── index.ts              Firestore schemas + speech contracts, strictly typed
    ├── lib/
    │   ├── firebase.ts           App init, emulator wiring, typed converters
    │   ├── prompts.ts            System prompt builders per language
    │   └── speech/
    │       ├── providers.ts      SttProvider / TtsProvider interfaces + registry
    │       ├── browserStt.ts     Web Speech API adapter (fallback)
    │       ├── cloudStt.ts       MediaRecorder → callable fn adapter
    │       └── cloudTts.ts       Callable fn → ArrayBuffer adapter + LRU cache
    ├── hooks/
    │   ├── useSpeechToText.ts    Recording state machine, transcript, errors
    │   ├── useTextToSpeech.ts    Synthesis + playback, per-message control
    │   └── useAudioLevel.ts      AnalyserNode → 0..1 amplitude for the orb
    ├── context/
    │   └── PreferencesContext.tsx  Language + theme, persisted to users/{uid}
    ├── services/
    │   └── conversations.ts      Firestore reads/writes, typed
    ├── components/chat/
    │   ├── ChatInterface.tsx     Feed + composer, owns the turn loop
    │   ├── MessageBubble.tsx     Message + replay control
    │   ├── VoiceOrb.tsx          Mic button + amplitude-driven state indicator
    │   └── LanguageSwitcher.tsx  yo ⇄ ha toggle
    └── styles/
        └── tokens.css            Design tokens, light + dark
```

---

## Two corrections to the brief

**1. The Web Speech API cannot be your TTS fallback.** `speechSynthesis` ships no Yorùbá or Hausa voices on any mainstream platform — Chrome, Safari, Edge, Android. Calling it with `yo-NG` silently falls back to the default English voice and reads Yorùbá orthography as mangled English. That is worse than no audio at all.

So the TTS path is: cloud provider → if unavailable, show a "no voice for this language" state and keep the text. `browserTts` exists in the registry only for `en` and is off by default. `SpeechRecognition` *does* list `yo-NG` and `ha-NG` and is a legitimate STT fallback, though accuracy is noticeably below a tuned provider.

**2. Google Cloud is not the strongest option here.** Providers built specifically for these languages now exist and handle tone and diacritics rather than stripping them:

- **Spitch** — one API for STT, TTS, translation, and (importantly) **diacritic restoration** across Yorùbá, Hausa, Igbo, Swahili. Docs at `docs.spitch.app`. This is the default in the code below.
- **AssemblyAI** — strong Yorùbá and Hausa STT, streaming, no TTS for these languages.
- **N-ATLAS** — Nigeria's state-backed ASR for Yorùbá, Hausa, Igbo, Nigerian English.
- **9jaLingo / NaijaLingo** — TTS with a large voice library, Python SDK first.
- **Google Cloud** — keep the adapter as a hedge; quality for `yo`/`ha` lags.

Everything sits behind `SttProvider` / `TtsProvider`, so swapping is a one-line registry change. Verify current pricing and language lists yourself — this space is moving fast.

**Diacritic handling.** Your requirement 2 is best served by a post-pass, not by prompting alone. LLMs drop Yorùbá tone marks under load; asking nicely doesn't fix it. `functions/src/index.ts` routes assistant text through Spitch's diacritics endpoint before it hits Firestore, so the stored text is already correct and TTS reads the right tones. `lib/prompts.ts` still instructs the model properly — belt and braces.

---

## Design direction

Grounded in **àdìrẹ** and the Kofar Mata indigo pits — resist-dyed indigo on undyed cotton, with brass as the single warm accent. Dark theme is the default deep indigo `#131C3A`, not a tinted black.

Type is **Source Serif 4** for message content and **Inter** for UI chrome. This pairing is a functional choice, not a fashionable one: both render stacked Yorùbá tone marks (`ọ̀`, `ẹ́`, `ṣ`) and Hausa hooked letters (`ɓ`, `ɗ`, `ƙ`, `ʼy`) correctly at text sizes. Most display faces do not — test any substitution against `Ṣé o ti jẹun? Ìbọ̀sí!` and `Ƙaƙƙarfan ɗan'uwa ya ɓata.` before adopting it.

The one bold element is the voice orb: concentric rings that ripple with real microphone amplitude, like a disturbed dye surface. Everything else stays quiet.

---

## Setup

```bash
npm i firebase react react-dom
npm i -D typescript tailwindcss @types/react @types/dom-speech-recognition
cd functions && npm i firebase-admin firebase-functions
```

`@types/dom-speech-recognition` is required — `SpeechRecognition` is not in TypeScript's default DOM lib.

Client env (`.env.local`, all public by design):

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

Server secrets (never in the client bundle):

```bash
firebase functions:secrets:set SPITCH_API_KEY
firebase functions:secrets:set LLM_API_KEY
```

Add to `tsconfig.json`: `"strict": true`, `"noUncheckedIndexedAccess": true`.
