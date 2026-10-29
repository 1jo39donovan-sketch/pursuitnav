// Speaking directions: the best British voice the phone has (free, works
// offline), at the crew's chosen speed, one prompt at a time. A new prompt
// no longer cuts off the one being said ("Re-routing. Drive nor… turn
// right." in the 29 Oct trial): routine prompts wait their turn, and only a
// "turn now" or arrival may interrupt.
import * as Speech from "expo-speech";

import { store } from "../storage/store";
import { pronounced } from "./spokenText";

export interface VoiceOption {
  id: string;
  name: string;
  language: string;
  /** Higher is better: premium and enhanced voices first. */
  score: number;
}

/** How natural a voice is likely to sound, from what the phone says about it. */
function scoreOf(v: { identifier: string; name: string; quality?: string; language: string }): number {
  const id = `${v.identifier} ${v.name}`.toLowerCase();
  let s = 0;
  if (/premium/.test(id)) s += 40;
  if (/enhanced/.test(id) || v.quality === "Enhanced") s += 30;
  // Android's Google voices (and Chrome's "Google UK English") sound far better than the old engines.
  if (/google/.test(id)) s += 20;
  if (/network/.test(id)) s -= 5; // needs signal
  // Apple's novelty voices aren't for directions.
  if (
    /eloquence|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|grandma|grandpa|rocko|shelley|reed|sandy|flo/.test(
      id,
    )
  )
    s -= 100;
  if (/^en[-_]gb/i.test(v.language)) s += 10;
  return s;
}

/** British English voices on the phone, best first (other English as a fallback when there are none). */
export function rankVoices(
  voices: readonly { identifier: string; name: string; quality?: string; language: string }[],
): VoiceOption[] {
  const gb = voices.filter((v) => /^en[-_]gb/i.test(v.language));
  const pool = gb.length ? gb : voices.filter((v) => /^en/i.test(v.language));
  return pool
    .map((v) => ({ id: v.identifier, name: cleanName(v.name), language: v.language, score: scoreOf(v) }))
    .filter((v) => v.score > -50)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

/** "Serena (Enhanced)" stays; "com.apple.voice.compact.en-GB.Daniel" becomes "Daniel". */
function cleanName(name: string): string {
  const tail = name.split(".").pop() ?? name;
  return /\s/.test(name) || !name.includes(".") ? name : tail;
}

export type VoiceRate = "normal" | "faster";
export const RATES: Record<VoiceRate, number> = { normal: 1, faster: 1.15 };

export function voiceSettings(): { voiceId: string | null; rate: VoiceRate } {
  return {
    voiceId: store.getSetting("voiceId") || null,
    rate: store.getSetting("voiceRate") === "faster" ? "faster" : "normal",
  };
}

export function setVoiceSettings(s: { voiceId?: string | null; rate?: VoiceRate }) {
  if (s.voiceId !== undefined) store.setSetting("voiceId", s.voiceId ?? "");
  if (s.rate) store.setSetting("voiceRate", s.rate);
  best = null;
}

// The voice to use: the crew's choice if the phone still has it, else the best there is.
let best: Promise<string | undefined> | null = null;
function voiceToUse(): Promise<string | undefined> {
  best ??= Speech.getAvailableVoicesAsync()
    .then((voices) => {
      const ranked = rankVoices(voices);
      const chosen = voiceSettings().voiceId;
      return ranked.find((v) => v.id === chosen)?.id ?? ranked[0]?.id;
    })
    .catch(() => undefined);
  return best;
}

export function availableVoices(): Promise<VoiceOption[]> {
  return Speech.getAvailableVoicesAsync()
    .then(rankVoices)
    .catch(() => []);
}

/** A queued prompt older than this is dropped: it's about a place already passed. */
const STALE_MS = 6000;

interface Queued {
  text: string;
  at: number;
}

let speaking = false;
let queue: Queued[] = [];

async function sayNow(text: string) {
  speaking = true;
  const voice = await voiceToUse();
  const done = () => {
    speaking = false;
    next();
  };
  Speech.speak(pronounced(text), {
    language: "en-GB",
    voice,
    rate: RATES[voiceSettings().rate],
    // iOS: its own audio session, so music or a radio app is lowered, not stopped.
    useApplicationAudioSession: false,
    onDone: done,
    onStopped: () => {
      speaking = false;
    },
    onError: done,
  });
}

function next() {
  const now = Date.now();
  queue = queue.filter((q) => now - q.at <= STALE_MS);
  const item = queue.shift();
  if (item) void sayNow(item.text);
}

/**
 * Says a prompt. "urgent" (turn now, arrived) stops what's being said and
 * anything waiting; "normal" waits for the current prompt to finish.
 */
export function say(text: string, priority: "urgent" | "normal" = "normal") {
  if (priority === "urgent") {
    queue = [];
    void Speech.stop();
    speaking = false;
    void sayNow(text);
    return;
  }
  if (!speaking) {
    void sayNow(text);
    return;
  }
  // At most one waiting: a newer routine prompt replaces an older one.
  queue = [{ text, at: Date.now() }];
}

/** Silence now (muted, or navigation ended). */
export function hush() {
  queue = [];
  speaking = false;
  void Speech.stop();
}

/** Says a sample with the chosen voice and speed, for the Session picker. */
export function testVoice() {
  hush();
  void sayNow("In 200 yards, turn left onto Clapham Road. Then the second right, towards Southwark.");
}
