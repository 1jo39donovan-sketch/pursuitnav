// Team messages: an office colleague (or anyone in the team) sends a place to
// go, a caution, or a short note to one callsign or the whole team. Sealed on
// the sender's phone with the team key, like positions; the server can't read
// them, keeps them in memory only and deletes them after 12 hours at most.
// Everyone holding the team code can read a team message: "to" only decides
// whose screen it pops up on. Pure, so it can be tested.

export type MessageKind = "go" | "caution" | "note";

export const MESSAGE_KINDS: { id: MessageKind; label: string; needsPlace: boolean }[] = [
  { id: "go", label: "Go here", needsPlace: true },
  { id: "caution", label: "Caution here", needsPlace: true },
  { id: "note", label: "Note", needsPlace: false },
];

/** How long a message is kept: the most the server allows. */
export const MESSAGE_KEEP_MS = 12 * 3600_000;
/** Longest note. */
export const MAX_TEXT = 280;
/** A caution is said again when the crew comes within this of it. */
export const CAUTION_NEAR_M = 150;

export interface MessagePlace {
  lat: number;
  lng: number;
  label: string;
}

/** What's sealed. */
export interface MessageBody {
  v: 1;
  kind: MessageKind;
  /** Sender's callsign. */
  cs: string;
  /** Who it's for: a member ID, or null for everyone. */
  to: string | null;
  /** Their callsign, to show the sender who it went to. */
  toCs?: string;
  text: string;
  place?: MessagePlace;
}

export interface TeamMessage extends MessageBody {
  id: string;
  from: string;
  /** Server times, ms since 1970. */
  at: number;
  expiresAt: number;
  /** Sent from this phone. */
  mine: boolean;
}

export interface SealedMessage {
  id: string;
  from: string;
  blob: string;
  at: number;
  expiresAt: number;
}

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/**
 * A message as this phone shows it, or null when it can't be read, has run
 * out, or is for someone else (it was sent to another callsign).
 */
export function toMessage(m: SealedMessage, raw: unknown, me: string, now: number): TeamMessage | null {
  const b = raw as Partial<MessageBody> | null;
  if (!b || b.v !== 1 || !MESSAGE_KINDS.some((k) => k.id === b.kind) || m.expiresAt <= now) return null;
  const mine = m.from === me;
  if (!mine && b.to != null && b.to !== me) return null;
  const p = b.place;
  const place =
    p && finite(p.lat) && finite(p.lng) ? { lat: p.lat, lng: p.lng, label: String(p.label ?? "").slice(0, 120) } : undefined;
  if (MESSAGE_KINDS.find((k) => k.id === b.kind)!.needsPlace && !place) return null;
  return {
    v: 1,
    kind: b.kind!,
    cs: String(b.cs ?? "").slice(0, 20) || "No callsign",
    to: typeof b.to === "string" ? b.to : null,
    toCs: typeof b.toCs === "string" ? b.toCs.slice(0, 20) : undefined,
    text: String(b.text ?? "").slice(0, MAX_TEXT),
    place,
    id: m.id,
    from: m.from,
    at: m.at,
    expiresAt: m.expiresAt,
    mine,
  };
}

/** What's spoken when a message arrives: short, never the whole note at length. */
export function spokenArrival(m: TeamMessage): string {
  const what = m.kind === "go" ? "Go to" : m.kind === "caution" ? "Caution at" : "Note";
  const where = m.place ? ` ${m.place.label}` : "";
  const note = m.text ? `${m.kind === "note" ? ": " : ". "}${m.text.slice(0, 120)}` : "";
  return `Team message from ${m.cs}. ${what}${where}${note}`.replace(/\s+/g, " ").trim();
}

function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = (b.lat - a.lat) * 111_320;
  const dLng = (b.lng - a.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

/** Cautions from colleagues within CAUTION_NEAR_M of here. */
export function cautionsNear(messages: readonly TeamMessage[], here: { lat: number; lng: number }): TeamMessage[] {
  return messages.filter((m) => m.kind === "caution" && !m.mine && m.place && metres(here, m.place) <= CAUTION_NEAR_M);
}
