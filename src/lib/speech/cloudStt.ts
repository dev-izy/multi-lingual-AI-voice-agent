import { callApi } from '../api';
import {
  SpeechError,
  type SpeechLocale,
  type TranscribeRequest,
  type TranscribeResponse,
  type TranscriptResult,
} from '../../types';
import type { SttProvider, SttSession } from './providers';

/** Ordered by how widely browsers support them for MediaRecorder. */
const CANDIDATE_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4', // Safari
] as const;

function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return CANDIDATE_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  // Chunked to avoid blowing the argument limit on large clips.
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Batch transcription: record the whole utterance, send once. Simpler and
 * cheaper than streaming, and for a turn-based chat the latency difference
 * is small. If you later need interim results, swap this for a WebSocket
 * adapter — the SttSession interface already allows partials.
 */
export const cloudSttProvider: SttProvider = {
  id: 'cloud',

  isAvailable(): boolean {
    return (
      typeof MediaRecorder !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices?.getUserMedia) &&
      pickMimeType() !== null
    );
  },

  supportsLocale(): boolean {
    // Server side decides. Keeping this permissive means adding a locale
    // is a server change, not a client release.
    return true;
  },

  async start(locale: SpeechLocale): Promise<SttSession> {
    const mimeType = pickMimeType();
    if (!mimeType) {
      throw new SpeechError('unsupported-browser', 'This browser cannot record audio.');
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      throw name === 'NotAllowedError'
        ? new SpeechError('permission-denied', 'Microphone access is blocked.')
        : new SpeechError('no-microphone', 'No microphone was found.');
    }

    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks: Blob[] = [];
    let aborted = false;

    recorder.ondataavailable = (event: BlobEvent): void => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    const result = new Promise<TranscriptResult>((resolve, reject) => {
      recorder.onstop = (): void => {
        stream.getTracks().forEach((track) => track.stop());

        if (aborted) {
          reject(new SpeechError('aborted', 'Recording cancelled.'));
          return;
        }

        const blob = new Blob(chunks, { type: mimeType });
        if (blob.size < 1024) {
          reject(new SpeechError('no-speech', 'That recording was too short.'));
          return;
        }

        void blobToBase64(blob)
          .then((audioBase64) =>
            callApi<TranscribeRequest, TranscribeResponse>('/transcribe', {
              audioBase64,
              mimeType,
              locale,
            }),
          )
          .then((data) => {
            const text = data.text.trim();
            if (!text) {
              reject(new SpeechError('no-speech', 'Nothing was recognised in that recording.'));
              return;
            }
            resolve({ text, confidence: data.confidence, isFinal: true, locale });
          })
          .catch((error: unknown) => {
            reject(
              new SpeechError(
                'provider-error',
                error instanceof Error ? error.message : 'Transcription failed.',
              ),
            );
          });
      };

      recorder.onerror = (): void => {
        stream.getTracks().forEach((track) => track.stop());
        reject(new SpeechError('provider-error', 'Recording failed.'));
      };
    });

    recorder.start();

    return {
      result,
      stream,
      stop: () => {
        if (recorder.state === 'recording') recorder.stop();
      },
      abort: () => {
        aborted = true;
        if (recorder.state === 'recording') recorder.stop();
        else stream.getTracks().forEach((track) => track.stop());
      },
    };
  },
};
