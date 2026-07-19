// Named themes. Sets a `data-theme` attribute on <html> which swaps the
// structural CSS tokens in index.css. "default" is the base (no attribute).
// Persists the choice per machine. Migrates the old light/dark values.
import { useCallback, useEffect, useState } from 'react';

export type Theme = 'default' | 'admiralty' | 'console';

export const THEMES: { value: Theme; label: string; hint: string }[] = [
  { value: 'default', label: 'Harbor', hint: 'Sea-mist light · navy ink' },
  { value: 'admiralty', label: 'Admiralty Chart', hint: 'Warm parchment & ink' },
  { value: 'console', label: 'Bridge Console', hint: 'Dark navy & phosphor' },
];

const KEY = 'vst_theme';

function initialTheme(): Theme {
  try {
    const s = localStorage.getItem(KEY);
    if (s === 'default' || s === 'admiralty' || s === 'console') return s;
    if (s === 'dark') return 'console'; // migrate legacy light/dark toggle
    if (s === 'light') return 'default';
  } catch {
    /* ignore */
  }
  return 'default';
}

function apply(theme: Theme): void {
  const el = document.documentElement;
  if (theme === 'default') el.removeAttribute('data-theme');
  else el.setAttribute('data-theme', theme);
  // Keep the browser chrome (theme-color) in step with the page background.
  const bg = getComputedStyle(el).getPropertyValue('--color-bg').trim();
  if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  useEffect(() => {
    apply(theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);

  return { theme, setTheme };
}
