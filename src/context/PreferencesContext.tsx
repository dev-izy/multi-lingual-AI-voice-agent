import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

import { auth, userRef } from '../lib/firebase';
import {
  DEFAULT_LANGUAGE,
  DEFAULT_USER_SETTINGS,
  LANGUAGE_META,
  isLanguageCode,
  type LanguageCode,
  type SpeechLocale,
  type ThemePreference,
  type UserDoc,
  type UserSettings,
} from '../types';

interface PreferencesValue {
  user: User | null;
  /** Null until the first auth callback resolves. */
  loading: boolean;
  language: LanguageCode;
  locale: SpeechLocale;
  settings: UserSettings;
  /** Resolved theme after 'system' is evaluated. */
  resolvedTheme: 'light' | 'dark';
  setLanguage: (language: LanguageCode) => Promise<void>;
  setTheme: (theme: ThemePreference) => Promise<void>;
  updateSettings: (patch: Partial<UserSettings>) => Promise<void>;
}

const PreferencesContext = createContext<PreferencesValue | null>(null);

/** Optimistic local value so the UI never waits on a round trip to toggle. */
const LOCAL_LANGUAGE_KEY = 'ohun.language';

function readLocalLanguage(): LanguageCode {
  const stored = localStorage.getItem(LOCAL_LANGUAGE_KEY);
  return isLanguageCode(stored) ? stored : DEFAULT_LANGUAGE;
}

export function PreferencesProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [language, setLanguageState] = useState<LanguageCode>(readLocalLanguage);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (event: MediaQueryListEvent): void => setSystemDark(event.matches);
    query.addEventListener('change', handler);
    return () => query.removeEventListener('change', handler);
  }, []);

  useEffect(
    () =>
      onAuthStateChanged(auth, (nextUser) => {
        setUser(nextUser);
        setLoading(false);
      }),
    [],
  );

  // Create the profile on first sign-in, then follow it live so preferences
  // stay in step across a user's open tabs and devices.
  useEffect(() => {
    if (!user) return;

    const ref = userRef(user.uid);
    const unsubscribe = onSnapshot(ref, (snapshot) => {
      const data = snapshot.data();
      if (!data) {
        const seed = {
          id: user.uid,
          displayName: user.displayName,
          email: user.email,
          photoURL: user.photoURL,
          preferredLanguage: readLocalLanguage(),
          settings: DEFAULT_USER_SETTINGS,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        } as unknown as UserDoc;
        void setDoc(ref, seed);
        return;
      }
      setLanguageState(data.preferredLanguage);
      setSettings({ ...DEFAULT_USER_SETTINGS, ...data.settings });
    });

    return unsubscribe;
  }, [user]);

  const persist = useCallback(
    async (patch: Record<string, unknown>): Promise<void> => {
      if (!user) return;
      await updateDoc(userRef(user.uid), { ...patch, updatedAt: serverTimestamp() });
    },
    [user],
  );

  const setLanguage = useCallback(
    async (next: LanguageCode): Promise<void> => {
      setLanguageState(next);
      localStorage.setItem(LOCAL_LANGUAGE_KEY, next);
      const locale = LANGUAGE_META[next].defaultLocale;
      setSettings((current) => ({ ...current, preferredLocale: locale }));
      await persist({ preferredLanguage: next, 'settings.preferredLocale': locale });
    },
    [persist],
  );

  const setTheme = useCallback(
    async (theme: ThemePreference): Promise<void> => {
      setSettings((current) => ({ ...current, theme }));
      await persist({ 'settings.theme': theme });
    },
    [persist],
  );

  const updateSettings = useCallback(
    async (patch: Partial<UserSettings>): Promise<void> => {
      setSettings((current) => ({ ...current, ...patch }));
      const flattened = Object.fromEntries(
        Object.entries(patch).map(([key, value]) => [`settings.${key}`, value]),
      );
      await persist(flattened);
    },
    [persist],
  );

  const resolvedTheme: 'light' | 'dark' =
    settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
    document.documentElement.lang = language;
  }, [resolvedTheme, language]);

  // The stored locale may belong to the other language after a toggle race.
  const locale: SpeechLocale = LANGUAGE_META[language].locales.includes(settings.preferredLocale)
    ? settings.preferredLocale
    : LANGUAGE_META[language].defaultLocale;

  const value = useMemo<PreferencesValue>(
    () => ({
      user,
      loading,
      language,
      locale,
      settings,
      resolvedTheme,
      setLanguage,
      setTheme,
      updateSettings,
    }),
    [user, loading, language, locale, settings, resolvedTheme, setLanguage, setTheme, updateSettings],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesValue {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences must be used inside a PreferencesProvider.');
  }
  return context;
}
