/**
 * Ohùn API — Cloudflare Worker.
 *
 * Replaces the Firebase Callable Functions so the project runs without the
 * Blaze plan. Three endpoints, all POST, all requiring a Firebase ID token:
 *
 *   /chat        { language, history, prompt }        -> { text }
 *   /transcribe  { audioBase64, mimeType, locale }    -> { text, confidence }
 *   /synthesise  { text, locale }                     -> { audioBase64, mimeType }
 *
 * Chat and transcription both run on Gemini's free tier. Only /synthesise
 * costs money, and it degrades to 501 when no key is set.
 */

import { buildSystemPrompt } from './prompts';

export interface Env {
  FIREBASE_PROJECT_ID: string;
  ALLOWED_ORIGINS: string;
  GEMINI_API_KEY: string;
  SPITCH_API_KEY?: string;
}

/**
 * Free-tier models are Flash-only and the lineup shifts. Check
 * aistudio.google.com for what your key can currently reach before
 * assuming this string still works.
 */
const GEMINI_MODEL = 'gemini-3.6-flash';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const PROVIDER_LANG: Record<string, string> = {
  'en-NG': 'en',
  'en-US': 'en',
  'yo-NG': 'yo',
  'ha-NG': 'ha',
  'ha-NE': 'ha',
};

/**
 * Voice ids per language, from Spitch Studio → Text to Speech.
 * Replace these with the real ids before enabling voice output.
 */
const VOICES: Record<string, string> = {
  en: 'REPLACE_ME',
  yo: 'REPLACE_ME',
  ha: 'REPLACE_ME',
};

const LANGUAGE_NAME: Record<string, string> = {
  en: 'English',
  yo: 'Yorùbá',
  ha: 'Hausa',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin') ?? '';
    const cors = corsHeaders(origin, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'POST') {
      return json({ error: 'Use POST.' }, 405, cors);
    }

    const uid = await authenticate(request, env);
    if (!uid) {
      return json({ error: 'Sign in first.' }, 401, cors);
    }

    const path = new URL(request.url).pathname;

    try {
      switch (path) {
        case '/chat':
          return json(await handleChat(request, env), 200, cors);
        case '/transcribe':
          return json(await handleTranscribe(request, env), 200, cors);
        case '/synthesise':
          return json(await handleSynthesise(request, env), 200, cors);
        default:
          return json({ error: 'Not found.' }, 404, cors);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong.';
      // Shows up in `npx wrangler tail`.
      console.error(`${path} failed:`, message);
      const status = message.startsWith('BAD:') ? 400 : message.startsWith('OFF:') ? 501 : 500;
      return json({ error: message.replace(/^(BAD|OFF):/, '') }, status, cors);
    }
  },
};

/* ------------------------------------------------------------------ *
 * Auth — verify the Firebase ID token against Google's public keys
 * ------------------------------------------------------------------ */

const JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

interface Jwk extends JsonWebKey {
  kid: string;
}

let jwksCache: { keys: Jwk[]; expires: number } | null = null;

async function getKeys(): Promise<Jwk[]> {
  if (jwksCache && jwksCache.expires > Date.now()) return jwksCache.keys;

  const response = await fetch(JWKS_URL);
  const body = (await response.json()) as { keys: Jwk[] };
  // Google rotates these roughly daily; an hour of caching is plenty.
  jwksCache = { keys: body.keys, expires: Date.now() + 3_600_000 };
  return body.keys;
}

function base64UrlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Returns the uid when the token is valid and belongs to this project. */
async function authenticate(request: Request, env: Env): Promise<string | null> {
  const header = request.headers.get('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;

  const [headerPart, payloadPart, signaturePart] = token.split('.');
  if (!headerPart || !payloadPart || !signaturePart) return null;

  try {
    const head = JSON.parse(new TextDecoder().decode(base64UrlDecode(headerPart))) as {
      kid?: string;
      alg?: string;
    };
    if (head.alg !== 'RS256' || !head.kid) return null;

    const jwk = (await getKeys()).find((key) => key.kid === head.kid);
    if (!jwk) return null;

    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );

    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      base64UrlDecode(signaturePart),
      new TextEncoder().encode(`${headerPart}.${payloadPart}`),
    );
    if (!valid) return null;

    const claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadPart))) as {
      aud?: string;
      iss?: string;
      sub?: string;
      exp?: number;
    };

    const now = Math.floor(Date.now() / 1000);
    const project = env.FIREBASE_PROJECT_ID;

    // All four checks matter. Skipping `aud` would let a token minted for
    // any other Firebase project authenticate against yours.
    if (claims.aud !== project) return null;
    if (claims.iss !== `https://securetoken.google.com/${project}`) return null;
    if (!claims.sub) return null;
    if (!claims.exp || claims.exp < now) return null;

    return claims.sub;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Chat
 * ------------------------------------------------------------------ */

interface ChatBody {
  language: 'en' | 'yo' | 'ha';
  history: Array<{ sender: 'user' | 'assistant'; text: string }>;
  prompt: string;
}

async function handleChat(request: Request, env: Env): Promise<{ text: string }> {
  const body = (await request.json()) as ChatBody;
  if (!body.prompt?.trim()) throw new Error('BAD:There is no message to send.');

  const contents = normaliseTurns([
    ...(body.history ?? []).slice(-12).map((message) => ({
      role: message.sender === 'user' ? ('user' as const) : ('model' as const),
      text: message.text,
    })),
    { role: 'user' as const, text: body.prompt },
  ]);

  const text = await gemini(env, {
    contents,
    systemInstruction: { parts: [{ text: buildSystemPrompt(body.language) }] },
    generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
  });

  return { text };
}

/* ------------------------------------------------------------------ *
 * Transcription — Gemini takes audio directly, so STT is free too
 * ------------------------------------------------------------------ */

interface TranscribeBody {
  audioBase64: string;
  mimeType: string;
  locale: string;
}

async function handleTranscribe(
  request: Request,
  env: Env,
): Promise<{ text: string; confidence: number | null }> {
  const body = (await request.json()) as TranscribeBody;
  const language = PROVIDER_LANG[body.locale];
  if (!language) throw new Error(`BAD:Unsupported locale: ${body.locale}`);
  if (body.audioBase64.length > 7_000_000) throw new Error('BAD:That recording is too long.');

  const name = LANGUAGE_NAME[language] ?? 'English';
  const instruction =
    language === 'yo'
      ? `Transcribe this ${name} audio exactly as spoken. Write all tone marks and sub-dots (ẹ ọ ṣ á à ọ̀ ẹ́). Return only the transcription, with no commentary, quotes or translation.`
      : language === 'ha'
        ? `Transcribe this ${name} audio exactly as spoken, using standard Boko orthography including ɓ ɗ ƙ ʼy. Return only the transcription, with no commentary, quotes or translation.`
        : `Transcribe this ${name} audio exactly as spoken. Return only the transcription, with no commentary or quotes.`;

  const text = await gemini(env, {
    contents: [
      {
        role: 'user',
        parts: [
          { inline_data: { mime_type: body.mimeType, data: body.audioBase64 } },
          { text: instruction },
        ],
      },
    ],
    // Transcription is not a creative task; keep it literal.
    generationConfig: { temperature: 0, maxOutputTokens: 512 },
  });

  // Gemini returns no confidence score, unlike a dedicated ASR provider.
  return { text: text.replace(/^["']|["']$/g, '').trim(), confidence: null };
}

/* ------------------------------------------------------------------ *
 * Speech — the one paid step, and optional
 * ------------------------------------------------------------------ */

async function handleSynthesise(
  request: Request,
  env: Env,
): Promise<{ audioBase64: string; mimeType: string }> {
  if (!env.SPITCH_API_KEY) {
    throw new Error('OFF:Voice output is not configured.');
  }

  const body = (await request.json()) as { text: string; locale: string };
  const language = PROVIDER_LANG[body.locale];
  if (!language) throw new Error(`BAD:Unsupported locale: ${body.locale}`);
  if (!body.text?.trim()) throw new Error('BAD:There is no text to read.');
  if (body.text.length > 2000) throw new Error('BAD:That text is too long to read.');

  const voice = VOICES[language];
  if (!voice) throw new Error(`BAD:No voice configured for ${language}.`);

  const response = await fetch('https://api.spi-tch.com/v1/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SPITCH_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ language, text: body.text, voice }),
  });

  if (!response.ok) {
    // Their message names the problem — usually an unknown voice or a
    // field this request got wrong. Never contains the key.
    const detail = await response.text().catch(() => '');
    throw new Error(`Speech provider returned ${response.status}: ${detail.slice(0, 300)}`);
  }

  // Trust the response's own content type rather than assuming WAV — the
  // provider may return MP3 or Opus, and the browser needs the right one
  // to play the audio.
  const mimeType = response.headers.get('content-type')?.split(';')[0]?.trim() || 'audio/mpeg';
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { audioBase64: toBase64(bytes), mimeType };
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

async function gemini(env: Env, payload: unknown): Promise<string> {
  // 503 ("high demand") and 500 are usually gone within seconds on the free
  // tier, so retry twice with a short backoff before giving up. 429 is a
  // real rate limit and is NOT retried — waiting longer is the only fix.
  const RETRY_DELAYS_MS = [1_000, 2_500];
  let response: Response | null = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    response = await fetch(
      `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
    );
    if (response.status !== 503 && response.status !== 500) break;

    const delay = RETRY_DELAYS_MS[attempt];
    if (delay === undefined) break;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  if (!response) throw new Error('No response from Gemini.');

  if (response.status === 503) {
    throw new Error('The AI service is busy right now. Try again in a minute.');
  }

  if (response.status === 429) {
    // Free tier is ~10-15 requests/minute across ALL your users, not each.
    throw new Error('Too many requests right now. Wait a moment and try again.');
  }
  if (!response.ok) {
    // Google's message names the actual problem ("API key not valid",
    // "model not found", ...). Never includes the key itself.
    const detail = await response.text().catch(() => '');
    throw new Error(`Gemini returned ${response.status}: ${detail.slice(0, 400)}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('')
    .trim();

  if (!text) throw new Error('The model returned an empty reply.');
  return text;
}

/**
 * Gemini wants turns that start with the user, with no empty text, and
 * rejects some back-to-back same-role turns. Failed sends leave exactly
 * that behind (several user messages with no reply between), so merge
 * neighbours and drop anything before the first user turn.
 */
function normaliseTurns(
  turns: ReadonlyArray<{ role: 'user' | 'model'; text: string }>,
): Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> {
  const merged: Array<{ role: 'user' | 'model'; text: string }> = [];

  for (const turn of turns) {
    const text = turn.text?.trim();
    if (!text) continue;
    const last = merged[merged.length - 1];
    if (last && last.role === turn.role) {
      last.text = `${last.text}\n\n${text}`;
    } else {
      merged.push({ role: turn.role, text });
    }
  }

  while (merged[0]?.role === 'model') merged.shift();

  return merged.map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] }));
}

function toBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function corsHeaders(origin: string, env: Env): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS.split(',').map((value) => value.trim());
  return {
    'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : (allowed[0] ?? ''),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}