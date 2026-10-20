// Learned road times wait on the phone and go to the server in batches, hours
// after the drive and shuffled together, so a batch can't be tied to a person
// or an incident. Nothing here is sent unless the officer turned learning on.
import { serverJson } from "../api/http";
import { API_URL } from "../config";
import { store } from "../storage/store";
import type { Sample } from "./timing";

interface Batch {
  /** When the drive's times were queued, ms since 1970. Never sent. */
  at: number;
  samples: Sample[];
}

const KEY = "learnQueue";
export const SEND_AFTER_MS = 6 * 3600_000;
// Fewer than this waiting: hold on for more, so one drive isn't sent alone.
const MIN_TO_SEND = 30;
const MAX_KEPT = 5000;

function read(): Batch[] {
  try {
    const parsed = JSON.parse(store.getSetting(KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? (parsed as Batch[]) : [];
  } catch {
    return [];
  }
}

const write = (batches: Batch[]) => store.setSetting(KEY, JSON.stringify(batches));

/** Keeps a drive's road times to send later (oldest dropped past the cap). */
export function queueSamples(samples: Sample[], now = Date.now()) {
  if (!samples.length) return;
  const batches = [...read(), { at: now, samples }];
  while (batches.reduce((n, b) => n + b.samples.length, 0) > MAX_KEPT && batches.length > 1) batches.shift();
  write(batches);
}

/** Deletes everything waiting (learning switched off). */
export function clearQueue() {
  write([]);
}

/** The batches old enough to send, shuffled together, and the rest. */
export function due(batches: Batch[], now: number, random = Math.random): { send: Sample[]; keep: Batch[] } {
  const old = batches.filter((b) => now - b.at >= SEND_AFTER_MS);
  const send = old.flatMap((b) => b.samples);
  if (send.length < MIN_TO_SEND) return { send: [], keep: batches };
  for (let i = send.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [send[i], send[j]] = [send[j]!, send[i]!];
  }
  return { send, keep: batches.filter((b) => now - b.at < SEND_AFTER_MS) };
}

/** Sends what's due. Keeps it for next time if the server can't be reached. */
export async function uploadDue(now = Date.now()) {
  if (!API_URL) return;
  const { send, keep } = due(read(), now);
  if (!send.length) return;
  try {
    const res = await serverJson(`${API_URL}/v1/learn`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ segments: send }),
    });
    // 404: learning switched off on the server. Drop it rather than keep it forever.
    if (res.ok || res.status === 404 || res.status === 400) write(keep);
  } catch {
    // No signal: try again later.
  }
}

/** Whether the server accepts learning uploads (it's switched off until the privacy steps are done). */
export async function serverLearns(): Promise<boolean> {
  if (!API_URL) return false;
  try {
    const res = await serverJson<{ learning?: boolean }>(`${API_URL}/health`);
    return res.ok && res.body?.learning === true;
  } catch {
    return false;
  }
}
