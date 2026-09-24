import {
  SpeechError,
  type SpeechLocale,
  type TranscriptResult,
} from '../../types';
import type { SttProvider, SttSession } from './providers';

/**
 * Requires `@types/dom-speech-recognition` — SpeechRecognition is not in
 * TypeScript's default DOM lib.
 */
type RecognitionCtor = new () => SpeechRecognition;

function getRecognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Chrome lists yo-NG and ha-NG, but the language list is not queryable and
 * an unsupported locale fails silently by returning English-ish text. This
 * provider therefore sits *below* the cloud provider in the registry and
 * is only reached when the cloud path is unavailable (offline, no key).
 */
const SUPPORTED = new Set<SpeechLocale>(['en-NG', 'en-US', 'yo-NG', 'ha-NG']);

export const browserSttProvider: SttProvider = {
  id: 'browser',

  isAvailable(): boolean {
    return getRecognitionCtor() !== null;
  },

  supportsLocale(locale: SpeechLocale): boolean {
    return SUPPORTED.has(locale);
  },

  async start(
    locale: SpeechLocale,
    onPartial?: (partial: TranscriptResult) => void,
  ): Promise<SttSession> {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      throw new SpeechError('unsupported-browser', 'This browser has no speech recognition.');
    }

    // Recognition manages its own capture, so we open a parallel stream
    // purely to drive the amplitude visualiser.
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      stream = null; // Visualiser degrades to a static state; recognition may still work.
    }

    const recognition = new Ctor();
    recognition.lang = locale;
    recognition.interimResults = Boolean(onPartial);
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    let settled = false;
    let resolveResult: (value: TranscriptResult) => void = () => {};
    let rejectResult: (reason: SpeechError) => void = () => {};

    const result = new Promise<TranscriptResult>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });

    const cleanup = (): void => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      stream?.getTracks().forEach((track) => track.stop());
    };

    recognition.onresult = (event: SpeechRecognitionEvent): void => {
      const last = event.results[event.results.length - 1];
      if (!last) return;
      const alternative = last[0];
      if (!alternative) return;

      const payload: TranscriptResult = {
        text: alternative.transcript.trim(),
        confidence: Number.isFinite(alternative.confidence) ? alternative.confidence : null,
        isFinal: last.isFinal,
        locale,
      };

      if (last.isFinal) {
        settled = true;
        cleanup();
        resolveResult(payload);
      } else {
        onPartial?.(payload);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent): void => {
      if (settled) return;
      settled = true;
      cleanup();
      rejectResult(mapRecognitionError(event.error));
    };

    recognition.onend = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      rejectResult(new SpeechError('no-speech', 'No speech was detected.'));
    };

    recognition.start();

    return {
      result,
      stream,
      stop: () => recognition.stop(),
      abort: () => {
        if (!settled) {
          settled = true;
          cleanup();
          rejectResult(new SpeechError('aborted', 'Recording cancelled.'));
        }
        recognition.abort();
      },
    };
  },
};

function mapRecognitionError(error: SpeechRecognitionErrorCode): SpeechError {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return new SpeechError('permission-denied', 'Microphone access is blocked.');
    case 'audio-capture':
      return new SpeechError('no-microphone', 'No microphone was found.');
    case 'no-speech':
      return new SpeechError('no-speech', 'No speech was detected.');
    case 'network':
      return new SpeechError('network', 'Speech recognition lost its connection.');
    case 'language-not-supported':
      return new SpeechError('unsupported-language', 'This browser cannot recognise that language.');
    case 'aborted':
      return new SpeechError('aborted', 'Recording cancelled.');
    default:
      return new SpeechError('provider-error', `Speech recognition failed (${error}).`);
  }
}