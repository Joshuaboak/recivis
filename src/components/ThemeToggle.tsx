'use client';

/**
 * ThemeToggle — flips between the CSA light system and the derived dark theme.
 *
 * Deliberately holds no React state. The current theme already lives in the
 * `data-theme` attribute on <html> (set before first paint by ThemeScript), so
 * mirroring it into state would mean reading the DOM in an effect and calling
 * setState — which cascades a render and, on the server, has nothing to read. Both
 * icons are rendered instead and CSS picks the right one off the ancestor attribute.
 * That also means the correct icon is present in the server HTML, so there is no
 * flip on hydration.
 *
 * Two-state, not three: there is no explicit "system" position. Until the user
 * touches this, the OS preference is already being followed, so a third state would
 * only let them re-choose what they already have. Once they pick, the choice persists
 * and stops tracking the OS — which is what picking means.
 */

import { useEffect } from 'react';
import { Moon, Sun } from 'lucide-react';
import { THEME_STORAGE_KEY } from './ThemeScript';

function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme;
}

export default function ThemeToggle({ className = '' }: { className?: string }) {
  // Keep following the OS until the user has made an explicit choice. No state is
  // set here — the attribute change is what re-renders the icon, via CSS.
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => {
      try {
        if (localStorage.getItem(THEME_STORAGE_KEY)) return;
      } catch { /* storage unavailable — carry on following the OS */ }
      applyTheme(e.matches ? 'dark' : 'light');
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const toggle = () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch { /* private browsing — the theme still applies for this session */ }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Switch colour theme"
      title="Switch colour theme"
      className={`w-9 h-9 flex items-center justify-center rounded-md text-text-muted bg-surface-raised border border-border-subtle hover:text-csa-accent hover:border-csa-accent transition-colors duration-[120ms] ${className}`}
    >
      {/* Both rendered; `theme-when-*` in globals.css shows one. Offering the action
          the user can take: in light mode the control shows the moon. */}
      <Moon size={16} strokeWidth={2} className="theme-when-light" />
      <Sun size={16} strokeWidth={2} className="theme-when-dark" />
    </button>
  );
}
