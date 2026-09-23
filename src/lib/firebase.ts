import { initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import {
  GoogleAuthProvider,
  connectAuthEmulator,
  getAuth,
  type Auth,
} from 'firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getFirestore,
  type CollectionReference,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions';
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage';

import type { ConversationDoc, MessageDoc, UserDoc } from '../types';

function requireEnv(key: string): string {
  const value = import.meta.env[key] as string | undefined;
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
}

const firebaseConfig: FirebaseOptions = {
  apiKey: requireEnv('VITE_FIREBASE_API_KEY'),
  authDomain: requireEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: requireEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: requireEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: requireEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: requireEnv('VITE_FIREBASE_APP_ID'),
};

export const app: FirebaseApp = initializeApp(firebaseConfig);
export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);
/** Pin the region so cold-start latency stays predictable for West African users. */
export const functions: Functions = getFunctions(app, 'europe-west1');

export const googleProvider = new GoogleAuthProvider();

if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}

/* ------------------------------------------------------------------ *
 * Typed references
 *
 * `id` lives on the document object but never in the stored data, so
 * `toFirestore` strips it and `fromFirestore` puts it back.
 * ------------------------------------------------------------------ */

function converter<T extends { id: string }>(): FirestoreDataConverter<T> {
  return {
    toFirestore(model: T): DocumentData {
      const { id: _id, ...rest } = model;
      return rest;
    },
    fromFirestore(snapshot: QueryDocumentSnapshot): T {
      return { ...(snapshot.data() as Omit<T, 'id'>), id: snapshot.id } as T;
    },
  };
}

export const usersCol = (): CollectionReference<UserDoc> =>
  collection(db, 'users').withConverter(converter<UserDoc>());

export const userRef = (uid: string): DocumentReference<UserDoc> =>
  doc(db, 'users', uid).withConverter(converter<UserDoc>());

export const conversationsCol = (): CollectionReference<ConversationDoc> =>
  collection(db, 'conversations').withConverter(converter<ConversationDoc>());

export const conversationRef = (id: string): DocumentReference<ConversationDoc> =>
  doc(db, 'conversations', id).withConverter(converter<ConversationDoc>());

/** Messages are a subcollection — it keeps security rules simple and reads cheap. */
export const messagesCol = (conversationId: string): CollectionReference<MessageDoc> =>
  collection(db, 'conversations', conversationId, 'messages').withConverter(
    converter<MessageDoc>(),
  );
