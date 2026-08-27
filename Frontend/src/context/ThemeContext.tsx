import { useCallback, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { ThemeContext, type Theme, type ThemeContextValue } from './theme-context';

const STORAGE_KEY = 'hrms-theme';
const TRANSITION_MS = 550;
// Matches Tailwind's `md` breakpoint — the same cutoff Topbar/Sidebar already
// use to swap the toggle button from the desktop Topbar to the mobile drawer.
const MOBILE_BREAKPOINT_PX = 768;

function getInitialTheme(): Theme {
  return window.localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Reveal always starts from a fixed screen corner rather than the tapped
// button's own position — top-right on desktop, bottom-right on mobile
// (where the toggle lives at the bottom of the Sidebar drawer).
function getRevealOrigin(): { x: number; y: number } {
  const isMobile = window.innerWidth < MOBILE_BREAKPOINT_PX;
  return { x: window.innerWidth, y: isMobile ? window.innerHeight : 0 };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  // useLayoutEffect (not useEffect) so the `.dark` class flips synchronously
  // inside the flushSync below — the View Transition needs the "new" DOM
  // state committed before it snapshots it for the circular-reveal capture.
  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const applyTheme = useCallback((next: Theme) => {
    const root = document.documentElement;
    const startViewTransition = document.startViewTransition?.bind(document);

    if (!startViewTransition || prefersReducedMotion()) {
      setThemeState(next);
      return;
    }

    const { x, y } = getRevealOrigin();
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    const transition = startViewTransition(() => {
      flushSync(() => setThemeState(next));
    });

    transition.ready
      .then(() => {
        root.animate(
          {
            clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`],
          },
          {
            duration: TRANSITION_MS,
            easing: 'ease-in-out',
            pseudoElement: '::view-transition-new(root)',
          }
        );
      })
      .catch(() => {
        // Transition was skipped/interrupted (e.g. rapid double-toggle) — the
        // state update above already applied, so there's nothing to recover.
      });
  }, []);

  const setTheme = useCallback((next: Theme) => applyTheme(next), [applyTheme]);
  const toggleTheme = useCallback(
    () => applyTheme(theme === 'dark' ? 'light' : 'dark'),
    [theme, applyTheme]
  );

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, toggleTheme, setTheme }),
    [theme, toggleTheme, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
