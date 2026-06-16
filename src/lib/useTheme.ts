import { useEffect, useState } from 'react';
import { getPref, setPref } from './prefs';

export function useTheme() {
  const [dark, setDark] = useState(() => getPref('DARK_MODE') === 'true');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }, [dark]);

  // Apply on first render
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }, []);

  function toggleDark() {
    const next = !dark;
    setDark(next);
    setPref('DARK_MODE', String(next));
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
  }

  return { dark, toggleDark };
}
