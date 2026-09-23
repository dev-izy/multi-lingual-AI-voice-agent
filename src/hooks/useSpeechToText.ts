import { useCallback, useEffect, useRef, useState } from 'react';

import { browserSttProvider } from '../lib/speech/browserStt';
import { cloudSttProvider } from '../lib/speech/cloudStt';
import { ProviderRegistry, type SttProvider, type SttSession } from '../lib/speech/providers';
import {
  SpeechError,
  type SpeechErrorCode,
  type SpeechLocale,
  type TranscriptResult,
} from '../types';

/** Cloud first; the browser recogniser is the offline / no-key fallback. */
const registry = new ProviderRegistry<SttProvider>([cloudSttProvider, browserSttProvider]);

export type ListeningStatus = 'idle' | 'listening' | 'transcribing';

export interface SpeechToTextState {
  status: ListeningStatus;
  /** Interim text, only from providers that emit partials. */
  partial: string;
  error: { code: SpeechErrorCode; message: string } | null;
  /** Live mic stream for the visualiser; null when unavailable. */
  stream: MediaStream | null;
  /** True when no provider on this device handles the current locale. */
  unsupported: boolean;
}

export interface UseSpeechToTextOptions {
  locale: SpeechLocale;
  onResult: (result: TranscriptResult) => void;
  onError?: (error: SpeechError) => void;
}

export interface UseSpeechToTextReturn extends SpeechToTextState {
  start: () => Promise<void>;
  /** Finish and transcribe. */
  stop: () => void;
  /** Discard without transcribing. */
  cancel: () => void;
  /** Convenience for a single push-to-talk button. */
  toggle: () => void;
  clearError: () => void;
}

export function useSpeechToText({
  locale,
  onResult,
  onError,
}: UseSpeechToTextOptions): UseSpeechToTextReturn {
  const [status, setStatus] = useState<ListeningStatus>('idle');
  const [partial, setPartial] = useState('');
  const [error, setError] = useState<SpeechToTextState['error']>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const sessionRef = useRef<SttSession | null>(null);
  const mountedRef = useRef(true);
  // Held in refs so the callbacks below never go stale mid-recording.
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onResultRef.current = onResult;
    onErrorRef.current = onError;
  }, [onResult, onError]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sessionRef.current?.abort();
      sessionRef.current = null;
    };
  }, []);

  const reset = useCallback((): void => {
    sessionRef.current = null;
    if (!mountedRef.current) return;
    setStatus('idle');
    setPartial('');
    setStream(null);
  }, []);

  const fail = useCallback(
    (err: SpeechError): void => {
      reset();
      // A deliberate cancel is not worth surfacing as an error.
      if (err.code === 'aborted') return;
      if (mountedRef.current) setError({ code: err.code, message: err.message });
      onErrorRef.current?.(err);
    },
    [reset],
  );

  const start = useCallback(async (): Promise<void> => {
    if (sessionRef.current) return;

    const provider = registry.resolve(locale);
    if (!provider) {
      fail(new SpeechError('unsupported-language', 'Voice input is not available for this language on this device.'));
      return;
    }

    setError(null);
    setPartial('');
    setStatus('listening');

    try {
      const session = await provider.start(locale, (result) => {
        if (mountedRef.current) setPartial(result.text);
      });

      if (!mountedRef.current) {
        session.abort();
        return;
      }

      sessionRef.current = session;
      setStream(session.stream);

      session.result
        .then((result) => {
          reset();
          onResultRef.current(result);
        })
        .catch((err: unknown) => {
          fail(err instanceof SpeechError ? err : new SpeechError('provider-error', 'Transcription failed.'));
        });
    } catch (err) {
      fail(err instanceof SpeechError ? err : new SpeechError('provider-error', 'Could not start recording.'));
    }
  }, [locale, fail, reset]);

  const stop = useCallback((): void => {
    if (!sessionRef.current) return;
    // The session is still resolving; show the user we're working on it.
    setStatus('transcribing');
    sessionRef.current.stop();
  }, []);

  const cancel = useCallback((): void => {
    sessionRef.current?.abort();
    reset();
  }, [reset]);

  const toggle = useCallback((): void => {
    if (sessionRef.current) stop();
    else void start();
  }, [start, stop]);

  const clearError = useCallback((): void => setError(null), []);

  return {
    status,
    partial,
    error,
    stream,
    unsupported: registry.resolve(locale) === null,
    start,
    stop,
    cancel,
    toggle,
    clearError,
  };
}
