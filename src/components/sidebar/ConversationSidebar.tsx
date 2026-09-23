import { useState } from 'react';

import type { ConversationDoc, LanguageCode } from '../../types';

interface ConversationSidebarProps {
  conversations: ConversationDoc[];
  activeId: string | null;
  language: LanguageCode;
  userEmail: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => Promise<void>;
  onSignOut: () => void;
}

interface SidebarCopy {
  newChat: string;
  untitled: string;
  empty: string;
  confirm: string;
  delete: string;
  cancel: string;
  deleteLabel: string;
  signOut: string;
  today: string;
  yesterday: string;
  history: string;
}

const COPY: Record<LanguageCode, SidebarCopy> = {
  en: {
    newChat: 'New conversation',
    untitled: 'New conversation',
    empty: 'Your conversations will appear here.',
    confirm: 'Delete this conversation?',
    delete: 'Delete',
    cancel: 'Cancel',
    deleteLabel: 'Delete conversation',
    signOut: 'Sign out',
    today: 'Today',
    yesterday: 'Yesterday',
    history: 'Conversation history',
  },
  yo: {
    newChat: 'Ìbánisọ̀rọ̀ tuntun',
    untitled: 'Ìbánisọ̀rọ̀ tuntun',
    empty: 'Àwọn ìbánisọ̀rọ̀ rẹ yóò hàn níbí.',
    confirm: 'Pa ìbánisọ̀rọ̀ yìí rẹ́?',
    delete: 'Pa á rẹ́',
    cancel: 'Fagilé',
    deleteLabel: 'Pa ìbánisọ̀rọ̀ rẹ́',
    signOut: 'Jáde',
    today: 'Lónìí',
    yesterday: 'Àná',
    history: 'Ìtàn ìbánisọ̀rọ̀',
  },
  ha: {
    newChat: 'Sabuwar tattaunawa',
    untitled: 'Sabuwar tattaunawa',
    empty: 'Tattaunawarka za ta bayyana a nan.',
    confirm: 'A goge wannan tattaunawa?',
    delete: 'Goge',
    cancel: 'Soke',
    deleteLabel: 'Goge tattaunawa',
    signOut: 'Fita',
    today: 'Yau',
    yesterday: 'Jiya',
    history: 'Tarihin tattaunawa',
  },
};

const LANGUAGE_TAG: Record<LanguageCode, string> = { en: 'EN', yo: 'YO', ha: 'HA' };

function formatWhen(conversation: ConversationDoc, copy: SidebarCopy): string {
  const stamp = conversation.lastMessageAt ?? conversation.createdAt;
  if (!stamp) return copy.today; // server timestamp not back yet: it's brand new

  const date = stamp.toDate();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const dayMs = 86_400_000;

  if (date >= startOfToday) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  if (date >= new Date(startOfToday.getTime() - dayMs)) {
    return copy.yesterday;
  }
  return date.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

export function ConversationSidebar({
  conversations,
  activeId,
  language,
  userEmail,
  onSelect,
  onNew,
  onDelete,
  onSignOut,
}: ConversationSidebarProps): JSX.Element {
  const copy = COPY[language];
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function confirmDelete(id: string): Promise<void> {
    setDeletingId(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingId(null);
      setConfirmingId(null);
    }
  }

  return (
    <nav
      aria-label={copy.history}
      className="flex h-full flex-col"
      style={{ backgroundColor: 'var(--surface-sunk)' }}
    >
      <div className="px-4 pb-3 pt-4">
        <p className="font-serif text-xl" style={{ color: 'var(--text)' }}>
          Ohùn
        </p>
      </div>

      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={onNew}
          lang={language}
          className="flex w-full items-center gap-2 rounded-[var(--radius-control)] px-3 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
          style={{ backgroundColor: 'var(--indigo)', color: 'var(--on-indigo)' }}
        >
          <PlusIcon />
          {copy.newChat}
        </button>
      </div>

      <ul className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
        {conversations.length === 0 && (
          <li className="px-3 py-6 text-center text-sm" lang={language} style={{ color: 'var(--text-muted)' }}>
            {copy.empty}
          </li>
        )}

        {conversations.map((conversation) => {
          const active = conversation.id === activeId;
          const confirming = conversation.id === confirmingId;
          const deleting = conversation.id === deletingId;
          const title = conversation.title.trim() || copy.untitled;

          if (confirming) {
            return (
              <li
                key={conversation.id}
                className="rounded-[var(--radius-control)] px-3 py-2.5"
                style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--line)' }}
              >
                <p className="text-sm" lang={language} style={{ color: 'var(--text)' }}>
                  {copy.confirm}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => void confirmDelete(conversation.id)}
                    className="rounded-[var(--radius-control)] px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                    style={{ backgroundColor: 'var(--danger)', color: 'var(--ground)' }}
                  >
                    {deleting ? '…' : copy.delete}
                  </button>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => setConfirmingId(null)}
                    className="rounded-[var(--radius-control)] px-3 py-1.5 text-xs disabled:opacity-50"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {copy.cancel}
                  </button>
                </div>
              </li>
            );
          }

          return (
            <li key={conversation.id} className="group relative">
              <button
                type="button"
                onClick={() => onSelect(conversation.id)}
                aria-current={active ? 'page' : undefined}
                className="flex w-full flex-col gap-0.5 rounded-[var(--radius-control)] py-2.5 pl-3 pr-10 text-left transition-colors"
                style={{
                  backgroundColor: active ? 'var(--surface)' : 'transparent',
                  boxShadow: active ? 'inset 2px 0 0 var(--brass)' : 'none',
                }}
              >
                <span
                  className="prose-speech truncate text-sm leading-snug"
                  lang={conversation.language}
                  style={{ color: 'var(--text)' }}
                >
                  {title}
                </span>
                <span className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                  <span
                    className="rounded px-1 text-[10px] font-medium tracking-wide"
                    style={{ border: '1px solid var(--line)' }}
                  >
                    {LANGUAGE_TAG[conversation.language]}
                  </span>
                  {formatWhen(conversation, copy)}
                </span>
              </button>

              {/* Always visible on touch screens; revealed on hover or focus with a mouse. */}
              <button
                type="button"
                onClick={() => setConfirmingId(conversation.id)}
                aria-label={copy.deleteLabel}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-[var(--radius-control)] p-1.5 transition-opacity md:opacity-0 md:focus:opacity-100 md:group-hover:opacity-100"
                style={{ color: 'var(--text-muted)' }}
              >
                <TrashIcon />
              </button>
            </li>
          );
        })}
      </ul>

      <div
        className="flex items-center justify-between gap-2 px-4 py-3"
        style={{ borderTop: '1px solid var(--line)' }}
      >
        <span className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>
          {userEmail}
        </span>
        <button
          type="button"
          onClick={onSignOut}
          lang={language}
          className="shrink-0 text-xs underline underline-offset-4"
          style={{ color: 'var(--text-muted)' }}
        >
          {copy.signOut}
        </button>
      </div>
    </nav>
  );
}

function PlusIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function TrashIcon(): JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </svg>
  );
}