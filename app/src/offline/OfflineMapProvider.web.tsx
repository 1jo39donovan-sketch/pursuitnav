// The web version has no offline map: browsers can't keep a file this size
// reliably. Session says so ("Offline maps are in the phone app").
import { createContext, useContext, type ReactNode } from "react";

import type { OfflineMapValue } from "./OfflineMapProvider";

const NONE: OfflineMapValue = {
  supported: false,
  state: { status: "none", offer: null, checking: false },
  styles: null,
  allowMobile: false,
  setAllowMobile: () => {},
  check: () => {},
  download: () => {},
  cancel: () => {},
  remove: () => {},
};

const Context = createContext<OfflineMapValue>(NONE);

export function OfflineMapProvider({ children }: { children: ReactNode }) {
  return <Context.Provider value={NONE}>{children}</Context.Provider>;
}

export function useOfflineMap(): OfflineMapValue {
  return useContext(Context);
}
