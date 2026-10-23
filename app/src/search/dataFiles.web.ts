// Browser version: the files are kept in the browser's cache storage, so
// search (shops, stations, hospitals…) works as soon as the page opens, and
// with no signal or the server down; a newer file is fetched when there is one.
import { serverRequest } from "../api/http";
import { API_URL } from "../config";

export type DataKind = "places" | "roads";

const CACHE = "blueroute-data";
const urlFor = (kind: DataKind) => `${API_URL}/v1/${kind}-data`;

async function cache(): Promise<Cache | null> {
  try {
    return typeof caches === "undefined" ? null : await caches.open(CACHE);
  } catch {
    // Private browsing, or storage blocked: fetch each time, as before.
    return null;
  }
}

/** The copy kept in the browser from last time, or null. */
export async function loadCached(kind: DataKind): Promise<string | null> {
  if (!API_URL) return null;
  try {
    const hit = await (await cache())?.match(urlFor(kind));
    return hit ? await hit.text() : null;
  } catch {
    return null;
  }
}

/** A newer file if the server has one (or the first), kept for next time; null otherwise. */
export async function fetchNewer(kind: DataKind): Promise<string | null> {
  if (!API_URL) return null;
  const store = await cache();
  try {
    const kept = await store?.match(urlFor(kind));
    const etag = kept?.headers.get("etag");
    // 8 s for the server to start answering; the file itself may take longer on a slow link.
    const res = await serverRequest(urlFor(kind), { headers: etag ? { "if-none-match": etag } : {} }, async (r) => r);
    if (res.status === 304 || !res.ok) return null;
    const text = await res.text();
    if (!text.startsWith(`#blueroute-${kind}`)) return null;
    const newEtag = res.headers.get("etag");
    await store
      ?.put(urlFor(kind), new Response(text, { headers: newEtag ? { etag: newEtag } : {} }))
      .catch(() => {});
    return text;
  } catch {
    return null;
  }
}
