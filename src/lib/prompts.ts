import { LANGUAGE_META, type LanguageCode } from '../types';

/**
 * Prompts are written in English because instruction-following is more
 * reliable in English on every current frontier model, even when the
 * output language differs. The few-shot examples carry the target
 * orthography, which is what actually anchors the output.
 *
 * Treat prompting as necessary but not sufficient for Yorùbá tone marks:
 * models drop them under length pressure. The diacritic restoration pass
 * in functions/src/index.ts is the real guarantee.
 */

interface LanguageRules {
  /** Orthographic constraints specific to the script. */
  readonly orthography: readonly string[];
  /** Short exchange in the target language, to anchor register and marks. */
  readonly example: { readonly user: string; readonly assistant: string };
  /** Spoken-first phrasing notes — output is usually heard, not read. */
  readonly register: string;
}

const RULES: Readonly<Record<LanguageCode, LanguageRules>> = {
  en: {
    orthography: [
      'Use standard English spelling. Either British or American is fine, but stay consistent within a reply.',
      'Keep Yorùbá and Hausa names, places and terms in their own correct spelling, diacritics included — write Ọ̀ṣun, not Osun, and ƙasa, not kasa.',
    ],
    example: {
      user: 'Can you tell me how to cook beans?',
      assistant:
        'Sure. Wash the beans well, then soak them for about an hour. Boil them with salt and palm oil until they soften — around forty minutes, depending on the beans.',
    },
    register:
      'Your reply will usually be read aloud, so prefer short sentences and natural spoken rhythm over dense written prose.',
  },
  yo: {
    orthography: [
      'Write every tone mark. Yorùbá has three tones: high (á), mid (unmarked, a), low (à). Omitting them changes meaning — "ọkọ̀" (vehicle), "ọkọ" (husband), and "ọ̀kọ̀" (spear) are different words.',
      'Write every sub-dot: ẹ, ọ, ṣ. Never substitute e, o, s.',
      'When a vowel carries both a sub-dot and a tone mark, write both: ẹ́, ẹ̀, ọ́, ọ̀.',
      'Use Yorùbá numerals in running prose for small numbers (ọ̀kan, méjì, ẹ̀ta); use digits for dates, prices, and anything the user typed as a digit.',
    ],
    example: {
      user: 'Ṣé o lè sọ fún mi bí a ṣe ń se ẹ̀wà?',
      assistant:
        'Bẹ́ẹ̀ ni. Kọ́kọ́ fọ ẹ̀wà náà dáadáa, kí o sì fi sínú omi fún wákàtí kan. Lẹ́yìn náà, se é lórí iná pẹ̀lú iyọ̀ àti epo pupa títí yóò fi rọ̀.',
    },
    register:
      'Your reply will usually be read aloud, so prefer short sentences and natural spoken rhythm over dense written prose.',
  },
  ha: {
    orthography: [
      'Use standard Boko orthography. Write the hooked letters correctly: ɓ, ɗ, ƙ, and ʼy. Never substitute b, d, k, or y for them — "ƙasa" (land) and "kasa" (below) are different words.',
      'Use the apostrophe for glottalised forms where standard spelling requires it (sʼan, ʼyaʼya).',
      'Tone and vowel length are not marked in standard written Hausa. Do not invent diacritics that standard orthography does not use.',
    ],
    example: {
      user: 'Ka gaya mini yadda ake dafa shinkafa.',
      assistant:
        'To. Ka fara wanke shinkafar sosai, sannan ka zuba ruwa a tukunya ya tafasa. Ka zuba shinkafar da gishiri, ka rufe har sai ta nuna.',
    },
    register:
      'Your reply will usually be read aloud, so prefer short sentences and natural spoken rhythm over dense written prose.',
  },
};

export interface PromptOptions {
  /** True when the user's turn arrived via speech recognition. */
  fromVoice?: boolean;
  /** Optional persona line, e.g. a tutor or a customer-service role. */
  persona?: string;
}

export function buildSystemPrompt(
  language: LanguageCode,
  options: PromptOptions = {},
): string {
  const meta = LANGUAGE_META[language];
  const rules = RULES[language];
  const { fromVoice = false, persona } = options;

  const lines: string[] = [
    persona ?? `You are a helpful assistant who speaks fluent ${meta.endonym}.`,
    '',
    language === 'en'
      ? 'Reply in English. If the user writes to you in Yorùbá or Hausa, answer in that language instead — match whatever they used.'
      : `Reply only in ${meta.endonym}. Do not reply in English, and do not append an English translation, even if the user writes to you in English or mixes English into their message.`,
    '',
    'Orthography:',
    ...rules.orthography.map((rule) => `- ${rule}`),
    '',
    'Register:',
    `- ${rules.register}`,
    `- Match the user's level of formality. If they greet you, greet them back properly before answering.`,
    `- Loanwords with no established ${meta.endonym} equivalent (technical or brand terms) may stay in their original form. Do not invent words.`,
    `- If you do not know something, say so plainly in ${meta.endonym} rather than guessing.`,
  ];

  if (fromVoice) {
    lines.push(
      '',
      'This message came from speech recognition and may contain transcription errors. If a word looks garbled, infer the likely intent from context and answer that. Only ask the user to repeat themselves if the whole message is unintelligible.',
    );
  }

  lines.push(
    '',
    'Example of the expected output:',
    `User: ${rules.example.user}`,
    `You: ${rules.example.assistant}`,
  );

  return lines.join('\n');
}

/**
 * Separate, cheap call used to name a conversation from its opening turn.
 * Kept short deliberately — titles are rendered in constrained UI.
 */
export function buildTitlePrompt(language: LanguageCode): string {
  const meta = LANGUAGE_META[language];
  return [
    `Write a title for this conversation in ${meta.endonym}.`,
    'Rules: maximum five words, no quotation marks, no trailing punctuation, no English.',
    language === 'yo'
      ? 'Include all tone marks and sub-dots.'
      : language === 'ha'
        ? 'Use correct Boko orthography including ɓ, ɗ, ƙ.'
        : 'Use standard English spelling.',
    'Return the title alone with no preamble.',
  ].join(' ');
}

/**
 * Used when the model returns Yorùbá stripped of tone marks and no
 * dedicated diacritics API is configured. A last resort — a purpose-built
 * restoration model beats this.
 */
export function buildDiacriticRepairPrompt(): string {
  return [
    'Restore Yorùbá tone marks and sub-dots to the text below.',
    'Change nothing else: keep the same words, order, and punctuation.',
    'Return only the corrected text, with no commentary.',
  ].join(' ');
}
