import { useAudioLevel } from '../../hooks/useAudioLevel';
import type { LanguageCode, VoiceState } from '../../types';

interface VoiceOrbProps {
  state: VoiceState;
  stream: MediaStream | null;
  language: LanguageCode;
  disabled: boolean;
  onToggle: () => void;
}

/** Labels are shown in the user's language, not English. */
const LABELS: Record<LanguageCode, Record<VoiceState, string>> = {
  en: {
    idle: 'Tap to speak',
    listening: 'Listening…',
    processing: 'Working…',
    speaking: 'Speaking',
  },
  yo: {
    idle: 'Tẹ̀ kí o sọ̀rọ̀',
    listening: 'Ń gbọ́…',
    processing: 'Ń ṣiṣẹ́…',
    speaking: 'Ń sọ̀rọ̀',
  },
  ha: {
    idle: 'Danna ka yi magana',
    listening: 'Ina saurare…',
    processing: 'Ina aiki…',
    speaking: 'Ina magana',
  },
};

export function VoiceOrb({
  state,
  stream,
  language,
  disabled,
  onToggle,
}: VoiceOrbProps): JSX.Element {
  const level = useAudioLevel(stream, state === 'listening');
  const label = LABELS[language][state];

  // Ring size tracks real amplitude while listening; the other states get a
  // fixed presence so nothing moves without a reason.
  const ringScale = state === 'listening' ? 1 + level * 0.55 : 1;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative flex h-16 w-16 items-center justify-center">
        {state === 'listening' && (
          <>
            <span
              className="orb-ripple absolute inset-0 rounded-full border"
              style={{ borderColor: 'var(--indigo)' }}
              aria-hidden="true"
            />
            <span
              className="orb-ripple absolute inset-0 rounded-full border"
              style={{ borderColor: 'var(--indigo)', animationDelay: '0.8s' }}
              aria-hidden="true"
            />
          </>
        )}

        <span
          className="absolute inset-0 rounded-full transition-transform duration-75 ease-out"
          style={{
            backgroundColor: 'var(--indigo)',
            opacity: state === 'idle' ? 0 : 0.22,
            transform: `scale(${ringScale})`,
          }}
          aria-hidden="true"
        />

        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          aria-label={label}
          aria-pressed={state === 'listening'}
          className="relative z-10 flex h-14 w-14 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            backgroundColor: state === 'listening' ? 'var(--brass)' : 'var(--indigo)',
            color: 'var(--on-indigo)',
          }}
        >
          {state === 'processing' ? (
            <Spinner />
          ) : state === 'listening' ? (
            <StopIcon />
          ) : (
            <MicIcon />
          )}
        </button>
      </div>

      <p
        className="text-xs tabular-nums"
        style={{ color: 'var(--text-muted)' }}
        aria-live="polite"
      >
        {label}
      </p>
    </div>
  );
}

function MicIcon(): JSX.Element {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

function StopIcon(): JSX.Element {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function Spinner(): JSX.Element {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin" aria-hidden="true">
      <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
    </svg>
  );
}
