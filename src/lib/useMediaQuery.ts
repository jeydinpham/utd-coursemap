import { useEffect, useState } from 'react';

/** Tracks a CSS media query, e.g. useMediaQuery('(max-width: 760px)'). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** Phones (either way up) and narrow windows get the bottom-sheet layout. */
export const MOBILE_QUERY = '(max-width: 760px), (max-height: 520px) and (pointer: coarse)';
