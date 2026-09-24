import { SpeechError, type SpeechLocale } from '../../types';
import type { LocalTtsProvider } from './providers';

/**
 * Speaks English through the device's own voices, at no cost.
 *
 * Deliberately English-only. No mainstream platform ships a Yorùbá or
 * Hausa voice, and `speechSynthesis` does not fail when asked for one —
 * it quietly substitutes an English voice that reads the orthography as
 * mangled English. Restricting this provider means those languages fall
 * through to the paid provider, which actually speaks them.
 */

/**
 * Voices load asynchronously and `getVoices()` is empty on first call in
 * some browsers, so warm the list and keep it fresh.
 */
let cachedVoices: SpeechSynthesisVoice[] = [];

function refreshVoices(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  cachedVoices = window.speechSynthesis.getVoices();
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  refreshVoices();
  window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
}

function pickVoice(locale: SpeechLocale): SpeechSynthesisVoice | null {
  if (cachedVoices.length === 0) refreshVoices();
  const english = cachedVoices.filter((voice) => voice.lang.toLowerCase().startsWith('en'));
  if (english.length === 0) return null;

  // Prefer an exact locale match, then a local (offline) voice, then anything.
  const exact = english.find((voice) => voice.lang.replace('_', '-') === locale);
  const local = english.find((voice) => voice.localService);
  return exact ?? local ?? english[0] ?? null;
}

export const browserTtsProvider: LocalTtsProvider = {
  id: 'device',
  kind: 'local',

  isAvailable(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  },

  supportsLocale(locale: SpeechLocale): boolean {
    // English only — see the note above. Every platform ships English
    // voices, so this does not check the cache, which may still be empty
    // on the very first render.
    return locale.startsWith('en');
  },

  speak(text, locale, handlers) {
    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = pickVoice(locale);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? locale;

    let finished = false;

    utterance.onend = (): void => {
      if (finished) return;
      finished = true;
      handlers.onEnd();
    };

    utterance.onerror = (event: SpeechSynthesisErrorEvent): void => {
      if (finished) return;
      finished = true;
      // Cancelling fires an error too; that is our own stop(), not a fault.
      if (event.error === 'canceled' || event.error === 'interrupted') {
        handlers.onEnd();
        return;
      }
      handlers.onError(new SpeechError('provider-error', 'The device could not read that aloud.'));
    };

    // Clear anything still queued from a previous message.
    synth.cancel();
    synth.speak(utterance);

    return {
      stop: () => {
        finished = true;
        synth.cancel();
      },
    };
  },
};