import { useEffect, useState } from "react";

import { fetchAddresses, type AddressLookup } from "../api/addresses";
import { parseQuery } from "./parse";

const DEBOUNCE_MS = 400;

export type LookupState = AddressLookup | { status: "idle" } | { status: "searching" };

/**
 * Asks the server for door-level addresses once typing pauses. Outward codes
 * ("N7") are left to the offline road list.
 */
export function useAddressLookup(query: string, enabled: boolean): { query: string; state: LookupState } {
  const [result, setResult] = useState<{ query: string; state: LookupState }>({ query: "", state: { status: "idle" } });
  const q = query.trim();
  const wanted = enabled && q.length >= 3 && !parseQuery(q).outwardCode;

  useEffect(() => {
    if (!wanted) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setResult({ query: q, state: { status: "searching" } });
      fetchAddresses(q, controller.signal)
        .then((state) => setResult({ query: q, state }))
        .catch(() => {
          // aborted: a newer query replaced this one
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, wanted]);

  // A result for an older query doesn't belong to what's typed now.
  return wanted && result.query === q ? result : { query: q, state: { status: "idle" } };
}
