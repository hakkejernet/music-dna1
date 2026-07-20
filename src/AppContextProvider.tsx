import { createContext, useContext, useRef, type ReactNode } from 'react';
import { buildAppContext, type AppContext } from './modules/infrastructure';

const AppContextReactContext = createContext<AppContext | null>(null);

/**
 * The one place `buildAppContext()` (M11's Composition Root) is called
 * from React. Built exactly once per browser session via a `useRef`
 * seeded lazily on first render, then handed down through context —
 * this is what keeps the new architecture's in-memory repositories
 * (Sprint 1's known limitation: no persistent repository implementation
 * exists yet) alive across route navigation within the same session,
 * rather than resetting every time a route unmounts. A full page reload
 * still starts a fresh, empty in-memory graph — there is nothing this
 * provider can do about that without a persistence layer this sprint
 * deliberately did not build.
 *
 * Placed above the router in App.tsx (not inside DiscoveryPage) for
 * exactly this reason — DiscoveryPage unmounts when the user navigates
 * to /music-dna and back; this provider does not.
 */
export const AppContextProvider = ({ children }: { children: ReactNode }) => {
  const ref = useRef<AppContext | null>(null);
  if (ref.current === null) {
    ref.current = buildAppContext();
  }
  return <AppContextReactContext.Provider value={ref.current}>{children}</AppContextReactContext.Provider>;
};

export const useAppContext = (): AppContext => {
  const context = useContext(AppContextReactContext);
  if (context === null) {
    throw new Error('useAppContext() must be called within an AppContextProvider');
  }
  return context;
};
