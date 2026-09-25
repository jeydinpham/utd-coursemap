import { useEffect, useState } from 'react';

const query = () => window.matchMedia('(prefers-color-scheme: dark)');

export function useColorScheme(): 'light' | 'dark' {
  const [dark, setDark] = useState(() => query().matches);
  useEffect(() => {
    const mq = query();
    const onChange = () => setDark(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return dark ? 'dark' : 'light';
}
