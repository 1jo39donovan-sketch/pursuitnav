// Team codes and end-to-end encryption for team sessions.
//
// A team code is 120 random bits, written in 24 letters and digits. Everything
// else comes from it: the team's ID on the server (a hash, so the server can't
// work back to the code) and the key every member's share is sealed with
// (XChaCha20-Poly1305). The server only ever sees the ID and sealed blobs.
import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { bytesToUtf8 } from "@noble/ciphers/utils.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes, utf8ToBytes } from "@noble/hashes/utils.js";

/** Random bytes from the platform (expo-crypto on the phone). */
export type RandomBytes = (n: number) => Uint8Array;

// Crockford's base 32: no I, L, O or U, so a code read out can't be misheard as another.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_BYTES = 15;
const CODE_CHARS = 24;

export function newTeamCode(random: RandomBytes): string {
  return formatCode(toBase32(random(CODE_BYTES)));
}

/** "ABCD-EFGH-…": groups of four, for reading out or typing. */
export function formatCode(code: string): string {
  return (code.match(/.{1,4}/g) ?? []).join("-");
}

/** The code as typed, tidied (spaces, dashes, case, O for 0); null if it isn't a team code. */
export function normaliseCode(typed: string): string | null {
  const s = typed
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (s.length !== CODE_CHARS || [...s].some((c) => !ALPHABET.includes(c))) return null;
  return s;
}

/** The team code in pasted text (a whole shared message, say); null if there isn't one. */
export function codeIn(text: string): string | null {
  const whole = normaliseCode(text);
  if (whole) return whole;
  for (const m of text.matchAll(/[0-9A-Za-z]{4}(?:[-\s]?[0-9A-Za-z]{4}){5}/g)) {
    const code = normaliseCode(m[0]);
    if (code) return code;
  }
  return null;
}

export interface TeamKeys {
  /** What the server files the team under. */
  teamId: string;
  key: Uint8Array;
}

export function teamKeys(code: string): TeamKeys {
  const bytes = utf8ToBytes(normaliseCode(code) ?? "");
  return {
    teamId: bytesToHex(sha256(concatBytes(utf8ToBytes("blueroute team id:"), bytes))).slice(0, 32),
    key: sha256(concatBytes(utf8ToBytes("blueroute team key:"), bytes)),
  };
}

export const randomHex = (random: RandomBytes, bytes: number) => bytesToHex(random(bytes));

export function seal(key: Uint8Array, value: unknown, random: RandomBytes): string {
  const nonce = random(24);
  const sealed = xchacha20poly1305(key, nonce).encrypt(utf8ToBytes(JSON.stringify(value)));
  return toBase64(concatBytes(nonce, sealed));
}

/** The sealed value, or null if it wasn't sealed with this key or has been tampered with. */
export function open(key: Uint8Array, blob: string): unknown {
  try {
    const bytes = fromBase64(blob);
    const plain = xchacha20poly1305(key, bytes.slice(0, 24)).decrypt(bytes.slice(24));
    return JSON.parse(bytesToUtf8(plain));
  } catch {
    return null;
  }
}

function toBase32(bytes: Uint8Array): string {
  let out = "";
  let bits = 0;
  let value = 0;
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
