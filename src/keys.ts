import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  nip19,
  type Event,
} from "nostr-tools";

const STORAGE = "kite.nsec";
const REMEMBER = "kite.remember";
const SIGNER = "kite.signer";

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function generateKey(): Uint8Array {
  return generateSecretKey();
}

export function decodeSecret(input: string): Uint8Array {
  const trimmed = input.trim();
  if (trimmed.startsWith("nsec1")) {
    const decoded = nip19.decode(trimmed);
    if (decoded.type !== "nsec") {
      throw new Error("That is not an nsec.");
    }
    return decoded.data;
  }
  if (/^[0-9a-f]{64}$/i.test(trimmed)) {
    return hexToBytes(trimmed);
  }
  throw new Error("Paste an nsec1… key or 64-character hex.");
}

export function npubFromSecret(secret: Uint8Array): string {
  return nip19.npubEncode(getPublicKey(secret));
}

export function npubFromHex(pubkeyHex: string): string {
  return nip19.npubEncode(pubkeyHex);
}

export function hexPubkey(secret: Uint8Array): string {
  return getPublicKey(secret);
}

export function shortNpub(npub: string): string {
  return `${npub.slice(0, 12)}…${npub.slice(-4)}`;
}

export function hasNip07(): boolean {
  return typeof window !== "undefined" && Boolean(window.nostr?.getPublicKey);
}

function store(remember: boolean): Storage {
  return remember ? localStorage : sessionStorage;
}

export function loadSecret(): Uint8Array | null {
  const raw = sessionStorage.getItem(STORAGE) ?? localStorage.getItem(STORAGE);
  if (!raw) return null;
  try {
    return decodeSecret(raw);
  } catch {
    sessionStorage.removeItem(STORAGE);
    localStorage.removeItem(STORAGE);
    return null;
  }
}

export function secretLivesOnDisk(): boolean {
  return Boolean(localStorage.getItem(STORAGE));
}

export function rememberPreferred(): boolean {
  return localStorage.getItem(REMEMBER) === "1" || secretLivesOnDisk();
}

export function saveSecret(secret: Uint8Array, remember: boolean): void {
  const encoded = nip19.nsecEncode(secret);
  sessionStorage.removeItem(STORAGE);
  localStorage.removeItem(STORAGE);
  store(remember).setItem(STORAGE, encoded);
  localStorage.setItem(REMEMBER, remember ? "1" : "0");
  localStorage.setItem(SIGNER, "nsec");
}

export function forgetSecret(): void {
  sessionStorage.removeItem(STORAGE);
  localStorage.removeItem(STORAGE);
  localStorage.removeItem(REMEMBER);
  localStorage.removeItem(SIGNER);
}

export function signerPref(): "none" | "nsec" | "nip07" {
  const value = localStorage.getItem(SIGNER);
  if (value === "nip07" || value === "nsec") return value;
  return loadSecret() ? "nsec" : "none";
}

export function preferNip07(): void {
  sessionStorage.removeItem(STORAGE);
  localStorage.removeItem(STORAGE);
  localStorage.removeItem(REMEMBER);
  localStorage.setItem(SIGNER, "nip07");
}

export function signNote(secret: Uint8Array, content: string) {
  return finalizeEvent(
    {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content,
    },
    secret,
  );
}

export async function signWithNip07(content: string): Promise<Event> {
  if (!window.nostr?.signEvent) {
    throw new Error("No NIP-07 signer is available.");
  }
  return window.nostr.signEvent({
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [],
    content,
  }) as Promise<Event>;
}

export type { Event };
