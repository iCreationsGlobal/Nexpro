import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const OnlineStoreChromeContext = createContext({ store: null, setStore: () => {} });

/**
 * Remembers the store being browsed, so the bottom bar stays put while pages load.
 * The phone header on each page reports its store here.
 */
export const OnlineStoreChromeProvider = ({ children }) => {
  const [store, setStoreState] = useState(null);

  const setStore = useCallback((next) => {
    if (!next?.slug) return;
    setStoreState((current) => {
      if (current?.slug !== next.slug) return next;
      // Payloads differ per page: keep what an earlier page knew and this one does not say.
      const known = Object.entries(next).filter(([, value]) => value !== undefined);
      return known.some(([key, value]) => current[key] !== value)
        ? { ...current, ...Object.fromEntries(known) }
        : current;
    });
  }, []);

  const value = useMemo(() => ({ store, setStore }), [setStore, store]);

  return (
    <OnlineStoreChromeContext.Provider value={value}>
      {children}
    </OnlineStoreChromeContext.Provider>
  );
};

export const useOnlineStoreChrome = () => useContext(OnlineStoreChromeContext);
