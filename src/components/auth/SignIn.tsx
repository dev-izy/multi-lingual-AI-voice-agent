import { useState, type FormEvent } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  type AuthError,
} from 'firebase/auth';

import { auth, googleProvider } from '../../lib/firebase';

type Mode = 'signIn' | 'signUp';

export function SignIn(): JSX.Element {
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(readableAuthError(caught));
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    void run(() =>
      mode === 'signIn'
        ? signInWithEmailAndPassword(auth, email, password)
        : createUserWithEmailAndPassword(auth, email, password),
    );
  }

  return (
    <div
      className="flex h-dvh items-center justify-center px-6"
      style={{ backgroundColor: 'var(--ground)' }}
    >
      <div className="w-full max-w-sm">
        <h1
          className="font-serif text-3xl"
          style={{ color: 'var(--text)' }}
        >
          Ohùn
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          Talk or type in Yorùbá and Hausa.
        </p>

        <button
          type="button"
          disabled={busy}
          onClick={() => void run(() => signInWithPopup(auth, googleProvider))}
          className="mt-8 w-full rounded-[var(--radius-control)] py-2.5 text-sm font-medium disabled:opacity-50"
          style={{ backgroundColor: 'var(--indigo)', color: 'var(--on-indigo)' }}
        >
          Continue with Google
        </button>

        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1" style={{ backgroundColor: 'var(--line)' }} />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>or</span>
          <span className="h-px flex-1" style={{ backgroundColor: 'var(--line)' }} />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <Field
            id="email"
            label="Email"
            type="email"
            value={email}
            autoComplete="email"
            onChange={setEmail}
          />
          <Field
            id="password"
            label="Password"
            type="password"
            value={password}
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            onChange={setPassword}
          />

          <button
            type="submit"
            disabled={busy || !email || password.length < 6}
            className="w-full rounded-[var(--radius-control)] py-2.5 text-sm font-medium disabled:opacity-40"
            style={{
              backgroundColor: 'var(--surface)',
              color: 'var(--text)',
              border: '1px solid var(--line)',
            }}
          >
            {mode === 'signIn' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        {error && (
          <p role="alert" className="mt-3 text-sm" style={{ color: 'var(--danger)' }}>
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}
          className="mt-5 text-sm underline underline-offset-4"
          style={{ color: 'var(--text-muted)' }}
        >
          {mode === 'signIn' ? 'Create an account instead' : 'I already have an account'}
        </button>
      </div>
    </div>
  );
}

interface FieldProps {
  id: string;
  label: string;
  type: string;
  value: string;
  autoComplete: string;
  onChange: (value: string) => void;
}

function Field({ id, label, type, value, autoComplete, onChange }: FieldProps): JSX.Element {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs" style={{ color: 'var(--text-muted)' }}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-[var(--radius-control)] px-3 py-2 text-sm outline-none"
        style={{
          backgroundColor: 'var(--surface-sunk)',
          color: 'var(--text)',
          border: '1px solid var(--line)',
        }}
      />
    </div>
  );
}

/** Firebase codes are not user-facing copy. Translate the ones people hit. */
function readableAuthError(error: unknown): string {
  const code = (error as AuthError)?.code ?? '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'That email and password do not match an account.';
    case 'auth/email-already-in-use':
      return 'An account already exists for that email. Sign in instead.';
    case 'auth/weak-password':
      return 'Use a password of at least six characters.';
    case 'auth/popup-closed-by-user':
      return 'The Google window closed before sign-in finished.';
    case 'auth/network-request-failed':
      return 'No connection. Check your network and try again.';
    default:
      return 'Sign-in failed. Try again in a moment.';
  }
}
