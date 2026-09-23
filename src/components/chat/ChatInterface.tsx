import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { usePreferences } from '../../context/PreferencesContext';
import { useSpeechToText } from '../../hooks/useSpeechToText';
import { useTextToSpeech } from '../../hooks/useTextToSpeech';
import { sendTurn, watchMessages } from '../../services/conversations';
import {
  LANGUAGE_META,
  type LanguageCode,
  type MessageDoc,
  type TranscriptResult,
  type VoiceState,
} from '../../types';
import { LanguageSwitcher } from './LanguageSwitcher';
import { MessageBubble } from './MessageBubble';
import { VoiceOrb } from './VoiceOrb';

interface ChatInterfaceProps {
  conversationId: string;
  /** Opens the conversation drawer on small screens. */
  onOpenMenu: () => void;
}

const COPY: Record<
  LanguageCode,
  { placeholder: string; send: string; empty: string; emptyHint: string; sendFailed: string }
> = {
  en: {
    placeholder: 'Type your message',
    send: 'Send',
    empty: 'Start a conversation',
    emptyHint: 'Tap the microphone and speak, or type your message.',
    sendFailed: "That didn't send. Check your connection and try again.",
  },
  yo: {
    placeholder: 'Kọ ohun tí o fẹ́ sọ',
    send: 'Fi ránṣẹ́',
    empty: 'Bẹ̀rẹ̀ ìbánisọ̀rọ̀',
    emptyHint: 'Tẹ gbohùngbohùn náà kí o sì sọ̀rọ̀, tàbí kọ ọ̀rọ̀ rẹ sílẹ̀.',
    sendFailed: 'Kò ránṣẹ́. Ṣàyẹ̀wò ìsopọ̀ rẹ kí o sì gbìyànjú lẹ́ẹ̀kan sí i.',
  },
  ha: {
    placeholder: 'Rubuta abin da kake so ka faɗa',
    send: 'Aika',
    empty: 'Fara tattaunawa',
    emptyHint: 'Danna makurufo ka yi magana, ko ka rubuta saƙonka.',
    sendFailed: 'Bai aika ba. Duba haɗinka sannan ka sake gwadawa.',
  },
};

/** Last N turns sent as context. Beyond this, cost rises faster than quality. */
const HISTORY_WINDOW = 12;

export function ChatInterface({ conversationId, onOpenMenu }: ChatInterfaceProps): JSX.Element {
  const { user, language, locale, settings, setLanguage } = usePreferences();
  const [messages, setMessages] = useState<MessageDoc[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const feedRef = useRef<HTMLDivElement>(null);
  const copy = COPY[language];

  useEffect(
    () => watchMessages(conversationId, setMessages),
    [conversationId],
  );

  const history = useMemo(
    () =>
      messages
        .filter((message) => message.status === 'complete')
        .slice(-HISTORY_WINDOW)
        .map(({ sender, text }) => ({ sender, text })),
    [messages],
  );

  const tts = useTextToSpeech(locale);

  const submit = useCallback(
    async (text: string, source: 'text' | 'voice', confidence: number | null): Promise<void> => {
      const trimmed = text.trim();
      if (!trimmed || !user || sending) return;

      setSending(true);
      setSendError(null);
      try {
        await sendTurn({
          conversationId,
          userId: user.uid,
          language,
          text: trimmed,
          source,
          transcriptConfidence: confidence,
          history,
        });
        setDraft('');
      } catch (error) {
        // In development, show the real reason. In production, keep it friendly.
        setSendError(
          import.meta.env.DEV && error instanceof Error
            ? error.message
            : COPY[language].sendFailed,
        );
      } finally {
        setSending(false);
      }
    },
    [conversationId, user, language, history, sending],
  );

  const handleTranscript = useCallback(
    (result: TranscriptResult): void => {
      void submit(result.text, 'voice', result.confidence);
    },
    [submit],
  );

  const stt = useSpeechToText({ locale, onResult: handleTranscript });

  // Auto-speak the newest assistant reply when the user has asked for it.
  const lastSpokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!settings.autoPlayReplies || tts.unsupported) return;
    const last = messages[messages.length - 1];
    if (!last || last.sender !== 'assistant' || last.status !== 'complete') return;
    if (lastSpokenRef.current === last.id) return;
    lastSpokenRef.current = last.id;
    void tts.speak(last.id, last.text);
  }, [messages, settings.autoPlayReplies, tts]);

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  // One state drives the orb, so listening, thinking and speaking can never
  // be shown at the same time.
  const voiceState: VoiceState =
    stt.status === 'listening'
      ? 'listening'
      : stt.status === 'transcribing' || sending
        ? 'processing'
        : tts.status === 'playing'
          ? 'speaking'
          : 'idle';

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: 'var(--ground)' }}>
      <header
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid var(--line)' }}
      >
        {/* The sidebar carries the brand; this heading is for screen readers. */}
        <h1 className="sr-only">Ohùn — {LANGUAGE_META[language].endonym}</h1>
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Conversations"
          className="-ml-1.5 rounded-[var(--radius-control)] p-1.5 md:invisible"
          style={{ color: 'var(--text)' }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h10" />
          </svg>
        </button>
        <LanguageSwitcher
          value={language}
          disabled={voiceState !== 'idle'}
          onChange={(next) => void setLanguage(next)}
        />
      </header>

      <div ref={feedRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="prose-speech text-lg" lang={language} style={{ color: 'var(--text)' }}>
              {copy.empty}
            </p>
            <p className="max-w-xs text-sm" lang={language} style={{ color: 'var(--text-muted)' }}>
              {copy.emptyHint}
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              language={language}
              canSpeak={message.sender === 'assistant' && !tts.unsupported}
              isLoading={tts.activeId === message.id && tts.status === 'loading'}
              isPlaying={tts.activeId === message.id && tts.status === 'playing'}
              onSpeak={(id, text) => void tts.speak(id, text)}
            />
          ))
        )}

        {/* The assistant turn is no longer written until it arrives, so the
            waiting state lives here rather than as a pending Firestore doc. */}
        {sending && (
          <div className="flex justify-start">
            <div
              className="prose-speech rounded-[var(--radius-bubble)] px-4 py-3"
              style={{
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--line)',
              }}
            >
              <span className="flex gap-1" aria-label="Thinking">
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
            </div>
          </div>
        )}

        {stt.partial && (
          <p className="prose-speech text-right italic" lang={language} style={{ color: 'var(--text-muted)' }}>
            {stt.partial}
          </p>
        )}
      </div>

      {(stt.error ?? tts.error ?? sendError) && (
        <p
          role="alert"
          className="px-4 pb-2 text-sm"
          style={{ color: 'var(--danger)' }}
        >
          {sendError ?? stt.error?.message ?? tts.error?.message}
        </p>
      )}

      <footer
        className="flex items-end gap-3 px-4 py-4"
        style={{ borderTop: '1px solid var(--line)', backgroundColor: 'var(--surface)' }}
      >
        <div className="flex flex-1 items-end gap-2">
          <label htmlFor="composer" className="sr-only">
            {copy.placeholder}
          </label>
          <textarea
            id="composer"
            rows={1}
            value={draft}
            lang={language}
            placeholder={copy.placeholder}
            disabled={voiceState === 'listening'}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void submit(draft, 'text', null);
              }
            }}
            className="prose-speech max-h-32 flex-1 resize-none rounded-[var(--radius-control)] px-3 py-2 outline-none disabled:opacity-50"
            style={{
              backgroundColor: 'var(--surface-sunk)',
              color: 'var(--text)',
              border: '1px solid var(--line)',
            }}
          />
          <button
            type="button"
            onClick={() => void submit(draft, 'text', null)}
            disabled={!draft.trim() || sending}
            className="rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium transition-opacity disabled:opacity-40"
            style={{ backgroundColor: 'var(--surface-sunk)', color: 'var(--text)' }}
          >
            {copy.send}
          </button>
        </div>

        <VoiceOrb
          state={voiceState}
          stream={stt.stream}
          language={language}
          disabled={stt.unsupported || sending || tts.status === 'playing'}
          onToggle={stt.toggle}
        />
      </footer>
    </div>
  );
}