import { useEffect, useRef, useState } from 'react';

/**
 * RMS amplitude of a live mic stream, normalised to 0..1 and smoothed.
 *
 * Returns state rather than a ref because the orb is small and cheap to
 * re-render. If you later drive a canvas or many elements from this,
 * switch to writing a CSS custom property from the rAF loop instead.
 */
export function useAudioLevel(stream: MediaStream | null, active: boolean): number {
  const [level, setLevel] = useState(0);
  const smoothedRef = useRef(0);

  useEffect(() => {
    if (!stream || !active) {
      smoothedRef.current = 0;
      setLevel(0);
      return;
    }

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      // Still show *something* is being heard, just not a moving ripple.
      setLevel(0.35);
      return;
    }

    const context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser);

    const buffer = new Float32Array(analyser.fftSize);
    let frame = 0;

    const tick = (): void => {
      analyser.getFloatTimeDomainData(buffer);

      let sumSquares = 0;
      for (let i = 0; i < buffer.length; i += 1) {
        const sample = buffer[i] ?? 0;
        sumSquares += sample * sample;
      }
      const rms = Math.sqrt(sumSquares / buffer.length);

      // Speech RMS sits low; scale up then clamp so normal talking fills
      // most of the range without shouting pinning it at 1.
      const scaled = Math.min(1, rms * 6);
      // Asymmetric smoothing: rise fast so it feels responsive, fall slow
      // so the orb doesn't flicker between syllables.
      const previous = smoothedRef.current;
      smoothedRef.current = scaled > previous ? scaled : previous * 0.88 + scaled * 0.12;

      setLevel(smoothedRef.current);
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      analyser.disconnect();
      void context.close();
      smoothedRef.current = 0;
      setLevel(0);
    };
  }, [stream, active]);

  return level;
}
