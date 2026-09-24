import { ApiError, callApi } from '../api';
import {
  SpeechError,
  type SpeechLocale,
  type SynthesiseRequest,
  type SynthesiseResponse,
  type SynthesisResult,
} from '../../types';
import type { BufferTtsProvider } from './providers';

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Replaying a message should not cost a second synthesis call, so keep a
 * small in-memory cache keyed by locale + text. Bounded, because audio
 * buffers are large and this lives for the whole session.
 */
const CACHE_LIMIT = 24;
const cache = new Map<string, SynthesisResult>();

function remember(key: string, value: SynthesisResult): void {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, value);
}

export const cloudTtsProvider: BufferTtsProvider = {
  id: 'cloud',
  kind: 'buffer',

  isAvailable(): boolean {
    return typeof Audio !== 'undefined';
  },

  supportsLocale(): boolean {
    return true; // Server decides; see cloudStt for the same reasoning.
  },

  async synthesise(
    text: string,
    locale: SpeechLocale,
    signal?: AbortSignal,
  ): Promise<SynthesisResult> {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new SpeechError('provider-error', 'There is nothing to read aloud.');
    }

    const key = `${locale}:${trimmed}`;
    const hit = cache.get(key);
    if (hit) return hit;

    try {
      const data = await callApi<SynthesiseRequest, SynthesiseResponse>(
        '/synthesise',
        { text: trimmed, locale },
        signal,
      );
      if (signal?.aborted) {
        throw new SpeechError('aborted', 'Playback cancelled.');
      }

      const result: SynthesisResult = {
        audio: base64ToArrayBuffer(data.audioBase64),
        mimeType: data.mimeType,
        storageUrl: null,
      };
      remember(key, result);
      return result;
    } catch (error) {
      if (error instanceof SpeechError) throw error;
      // 501 means no TTS key is configured — a setup state, not a fault.
      if (error instanceof ApiError && error.status === 501) {
        throw new SpeechError('unsupported-language', 'Voice output is not configured yet.');
      }
      throw new SpeechError(
        'provider-error',
        error instanceof Error ? error.message : 'Could not generate audio.',
      );
    }
  },
};