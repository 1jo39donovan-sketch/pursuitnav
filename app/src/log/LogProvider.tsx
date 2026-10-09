import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { store } from "../storage/store";
import type { LogEntry, LoggedRoute } from "../storage/types";

interface LogContextValue {
  entries: LogEntry[];
  /** Records a picked destination; returns its id for adding the route later. */
  record: (entry: Omit<LogEntry, "id" | "route" | "at">) => number;
  setRoute: (id: number, route: LoggedRoute) => void;
  clear: () => void;
}

const LogContext = createContext<LogContextValue | null>(null);

/** Every search and the route picked, kept on the phone until the officer clears it. */
export function LogProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<LogEntry[]>(() => store.listLog());

  const record = useCallback((entry: Omit<LogEntry, "id" | "route" | "at">) => {
    const saved = store.addLogEntry({ ...entry, at: new Date().toISOString() });
    setEntries(store.listLog());
    return saved.id;
  }, []);

  const setRoute = useCallback((id: number, route: LoggedRoute) => {
    store.setLogRoute(id, route);
    setEntries(store.listLog());
  }, []);

  const clear = useCallback(() => {
    store.clearLog();
    setEntries([]);
  }, []);

  const value = useMemo(() => ({ entries, record, setRoute, clear }), [entries, record, setRoute, clear]);
  return <LogContext.Provider value={value}>{children}</LogContext.Provider>;
}

export function useLog(): LogContextValue {
  const ctx = useContext(LogContext);
  if (!ctx) throw new Error("useLog must be used inside LogProvider");
  return ctx;
}
