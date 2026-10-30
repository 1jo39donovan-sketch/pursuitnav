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
  const ranked = pool
    .map((v) => ({ id: v.identifier, name: cleanName(v.name), language: v.language, score: scoreOf(v) }))
    .filter((v) => v.score > -50)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  // Safari lists some voices twice ("Daniel", "Daniel"): keep the better of each name.
  const seen = new Set<string>();
  return ranked.filter((v) => !seen.has(v.name) && seen.add(v.name));
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
  best = undefined;
  looked = false;
  lookForVoice();
}

/**
 * The phone's voices, or [] if it doesn't say within a moment. expo-speech's
 * web version waits for Safari's "voices changed" event, which can never come
 * (or go to another caller): waiting on it once left the 30 Oct drives silent.
 */
function voicesSoon(): Promise<Speech.Voice[]> {
  return Promise.race([
    Speech.getAvailableVoicesAsync().catch(() => []),
    new Promise<Speech.Voice[]>((done) => setTimeout(() => done([]), VOICES_WAIT_MS)),
  ]);
}
const VOICES_WAIT_MS = 1500;

// The voice to use, once known: the crew's choice if the phone still has it,
// else the best there is. Speaking never waits for it; until it's known the
// phone's default voice speaks.
let best: string | undefined;
let looked = false;
function lookForVoice() {
  if (looked) return;
  looked = true;
  void voicesSoon().then((voices) => {
    const ranked = rankVoices(voices);
    const chosen = voiceSettings().voiceId;
    best = ranked.find((v) => v.id === chosen)?.id ?? ranked[0]?.id;
    // Nothing listed yet (Safari fills the list late): look again next time.
    if (!voices.length) looked = false;
  });
}

export function availableVoices(): Promise<VoiceOption[]> {
  return voicesSoon().then(rankVoices);
}

/** A queued prompt older than this is dropped: it's about a place already passed. */
const STALE_MS = 6000;

interface Queued {
  text: string;
  at: number;
}

let speaking = false;
let queue: Queued[] = [];
/** If the phone never says a prompt finished, carry on after this. */
const STUCK_MS = 12_000;
let stuck: ReturnType<typeof setTimeout> | undefined;

function sayNow(text: string) {
  lookForVoice();
  speaking = true;
  clearTimeout(stuck);
  const done = () => {
    clearTimeout(stuck);
    if (!speaking) return;
    speaking = false;
    next();
  };
  stuck = setTimeout(done, STUCK_MS);
  // Called straight away, not after waiting for anything: Safari only lets a
  // page speak promptly, and a prompt said late is about a junction passed.
  Speech.speak(pronounced(text), {
    language: "en-GB",
    voice: best,
    rate: RATES[voiceSettings().rate],
    // iOS: its own audio session, so music or a radio app is lowered, not stopped.
    useApplicationAudioSession: false,
    onDone: done,
    onStopped: () => {
      clearTimeout(stuck);
      speaking = false;
    },
    onError: done,
  });
}

function next() {
  const now = Date.now();
  queue = queue.filter((q) => now - q.at <= STALE_MS);
  const item = queue.shift();
  if (item) sayNow(item.text);
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
    sayNow(text);
    return;
  }
  if (!speaking) {
    sayNow(text);
    return;
  }
  // At most one waiting: a newer routine prompt replaces an older one.
  queue = [{ text, at: Date.now() }];
}

/** Silence now (muted, or navigation ended). */
export function hush() {
  queue = [];
  clearTimeout(stuck);
  speaking = false;
  void Speech.stop();
}

/** Says a sample with the chosen voice and speed, for the Session picker. */
export function testVoice() {
  hush();
  sayNow("In 200 yards, turn left onto Clapham Road. Then the second right, towards Southwark.");
}
