import type { Note, Profile, RelayState } from "./types";
import { hostOf, npubOf } from "./nostr";
import { shortNpub } from "./keys";

const flagsEl = document.querySelector<HTMLOListElement>("#flags")!;
const relaysEl = document.querySelector<HTMLUListElement>("#relays")!;
const statusEl = document.querySelector<HTMLParagraphElement>("#status")!;
const callsignEl = document.querySelector<HTMLElement>("#callsign")!;
const roleEl = document.querySelector<HTMLElement>("#role")!;
const npubEl = document.querySelector<HTMLElement>("#dialog-npub")!;
const releaseBtn = document.querySelector<HTMLButtonElement>("#release")!;

const profiles = new Map<string, Profile>();
const notes = new Map<string, Note>();
const relayState = new Map<string, RelayState>();

function tiltFor(id: string): string {
  const n = [...id].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const deg = ((n % 7) - 3) * 0.55;
  return `${deg.toFixed(2)}deg`;
}

function relativeTime(unix: number): string {
  const delta = Math.max(0, Date.now() / 1000 - unix);
  if (delta < 45) return "now";
  if (delta < 3600) return `${Math.floor(delta / 60)}m`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h`;
  return `${Math.floor(delta / 86400)}d`;
}

function displayName(pubkey: string): string {
  const profile = profiles.get(pubkey);
  const name = profile?.displayName || profile?.name;
  if (name) return name;
  return shortNpub(npubOf(pubkey));
}

function appendTextWithLinks(target: HTMLElement, content: string): void {
  const parts = content.split(/(https?:\/\/[^\s]+)/g);
  for (const part of parts) {
    if (/^https?:\/\//.test(part)) {
      const a = document.createElement("a");
      a.href = part;
      a.target = "_blank";
      a.rel = "noreferrer";
      a.textContent = part;
      target.append(a);
    } else {
      target.append(part);
    }
  }
}

function renderFlag(note: Note): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "flag";
  li.dataset.id = note.id;
  li.style.setProperty("--tilt", tiltFor(note.id));
  if (note.local) li.classList.add("local");

  const header = document.createElement("header");
  const who = document.createElement("span");
  who.className = "who";
  who.textContent = displayName(note.pubkey);
  const time = document.createElement("time");
  time.dateTime = new Date(note.createdAt * 1000).toISOString();
  time.textContent = relativeTime(note.createdAt);
  header.append(who, time);

  const body = document.createElement("p");
  if (note.reply) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = "reply";
    body.append(chip);
  }
  appendTextWithLinks(body, note.content);
  li.append(header, body);
  return li;
}

function sortNotes(): Note[] {
  return [...notes.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 48);
}

export function paintFlags(ownPubkey?: string): void {
  const snapshot = sortNotes();
  flagsEl.replaceChildren();
  for (const note of snapshot) {
    const el = renderFlag(note);
    if (ownPubkey && note.pubkey === ownPubkey) el.classList.add("own");
    flagsEl.append(el);
  }
}

export function upsertNote(note: Note, ownPubkey?: string): void {
  notes.set(note.id, note);
  paintFlags(ownPubkey);
}

export function clearSeeds(ownPubkey?: string): void {
  for (const [id, note] of notes) {
    if (note.local) notes.delete(id);
  }
  paintFlags(ownPubkey);
}

export function setProfile(pubkey: string, profile: Profile, ownPubkey?: string): void {
  profiles.set(pubkey, profile);
  paintFlags(ownPubkey);
}

export function knownPubkeys(): string[] {
  return [...new Set([...notes.values()].map((note) => note.pubkey))];
}

export function setRelays(state: RelayState): void {
  if (state.url) relayState.set(state.url, state);
  relaysEl.replaceChildren();
  for (const relay of relayState.values()) {
    const li = document.createElement("li");
    li.className = relay.live ? "live" : "dead";
    const name = document.createElement("span");
    name.className = "relay-name";
    name.textContent = hostOf(relay.url);
    const gust = document.createElement("div");
    gust.className = "gust";
    gust.append(document.createElement("span"));
    li.append(name, gust);
    relaysEl.append(li);
  }
}

export function setStatus(text: string): void {
  statusEl.textContent = text;
}

export function setIdentity(npub: string | null, canPost: boolean): void {
  callsignEl.textContent = npub ? shortNpub(npub) : "listening";
  roleEl.textContent = canPost ? "on the string" : "read-only";
  npubEl.textContent = npub ?? "none";
  releaseBtn.disabled = !canPost;
}

export const seedNotes: Note[] = [
  {
    id: "seed-1",
    pubkey: "0".repeat(64),
    createdAt: Math.floor(Date.now() / 1000) - 40,
    content: "Kite is a listening desk, not a feed. Notes clip to the string. Relays are weather.",
    reply: false,
    local: true,
  },
  {
    id: "seed-2",
    pubkey: "0".repeat(64),
    createdAt: Math.floor(Date.now() / 1000) - 20,
    content: "Your nsec stays on this machine. Omarchy paints the sky when you change themes.",
    reply: false,
    local: true,
  },
  {
    id: "seed-3",
    pubkey: "0".repeat(64),
    createdAt: Math.floor(Date.now() / 1000) - 5,
    content: "Click the kite to hold a string. Super+Shift+Alt+N lifts this window on Omarchy.",
    reply: false,
    local: true,
  },
];

profiles.set(seedNotes[0].pubkey, { name: "kite" });
