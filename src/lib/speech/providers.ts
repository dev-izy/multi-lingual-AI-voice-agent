import type { SpeechLocale, SynthesisResult, TranscriptResult } from '../../types';

/**
 * Every STT backend implements this. Sessions are explicit objects rather
 * than start/stop methods on the provider so two components can never
 * fight over one recogniser instance.
 */
export interface SttSession {
  /** Resolves with the final transcript, or rejects with a SpeechError. */
  readonly result: Promise<TranscriptResult>;
  /** Stop capture and finalise. Safe to call twice. */
  stop(): void;
  /** Stop capture and discard. Rejects `result` with code 'aborted'. */
  abort(): void;
  /**
   * Live audio for the visualiser. Browser providers that own their own
   * capture expose the same stream; null when unavailable.
   */
  readonly stream: MediaStream | null;
}

export interface SttProvider {
  readonly id: string;
  /** False when the environment can't support it at all. */
  isAvailable(): boolean;
  supportsLocale(locale: SpeechLocale): boolean;
  /** `onPartial` fires only for providers with interim results. */
  start(locale: SpeechLocale, onPartial?: (partial: TranscriptResult) => void): Promise<SttSession>;
}

export interface TtsProvider {
  readonly id: string;
  isAvailable(): boolean;
  supportsLocale(locale: SpeechLocale): boolean;
  synthesise(text: string, locale: SpeechLocale, signal?: AbortSignal): Promise<SynthesisResult>;
}

/**
 * Ordered by preference. The first provider that is available and
 * supports the locale wins.
 *
 * To swap Spitch for AssemblyAI, N-ATLAS or Google, write a new adapter
 * against the interfaces above and reorder these arrays. Nothing in the
 * hooks or components changes.
 */
export class ProviderRegistry<P extends SttProvider | TtsProvider> {
  constructor(private readonly providers: readonly P[]) {}

  resolve(locale: SpeechLocale): P | null {
    return (
      this.providers.find((p) => p.isAvailable() && p.supportsLocale(locale)) ?? null
    );
  }

  /** For settings UI: what could this device do for this locale? */
  available(locale: SpeechLocale): readonly P[] {
    return this.providers.filter((p) => p.isAvailable() && p.supportsLocale(locale));
  }
}
