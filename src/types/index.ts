import type { Timestamp } from 'firebase/firestore';

/* ------------------------------------------------------------------ *
 * Language
 * ------------------------------------------------------------------ */

/** ISO 639-1 codes for the languages this app supports. */
export const LANGUAGES = ['en', 'yo', 'ha'] as const;

/** What a new user gets before they choose. */
export const DEFAULT_LANGUAGE: LanguageCode = 'en';
export type LanguageCode = (typeof LANGUAGES)[number];

/** BCP-47 locales handed to speech providers. */
export type SpeechLocale = 'en-NG' | 'en-US' | 'yo-NG' | 'ha-NG' | 'ha-NE';

export interface LanguageMeta {
  readonly code: LanguageCode;
  /** Name in the language itself — never show users an English exonym. */
  readonly endonym: string;
  readonly englishName: string;
  readonly defaultLocale: SpeechLocale;
  /** Alternate locales a user may pick. Hausa is spoken across borders. */
  readonly locales: readonly SpeechLocale[];
  /** True when output needs a tone-mark restoration pass. */
  readonly requiresDiacriticRestoration: boolean;
}

export const LANGUAGE_META: Readonly<Record<LanguageCode, LanguageMeta>> = {
  en: {
    code: 'en',
    endonym: 'English',
    englishName: 'English',
    // Nigerian English by default: the speech provider is tuned for it,
    // and it is what most users here actually speak.
    defaultLocale: 'en-NG',
    locales: ['en-NG', 'en-US'],
    requiresDiacriticRestoration: false,
  },
  yo: {
    code: 'yo',
    endonym: 'Yorùbá',
    englishName: 'Yoruba',
    defaultLocale: 'yo-NG',
    locales: ['yo-NG'],
    requiresDiacriticRestoration: true,
  },
  ha: {
    code: 'ha',
    endonym: 'Hausa',
    englishName: 'Hausa',
    defaultLocale: 'ha-NG',
    locales: ['ha-NG', 'ha-NE'],
    requiresDiacriticRestoration: false,
  },
} as const;

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ *
 * Firestore documents
 * ------------------------------------------------------------------ */

export type ThemePreference = 'light' | 'dark' | 'system';

export interface UserSettings {
  theme: ThemePreference;
  /**
   * Speak assistant replies as soon as they arrive. Off by default: paid
   * synthesis on every reply adds up, and most replies are read, not heard.
   */
  autoPlayReplies: boolean;
  /** Keep generated audio in Storage instead of regenerating on replay. */
  persistAudio: boolean;
  /** Preferred locale within the chosen language (e.g. ha-NE vs ha-NG). */
  preferredLocale: SpeechLocale;
}

export const DEFAULT_USER_SETTINGS: Readonly<UserSettings> = {
  theme: 'dark',
  autoPlayReplies: false,
  persistAudio: false,
  preferredLocale: 'en-NG',
} as const;

/** `users/{uid}` */
export interface UserDoc {
  id: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  preferredLanguage: LanguageCode;
  settings: UserSettings;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** `conversations/{conversationId}` */
export interface ConversationDoc {
  id: string;
  userId: string;
  /** Written in `language`, generated from the first user turn. */
  title: string;
  language: LanguageCode;
  messageCount: number;
  lastMessageAt: Timestamp | null;
  createdAt: Timestamp;
}

export type MessageSender = 'user' | 'assistant';

/**
 * Lifecycle of a single turn. `pending` and `failed` let the UI show an
 * in-flight or retryable message without a second client-side store.
 */
export type MessageStatus = 'pending' | 'complete' | 'failed';

/** `conversations/{conversationId}/messages/{messageId}` */
export interface MessageDoc {
  id: string;
  conversationId: string;
  userId: string;
  sender: MessageSender;
  /** Diacritics already restored for Yorùbá. Safe to render and synthesise. */
  text: string;
  language: LanguageCode;
  status: MessageStatus;
  /** Storage download URL, only when `settings.persistAudio` is on. */
  audioUrl: string | null;
  /** Where the text came from, for debugging transcription quality. */
  source: 'text' | 'voice';
  /** Provider confidence on transcription, 0..1. Null for typed input. */
  transcriptConfidence: number | null;
  timestamp: Timestamp;
}

/** Shape written on create — server fills id and timestamps. */
export type NewMessage = Omit<MessageDoc, 'id' | 'timestamp'>;

/* ------------------------------------------------------------------ *
 * Speech contracts
 * ------------------------------------------------------------------ */

export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking';

export type SpeechErrorCode =
  | 'permission-denied'
  | 'no-microphone'
  | 'unsupported-language'
  | 'unsupported-browser'
  | 'network'
  | 'no-speech'
  | 'aborted'
  | 'provider-error';

export class SpeechError extends Error {
  readonly code: SpeechErrorCode;

  constructor(code: SpeechErrorCode, message: string) {
    super(message);
    this.name = 'SpeechError';
    this.code = code;
  }
}

export interface TranscriptResult {
  text: string;
  /** 0..1, or null when the provider gives no score. */
  confidence: number | null;
  isFinal: boolean;
  locale: SpeechLocale;
}

export interface SynthesisResult {
  audio: ArrayBuffer;
  mimeType: string;
  /** Set when the clip was uploaded to Storage. */
  storageUrl: string | null;
}

/* ------------------------------------------------------------------ *
 * Callable function payloads
 * ------------------------------------------------------------------ */

export interface TranscribeRequest {
  /** base64, no data-URL prefix. */
  audioBase64: string;
  mimeType: string;
  locale: SpeechLocale;
}

export interface TranscribeResponse {
  text: string;
  confidence: number | null;
}

export interface SynthesiseRequest {
  text: string;
  locale: SpeechLocale;
  voiceId?: string;
}

export interface SynthesiseResponse {
  audioBase64: string;
  mimeType: string;
}

export interface ChatRequest {
  conversationId: string;
  language: LanguageCode;
  /** Trimmed history, oldest first. */
  history: ReadonlyArray<Pick<MessageDoc, 'sender' | 'text'>>;
  prompt: string;
}

export interface ChatResponse {
  text: string;
}