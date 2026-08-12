/**
 * ThemeScript — resolves the theme before first paint.
 *
 * This has to be a blocking inline script in <head>, not an effect. An effect runs
 * after hydration, which means the browser paints the default theme first and the
 * user sees a flash of the wrong one. Setting `data-theme` synchronously avoids that.
 *
 * Resolution order:
 *   1. an explicit stored choice (the user has used the toggle)
 *   2. the OS preference
 *   3. light — the CSA style guide's default
 *
 * Kept deliberately tiny and dependency-free; it runs on every page load.
 */

export const THEME_STORAGE_KEY = 'recivis:theme';

const script = `
(function () {
  try {
    var stored = localStorage.getItem('${THEME_STORAGE_KEY}');
    var theme = stored === 'light' || stored === 'dark'
      ? stored
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
  }
})();
`;

export default function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
