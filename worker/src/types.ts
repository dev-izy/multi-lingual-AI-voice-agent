/**
 * Language definitions shared with the client. Kept as its own file so the
 * Worker has no Firestore dependency.
 *
 * If you change src/types/index.ts, mirror the change here.
 */

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
