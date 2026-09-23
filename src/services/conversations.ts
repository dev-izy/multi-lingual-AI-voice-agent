import {
  addDoc,
  deleteDoc,
  doc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

import { callApi } from '../lib/api';
import { conversationRef, conversationsCol, messagesCol } from '../lib/firebase';
import type {
  ChatRequest,
  ChatResponse,
  ConversationDoc,
  LanguageCode,
  MessageDoc,
} from '../types';

/* ------------------------------------------------------------------ *
 * Conversations
 * ------------------------------------------------------------------ */

/**
 * Starts with an empty title. The first message the user sends becomes the
 * title (see sendTurn), and the sidebar shows "New conversation" until then.
 */
export async function createConversation(
  userId: string,
  language: LanguageCode,
): Promise<string> {
  // Generated client-side so the id is known before the write lands.
  const ref = doc(conversationsCol());
  await setDoc(ref, {
    id: ref.id,
    userId,
    title: '',
    language,
    messageCount: 0,
    lastMessageAt: null,
    createdAt: serverTimestamp(),
  } as unknown as ConversationDoc);
  return ref.id;
}

/** Newest activity first. A conversation still awaiting its server timestamp counts as newest. */
function activityTime(conversation: ConversationDoc): number {
  return (
    (conversation.lastMessageAt ?? conversation.createdAt)?.toMillis() ??
    Number.MAX_SAFE_INTEGER
  );
}

export function watchConversations(
  userId: string,
  onChange: (conversations: ConversationDoc[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  // Equality-only query, so no composite index is needed. Sorting happens
  // in the browser — trivial for fifty documents.
  const q = query(conversationsCol(), where('userId', '==', userId), limit(50));

  return onSnapshot(
    q,
    (snapshot) => {
      const conversations = snapshot.docs.map((d) => d.data());
      conversations.sort((a, b) => activityTime(b) - activityTime(a));
      onChange(conversations);
    },
    (error) => {
      console.error('Could not load conversations:', error);
      onError?.(error);
    },
  );
}

/**
 * Firestore does not delete subcollections along with their parent, so the
 * messages go first. Order matters for a second reason: the security rule
 * on each message checks the parent conversation's owner, which fails once
 * the parent is gone.
 *
 * Deletes run in small parallel chunks rather than one big batch, which
 * keeps each rule evaluation well inside Firestore's per-request limits.
 */
export async function deleteConversation(conversationId: string): Promise<void> {
  const snapshot = await getDocs(messagesCol(conversationId));
  const refs = snapshot.docs.map((d) => d.ref);

  const CHUNK = 20;
  for (let i = 0; i < refs.length; i += CHUNK) {
    await Promise.all(refs.slice(i, i + CHUNK).map((ref) => deleteDoc(ref)));
  }

  await deleteDoc(conversationRef(conversationId));
}

/* ------------------------------------------------------------------ *
 * Messages
 * ------------------------------------------------------------------ */

export function watchMessages(
  conversationId: string,
  onChange: (messages: MessageDoc[]) => void,
): Unsubscribe {
  const q = query(messagesCol(conversationId), orderBy('timestamp', 'asc'), limit(200));
  return onSnapshot(
    q,
    (snapshot) => onChange(snapshot.docs.map((d) => d.data())),
    (error) => console.error('Could not load messages:', error),
  );
}

export interface SendTurnInput {
  conversationId: string;
  userId: string;
  language: LanguageCode;
  text: string;
  source: 'text' | 'voice';
  transcriptConfidence: number | null;
  /** Trimmed history for context, oldest first. */
  history: ReadonlyArray<Pick<MessageDoc, 'sender' | 'text'>>;
}

/**
 * Writes the user's turn, asks the Worker for a reply, then writes that.
 *
 * The Worker has no Admin SDK, so the client does both writes. The trade-off
 * is that a determined user could forge an assistant message — but only
 * inside their own conversation, which affects nobody else's data.
 */
export async function sendTurn(input: SendTurnInput): Promise<void> {
  const { conversationId, userId, language, text, source, transcriptConfidence, history } = input;

  await addDoc(messagesCol(conversationId), {
    conversationId,
    userId,
    sender: 'user',
    text,
    language,
    status: 'complete',
    audioUrl: null,
    source,
    transcriptConfidence,
    timestamp: serverTimestamp(),
  } as unknown as MessageDoc);

  // Title from the first thing the user says: no extra model call, no latency.
  if (history.length === 0) {
    await updateDoc(conversationRef(conversationId), { title: text.slice(0, 60) });
  }

  const reply = await callApi<Omit<ChatRequest, 'conversationId'>, ChatResponse>('/chat', {
    language,
    history,
    prompt: text,
  });

  await addDoc(messagesCol(conversationId), {
    conversationId,
    userId,
    sender: 'assistant',
    text: reply.text,
    language,
    status: 'complete',
    audioUrl: null,
    source: 'text',
    transcriptConfidence: null,
    timestamp: serverTimestamp(),
  } as unknown as MessageDoc);

  await updateDoc(conversationRef(conversationId), {
    messageCount: increment(2),
    lastMessageAt: serverTimestamp(),
  });
}