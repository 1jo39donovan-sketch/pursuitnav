// Keeps copies of the server's data files on the phone (places, named
// roads), so search works with no signal, and checks for weekly updates.
import { File, Paths } from "expo-file-system";

import { serverRequest } from "../api/http";
import { API_URL } from "../config";
import { store } from "../storage/store";

export type DataKind = "places" | "roads";

const CHECK_EVERY_MS = 12 * 60 * 60 * 1000;
const cached = (kind: DataKind) => new File(Paths.document, `${kind}.txt`);

/** The file kept from last time, or null on first run. */
export async function loadCached(kind: DataKind): Promise<string | null> {
  const file = cached(kind);
  return file.exists ? file.text() : null;
}

/**
 * Fetches a newer file if the server has one. Returns its text, or null when
 * there's nothing new (or no signal; the cached copy stays).
 */
export async function fetchNewer(kind: DataKind, force = false): Promise<string | null> {
  if (!API_URL) return null;
  const lastCheck = Number(store.getSetting(`${kind}CheckedAt`) ?? 0);
  const haveCopy = cached(kind).exists;
  if (!force && haveCopy && Date.now() - lastCheck < CHECK_EVERY_MS) return null;
  try {
    const etag = haveCopy ? store.getSetting(`${kind}Etag`) : null;
    // 8 s for the server to start answering; the file itself may take longer on a slow link.
    const res = await serverRequest(
      `${API_URL}/v1/${kind}-data`,
      { headers: etag ? { "if-none-match": etag } : {} },
      async (r) => r,
    );
    store.setSetting(`${kind}CheckedAt`, String(Date.now()));
    if (res.status !== 200) return null;
    const text = await res.text();
    if (!text.startsWith(`#blueroute-${kind}`)) return null;
    cached(kind).write(text);
    const newEtag = res.headers.get("etag");
    if (newEtag) store.setSetting(`${kind}Etag`, newEtag);
    return text;
  } catch {
    return null;
  }
}
