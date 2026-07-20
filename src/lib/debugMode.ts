/**
 * Debug mode has to work on the deployed GitHub Pages build too (there's no
 * way to attach a console on iPhone), so it can't depend on
 * import.meta.env.DEV — it's a URL query param instead: ?debug=1. Off by
 * default, so a normal user never sees it just by using the app normally.
 */
export const isDebugModeEnabled = (): boolean => {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('debug') === '1';
};
