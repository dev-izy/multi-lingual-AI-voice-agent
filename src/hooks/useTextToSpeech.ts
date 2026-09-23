import { useCallback, useEffect, useRef, useState } from 'react';

import { browserTtsProvider, cloudTtsProvider } from '../lib/speech/cloudTts';
import { ProviderRegistry, type TtsProvider } from '../lib/speech/providers';
import { SpeechError, type SpeechErrorCode, type SpeechLocale } from '../types';

const registry = new ProviderRegistry<TtsProvider>([cloudTtsProvider, browserTtsProvider]);

export type PlaybackStatus = 'idle' | 'loading' | 'playing';

export interface UseTextToSpeechReturn {
  status: PlaybackStatus;
  /** Message id currently loading or playing, so each bubble can style itself. */
  activeId: string | null;
  error: { code: SpeechErrorCode; message: string } | null;
  /** True when no provider can voice this locale — hide play buttons. */
  unsupported: boolean;
  /** Synthesise if needed, then play. Calling again on the active id stops it. */
  speak: (id: string, text: string) => Promise<void>;
  stop: () => void;
  clearError: () => void;
}

export function useTextToSpeech(locale: SpeechLocale): UseTextToSpeechReturn {
  const [status, setStatus] = useState<PlaybackStatus>('idle');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<UseTextToSpeechReturn['error']>(null);
  // Set when the server reports voice output isn't configured (no TTS key).
  // Remembered for the session so we stop asking after every reply and the
  // play buttons disappear.
  const [serverHasNoVoice, setServerHasNoVoice] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const releaseAudio = useCallback((): void => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.removeAttribute('src');
      audioRef.current.load();
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      releaseAudio();
    };
  }, [releaseAudio]);

  const stop = useCallback((): void => {
    abortRef.current?.abort();
    abortRef.current = null;
    releaseAudio();
    if (mountedRef.current) {
      setStatus('idle');
      setActiveId(null);
    }
  }, [releaseAudio]);

  const speak = useCallback(
    async (id: string, text: string): Promise<void> => {
      // Tapping play on the message that's already talking means "stop".
      if (activeId === id && status !== 'idle') {
        stop();
        return;
      }

      stop();

      const provider = registry.resolve(locale);
      if (!provider) {
        setError({
          code: 'unsupported-language',
          message: 'No voice is available for this language yet.',
        });
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;

      setError(null);
      setActiveId(id);
      setStatus('loading');

      try {
        const { audio, mimeType } = await provider.synthesise(text, locale, controller.signal);
        if (controller.signal.aborted || !mountedRef.current) return;

        const url = URL.createObjectURL(new Blob([audio], { type: mimeType }));
        objectUrlRef.current = url;

        const element = new Audio(url);
        audioRef.current = element;

        element.onended = (): void => {
          if (mountedRef.current) {
            setStatus('idle');
            setActiveId(null);
          }
          releaseAudio();
        };

        element.onerror = (): void => {
          if (mountedRef.current) {
            setError({ code: 'provider-error', message: 'The audio could not be played.' });
            setStatus('idle');
            setActiveId(null);
          }
          releaseAudio();
        };

        // On iOS this only succeeds inside a user gesture. speak() is always
        // called from a tap, so the promise rejecting here means a real fault.
        await element.play();
        if (mountedRef.current) setStatus('playing');
      } catch (err) {
        if (controller.signal.aborted) return;
        const speechError =
          err instanceof SpeechError
            ? err
            : new SpeechError('provider-error', 'Could not play that message.');
        if (mountedRef.current) {
          if (speechError.code === 'unsupported-language') {
            // A setup state, not a failure: hide voice quietly, no error banner.
            setServerHasNoVoice(true);
          } else {
            setError({ code: speechError.code, message: speechError.message });
          }
          setStatus('idle');
          setActiveId(null);
        }
        releaseAudio();
      }
    },
    [activeId, status, locale, stop, releaseAudio],
  );

  // Switching language mid-playback would leave the wrong voice talking.
  useEffect(() => {
    stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  const clearError = useCallback((): void => setError(null), []);

  return {
    status,
    activeId,
    error,
    unsupported: serverHasNoVoice || registry.resolve(locale) === null,
    speak,
    stop,
    clearError,
  };
}