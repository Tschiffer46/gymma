// React- och expo-sidan av datalagret. All faktisk SQL ligger i core.ts och
// queries.ts, som medvetet är fria från expo-/react-importer så de kan
// verifieras i Node (scripts/verify-db.mjs).

import { createContext, createElement, useContext, useEffect, useState, type ReactNode } from "react";
import * as SQLite from "expo-sqlite";
import * as Crypto from "expo-crypto";
import { DB_NAME, initStore, type SqlDb, type Store } from "./core";

export * from "./core";
export * from "./queries";
export * from "./types";

type DbState = { store: Store | null; error: Error | null };

const DbContext = createContext<DbState>({ store: null, error: null });

/**
 * Öppnar databasen, kör migrationer och seed en gång vid appstart.
 * Resten av appen ligger bakom laddningsgrinden i app/_layout.tsx.
 */
export function DbProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DbState>({ store: null, error: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const store: Store = {
          db: SQLite.openDatabaseSync(DB_NAME) as SqlDb,
          uuid: () => Crypto.randomUUID(),
          now: () => new Date().toISOString(),
        };
        await initStore(store);
        if (!cancelled) setState({ store, error: null });
      } catch (e) {
        if (!cancelled) setState({ store: null, error: e as Error });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return createElement(DbContext.Provider, { value: state }, children);
}

export function useDbState(): DbState {
  return useContext(DbContext);
}

/**
 * Datalagret inuti appen. Får bara anropas under laddningsgrinden, dvs. när
 * databasen garanterat är öppen och migrerad.
 */
export function useStore(): Store {
  const { store } = useContext(DbContext);
  if (!store) throw new Error("useStore() anropad utanför DbProvider eller före init");
  return store;
}
