import { setTheme, useTheme } from '../lib/theme';

/** The site's switch: a sun in dark mode, a moon in light mode, drawn in CSS. */
export default function ThemeToggle() {
  const theme = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button className="theme-toggle" onClick={() => setTheme(next)} aria-label={`Switch to ${next} theme`} title={`Switch to ${next} theme`}>
      <span aria-hidden="true" className={theme === 'dark' ? 'sun' : 'moon'} />
    </button>
  );
}
