import { useCallback, useEffect, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';

import { SignIn } from './components/auth/SignIn';
import { ChatInterface } from './components/chat/ChatInterface';
import { ConversationSidebar } from './components/sidebar/ConversationSidebar';
import { usePreferences } from './context/PreferencesContext';
import { auth } from './lib/firebase';
import {
  createConversation,
  deleteConversation,
  watchConversations,
} from './services/conversations';
import type { ConversationDoc } from './types';

export function App(): JSX.Element {
  const { user, loading, language } = usePreferences();

  const [conversations, setConversations] = useState<ConversationDoc[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Guards against creating two conversations when snapshots arrive quickly.
  const creatingRef = useRef(false);
  // Read inside effects without making language a subscription dependency.
  const languageRef = useRef(language);
  languageRef.current = language;

  // One live subscription per signed-in user.
  useEffect(() => {
    if (!user) {
      setConversations(null);
      setActiveId(null);
      return;
    }
    setLoadError(null);
    return watchConversations(user.uid, setConversations, (error) =>
      setLoadError(error.message),
    );
  }, [user]);

  // Keep a valid selection: fall back to the newest conversation, or start
  // one when there are none. Also covers deleting the open conversation.
  useEffect(() => {
    if (!user || !conversations) return;
    if (activeId && conversations.some((c) => c.id === activeId)) return;

    const newest = conversations[0];
    if (newest) {
      setActiveId(newest.id);
      return;
    }

    if (creatingRef.current) return;
    creatingRef.current = true;
    void createConversation(user.uid, languageRef.current)
      .then(setActiveId)
      .finally(() => {
        creatingRef.current = false;
      });
  }, [user, conversations, activeId]);

  const handleNew = useCallback(async (): Promise<void> => {
    if (!user) return;
    setDrawerOpen(false);

    // Already sitting in an untouched conversation: reuse it rather than
    // stacking up empty ones in the history.
    const current = conversations?.find((c) => c.id === activeId);
    if (current && current.messageCount === 0) return;

    const id = await createConversation(user.uid, language);
    setActiveId(id);
  }, [user, conversations, activeId, language]);

  const handleSelect = useCallback((id: string): void => {
    setActiveId(id);
    setDrawerOpen(false);
  }, []);

  const handleDelete = useCallback(
    async (id: string): Promise<void> => {
      // Move off the conversation first, so the open message listener doesn't
      // hit permission errors while its documents are being removed.
      if (id === activeId) {
        const next = conversations?.find((c) => c.id !== id);
        setActiveId(next?.id ?? null);
      }
      await deleteConversation(id);
    },
    [activeId, conversations],
  );

  // Escape closes the mobile drawer.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  if (loading) return <Centered>Loading…</Centered>;
  if (!user) return <SignIn />;
  if (loadError) return <Centered>Could not load your conversations. {loadError}</Centered>;

  const sidebar = (
    <ConversationSidebar
      conversations={conversations ?? []}
      activeId={activeId}
      language={language}
      userEmail={user.email}
      onSelect={handleSelect}
      onNew={() => void handleNew()}
      onDelete={handleDelete}
      onSignOut={() => void signOut(auth)}
    />
  );

  return (
    <div className="flex h-dvh overflow-hidden" style={{ backgroundColor: 'var(--ground)' }}>
      {/* Desktop: always visible. */}
      <aside
        className="hidden w-72 shrink-0 md:block"
        style={{ borderRight: '1px solid var(--line)' }}
      >
        {sidebar}
      </aside>

      {/* Mobile: slide-in drawer over the chat. */}
      {/* `invisible` (visibility: hidden) rather than aria-hidden: it takes the
          panel out of the focus order too, so nothing inside can be tabbed to
          while the drawer is closed. */}
      <div
        className={`fixed inset-0 z-40 md:hidden ${drawerOpen ? '' : 'invisible pointer-events-none'}`}
      >
        <div
          className={`absolute inset-0 transition-opacity duration-200 ${drawerOpen ? 'opacity-100' : 'opacity-0'}`}
          style={{ backgroundColor: 'rgb(0 0 0 / 0.45)' }}
          onClick={() => setDrawerOpen(false)}
        />
        <aside
          className={`absolute inset-y-0 left-0 w-[82%] max-w-xs transition-transform duration-200 ease-out ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
          {sidebar}
        </aside>
      </div>

      <main className="min-w-0 flex-1">
        {activeId ? (
          // Keyed so switching conversations starts with fresh local state.
          <ChatInterface
            key={activeId}
            conversationId={activeId}
            onOpenMenu={() => setDrawerOpen(true)}
          />
        ) : (
          <Centered>Starting a conversation…</Centered>
        )}
      </main>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div
      className="flex h-full min-h-dvh items-center justify-center px-6 text-center text-sm"
      style={{ backgroundColor: 'var(--ground)', color: 'var(--text-muted)' }}
    >
      {children}
    </div>
  );
}