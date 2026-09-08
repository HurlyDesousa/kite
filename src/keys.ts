import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  nip19,
} from "nostr-tools";

const STORAGE = "kite.nsec";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

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

export function hexPubkey(secret: Uint8Array): string {
  return getPublicKey(secret);
}

export function shortNpub(npub: string): string {
  return `${npub.slice(0, 12)}…${npub.slice(-4)}`;
}

export function loadSecret(): Uint8Array | null {
  const raw = localStorage.getItem(STORAGE);
  if (!raw) return null;
  try {
    return decodeSecret(raw);
  } catch {
    localStorage.removeItem(STORAGE);
    return null;
  }
}

export function saveSecret(secret: Uint8Array): void {
  localStorage.setItem(STORAGE, nip19.nsecEncode(secret));
}

export function forgetSecret(): void {
  localStorage.removeItem(STORAGE);
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

export { bytesToHex };
