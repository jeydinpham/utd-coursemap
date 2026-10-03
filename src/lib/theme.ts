import { useEffect, useState } from 'react';

// Dark is the default; light is opt-in and saved per browser (jeydinpham.com design system).
// index.html applies a saved "light" before first paint so there's no dark flash.
export type Theme = 'dark' | 'light';

export const currentTheme = (): Theme => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

export function setTheme(theme: Theme) {
  const apply = () => {
    if (theme === 'light') document.documentElement.dataset.theme = 'light';
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem('theme', theme);
    } catch {
      // Private windows can refuse storage; the theme still applies for this visit.
    }
    // JS-drawn art (the map's canvas basemap) listens for this to repaint in the new palette.
    window.dispatchEvent(new CustomEvent('site:theme', { detail: theme }));
  };

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || reduceMotion) {
    apply();
    return;
  }
  // Diagonal wipe. Wait two frames before the new snapshot so the map has repainted, but
  // never longer than 120 ms: background tabs pause animation frames, which would freeze the wipe.
  document.startViewTransition(() => {
    apply();
    return new Promise<void>((resolve) => {
      setTimeout(resolve, 120);
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
}

export function useTheme(): Theme {
  const [theme, setState] = useState(currentTheme);
  useEffect(() => {
    const onChange = () => setState(currentTheme());
    window.addEventListener('site:theme', onChange);
    return () => window.removeEventListener('site:theme', onChange);
  }, []);
  return theme;
}
