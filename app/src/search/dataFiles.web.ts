// Browser version: no file cache, just fetch the file when there's a server.
import { API_URL } from "../config";

export type DataKind = "places" | "roads";

export async function loadCached(_kind: DataKind): Promise<string | null> {
  return null;
}

export async function fetchNewer(kind: DataKind): Promise<string | null> {
  if (!API_URL) return null;
  try {
    const res = await fetch(`${API_URL}/v1/${kind}-data`);
    if (!res.ok) return null;
    const text = await res.text();
    return text.startsWith(`#blueroute-${kind}`) ? text : null;
  } catch {
    return null;
  }
}
