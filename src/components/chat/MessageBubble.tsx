import type { LanguageCode, MessageDoc } from '../../types';

interface MessageBubbleProps {
  message: MessageDoc;
  language: LanguageCode;
  isLoading: boolean;
  isPlaying: boolean;
  /** Hide the play control entirely when no voice exists for this language. */
  canSpeak: boolean;
  onSpeak: (id: string, text: string) => void;
}

const PLAY_LABEL: Record<LanguageCode, { play: string; stop: string; failed: string }> = {
  en: { play: 'Play', stop: 'Stop', failed: "That didn't send. Try again." },
  yo: { play: 'Gbọ́ ọ̀rọ̀ yìí', stop: 'Dá a dúró', failed: 'Kò ránṣẹ́. Gbìyànjú lẹ́ẹ̀kan sí i.' },
  ha: { play: 'Saurari wannan', stop: 'Tsaya', failed: 'Bai aika ba. Sake gwadawa.' },
};

export function MessageBubble({
  message,
  language,
  isLoading,
  isPlaying,
  canSpeak,
  onSpeak,
}: MessageBubbleProps): JSX.Element {
  const isUser = message.sender === 'user';
  const labels = PLAY_LABEL[language];

  return (
    <article
      className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}
      aria-label={isUser ? 'Your message' : 'Assistant message'}
    >
      <div className={`flex max-w-[min(42rem,88%)] flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className="prose-speech rounded-[var(--radius-bubble)] px-4 py-3"
          style={
            isUser
              ? { backgroundColor: 'var(--indigo)', color: 'var(--on-indigo)' }
              : {
                  backgroundColor: 'var(--surface)',
                  color: 'var(--text)',
                  border: '1px solid var(--line)',
                }
          }
          // Tells the screen reader and the renderer which language this is,
          // so pronunciation and font fallback are correct per message.
          lang={message.language}
        >
          {message.status === 'pending' ? <TypingDots /> : message.text}
        </div>

        <div className="flex items-center gap-3 px-1">
          {message.status === 'failed' && (
            <span className="text-xs" style={{ color: 'var(--danger)' }}>
              {labels.failed}
            </span>
          )}

          {canSpeak && message.status === 'complete' && (
            <button
              type="button"
              onClick={() => onSpeak(message.id, message.text)}
              aria-label={isPlaying ? labels.stop : labels.play}
              className="flex items-center gap-1.5 rounded-[var(--radius-control)] px-1.5 py-1 text-xs transition-colors hover:bg-[color:var(--surface-sunk)]"
              style={{ color: isPlaying ? 'var(--brass)' : 'var(--text-muted)' }}
            >
              {isLoading ? <LoadingBar /> : isPlaying ? <PauseIcon /> : <PlayIcon />}
              <span>{isPlaying ? labels.stop : labels.play}</span>
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function TypingDots(): JSX.Element {
  return (
    <span className="flex gap-1" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="h-1.5 w-1.5 rounded-full"
          style={{
            backgroundColor: 'var(--text-muted)',
            animation: 'pulse 1.2s ease-in-out infinite',
            animationDelay: `${index * 0.18}s`,
          }}
        />
      ))}
    </span>
  );
}

function PlayIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M7 5h3v14H7zM14 5h3v14h-3z" />
    </svg>
  );
}

function LoadingBar(): JSX.Element {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="animate-spin" aria-hidden="true">
      <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
    </svg>
  );
}
