import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ThemeContext, type Theme, type ThemeContextValue } from './theme-context';

const STORAGE_KEY = 'hrms-theme';

function getInitialTheme(): Theme {
  return window.localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => setThemeState(next), []);
  const toggleTheme = useCallback(
    () => setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark')),
    []
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, toggleTheme, setTheme }),
    [theme, toggleTheme, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
