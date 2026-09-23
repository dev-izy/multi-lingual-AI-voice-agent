import { LANGUAGES, LANGUAGE_META, type LanguageCode } from '../../types';

interface LanguageSwitcherProps {
  value: LanguageCode;
  disabled: boolean;
  onChange: (language: LanguageCode) => void;
}

/**
 * A two-option segmented control rather than a select: with only two
 * languages, both should be visible and one tap away. Each option is
 * labelled with its endonym and tagged with `lang` so the browser picks
 * the right font fallback for "Yorùbá".
 */
export function LanguageSwitcher({
  value,
  disabled,
  onChange,
}: LanguageSwitcherProps): JSX.Element {
  return (
    <div
      role="radiogroup"
      aria-label="Language"
      className="inline-flex rounded-[var(--radius-control)] p-0.5"
      style={{ backgroundColor: 'var(--surface-sunk)' }}
    >
      {LANGUAGES.map((code) => {
        const selected = code === value;
        return (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={selected}
            lang={code}
            disabled={disabled}
            onClick={() => onChange(code)}
            className="rounded-[calc(var(--radius-control)-2px)] px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={
              selected
                ? { backgroundColor: 'var(--indigo)', color: 'var(--on-indigo)' }
                : { color: 'var(--text-muted)' }
            }
          >
            {LANGUAGE_META[code].endonym}
          </button>
        );
      })}
    </div>
  );
}
