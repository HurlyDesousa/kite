import type { Note, Profile, RelayState, WindMode } from "./types";
import { hostOf, npubOf } from "./nostr";
import { nip19 } from "nostr-tools";
import { shortNpub } from "./keys";
import { barNotes, barNpub, queueBarState } from "./state";

const flagPort = document.querySelector<HTMLDivElement>("#flag-port")!;
const flagsEl = document.querySelector<HTMLOListElement>("#flags")!;
const relaysEl = document.querySelector<HTMLUListElement>("#relays")!;
const statusEl = document.querySelector<HTMLParagraphElement>("#status")!;
const callsignEl = document.querySelector<HTMLElement>("#callsign")!;
const roleEl = document.querySelector<HTMLElement>("#role")!;
const npubEl = document.querySelector<HTMLElement>("#dialog-npub")!;
const releaseBtn = document.querySelector<HTMLButtonElement>("#release")!;
const followBtn = document.querySelector<HTMLButtonElement>("#wind-follows")!;
const globalBtn = document.querySelector<HTMLButtonElement>("#wind-global")!;
const oneBtn = document.querySelector<HTMLButtonElement>("#wind-one")!;
const followCountEl = document.querySelector<HTMLParagraphElement>("#follow-count")!;
const nip07Btn = document.querySelector<HTMLButtonElement>("#nip07")!;
const rememberEl = document.querySelector<HTMLInputElement>("#remember")!;
const noteEl = document.querySelector<HTMLTextAreaElement>("#note")!;

const profiles = new Map<string, Profile>();
const notes = new Map<string, Note>();
const relayState = new Map<string, RelayState>();
const flagEls = new Map<string, HTMLLIElement>();

const DRIFT_PX_PER_SEC = 22;
const MAX_PENDING = 48;

let currentNpub: string | null = null;
let currentOwnHex: string | undefined;
let currentMode: WindMode = "global";
let liveCount = 0;
let hoverPause = false;
let driftY = 0;
let driftLast = 0;
let driftRaf = 0;
let streamPrimed = false;
let replyTarget: Note | null = null;
let onListenTo: ((pubkey: string) => void) | undefined;
let onPickReply: ((note: Note | null) => void) | undefined;

const pending: Note[] = [];
const pendingIds = new Set<string>();

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

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

function mentionToken(token: string): { label: string; pubkey?: string } | null {
  const raw = token.replace(/^nostr:/i, "");
  try {
    const decoded = nip19.decode(raw);
    if (decoded.type === "npub") {
      return { label: displayName(decoded.data), pubkey: decoded.data };
    }
    if (decoded.type === "nprofile") {
      const pubkey = decoded.data.pubkey;
      return { label: displayName(pubkey), pubkey };
    }
    if (decoded.type === "note") {
      return { label: `note ${raw.slice(0, 12)}…` };
    }
  } catch {
    return null;
  }
  return null;
}

function appendTextWithLinks(target: HTMLElement, content: string): void {
  const parts = content.split(
    /(https?:\/\/[^\s]+|nostr:(?:npub|nprofile|note|nevent)1[a-z0-9]+|(?:npub|note)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+)/gi,
  );
  for (const part of parts) {
    if (/^https?:\/\//.test(part)) {
      const a = document.createElement("a");
      a.href = part;
      a.target = "_blank";
      a.rel = "noreferrer";
      a.textContent = part;
      target.append(a);
      continue;
    }
    const mention = /^(?:nostr:)?(?:npub|nprofile|note|nevent)1/i.test(part) ? mentionToken(part) : null;
    if (mention) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mention";
      button.textContent = mention.label;
      if (mention.pubkey) {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          onListenTo?.(mention.pubkey!);
        });
      } else {
        button.disabled = true;
      }
      target.append(button);
      continue;
    }
    target.append(part);
  }
}

function markReply(el: HTMLLIElement | null): void {
  for (const flag of flagsEl.querySelectorAll(".flag.replying")) {
    if (flag !== el) flag.classList.remove("replying");
  }
  el?.classList.add("replying");
}

function setReply(note: Note | null, el?: HTMLLIElement): void {
  replyTarget = note;
  markReply(note && el ? el : note ? flagEls.get(note.id) ?? null : null);
  if (note) {
    noteEl.placeholder = `Reply to ${displayName(note.pubkey)}…`;
    noteEl.focus();
  } else {
    noteEl.placeholder = "Let a note catch the wind…";
  }
  onPickReply?.(note);
}

function renderFlag(note: Note): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "flag";
  li.dataset.id = note.id;
  li.style.setProperty("--tilt", tiltFor(note.id));
  if (note.local) li.classList.add("local");
  if (replyTarget?.id === note.id) li.classList.add("replying");
  li.tabIndex = 0;

  const header = document.createElement("header");
  const who = document.createElement("button");
  who.type = "button";
  who.className = "who";
  who.textContent = displayName(note.pubkey);
  who.title = "Listen on this string";
  who.addEventListener("click", (event) => {
    event.stopPropagation();
    onListenTo?.(note.pubkey);
  });
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
  li.addEventListener("click", (event) => {
    if ((event.target as HTMLElement | null)?.closest("a, .who, .mention")) return;
    setReply(replyTarget?.id === note.id ? null : note, li);
  });
  li.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    setReply(replyTarget?.id === note.id ? null : note, li);
  });
  return li;
}

function applyDrift(): void {
  flagsEl.style.transform = `translate3d(0, ${driftY}px, 0)`;
}

function portRect(): DOMRect {
  return flagPort.getBoundingClientRect();
}

function firstFlag(): HTMLLIElement | null {
  for (const child of flagsEl.children) {
    if (child instanceof HTMLLIElement && child.classList.contains("flag")) return child;
  }
  return null;
}

function intersectsPort(el: Element): boolean {
  const port = portRect();
  const rect = el.getBoundingClientRect();
  return rect.bottom > port.top && rect.top < port.bottom;
}

function flagFromEvent(event: Event): HTMLElement | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const flag = target.closest(".flag");
  return flag instanceof HTMLElement && flagsEl.contains(flag) ? flag : null;
}

function readingNote(): boolean {
  return Boolean(flagPort.querySelector(".flag:hover, .flag:focus-within"));
}

function retireFlag(el: HTMLLIElement): void {
  const id = el.dataset.id;
  if (id && replyTarget?.id === id) setReply(null);
  const next = el.nextElementSibling as HTMLElement | null;
  const nextTop = next?.offsetTop;
  el.remove();
  if (id) {
    flagEls.delete(id);
    notes.delete(id);
  }
  if (next && nextTop != null) driftY += nextTop - next.offsetTop;
  if (flagEls.size === 0) {
    driftY = 0;
    streamPrimed = false;
  }
  applyDrift();
}

function retirePassedFlags(): void {
  const top = portRect().top;
  for (let i = 0; i < 12; i += 1) {
    const el = firstFlag();
    if (!el) return;
    if (el.getBoundingClientRect().bottom > top) return;
    retireFlag(el);
  }
}

function parkFlag(el: HTMLLIElement): void {
  flagsEl.append(el);
  if (!streamPrimed) {
    if (el.getBoundingClientRect().bottom >= portRect().bottom) streamPrimed = true;
    return;
  }
  const port = portRect();
  const rect = el.getBoundingClientRect();
  if (rect.top < port.bottom) {
    el.style.marginTop = `${Math.ceil(port.bottom - rect.top)}px`;
  }
}

function flushPending(): void {
  while (pending.length > 0) {
    const note = pending[0];
    pending.shift();
    pendingIds.delete(note.id);
    if (flagEls.has(note.id)) continue;
    const el = renderFlag(note);
    flagEls.set(note.id, el);
    el.classList.toggle("own", Boolean(currentOwnHex && note.pubkey === currentOwnHex));
    parkFlag(el);
  }
}

function queueIncoming(note: Note): void {
  if (flagEls.has(note.id) || pendingIds.has(note.id)) return;
  pending.push(note);
  pendingIds.add(note.id);
  while (pending.length > MAX_PENDING) {
    const dropped = pending.shift();
    if (dropped) pendingIds.delete(dropped.id);
  }
}

function driftTick(now: number): void {
  const dt = driftLast ? Math.min(0.048, (now - driftLast) / 1000) : 0;
  driftLast = now;
  if (!reduceMotion.matches && !hoverPause && flagEls.size > 0) {
    driftY -= DRIFT_PX_PER_SEC * dt;
    applyDrift();
    retirePassedFlags();
    flushPending();
  }
  driftRaf = requestAnimationFrame(driftTick);
}

function startDrift(): void {
  if (driftRaf) return;
  flagPort.addEventListener("mouseover", (event) => {
    if (flagFromEvent(event)) hoverPause = true;
  });
  flagPort.addEventListener("mouseout", () => {
    hoverPause = readingNote();
  });
  flagPort.addEventListener("focusin", (event) => {
    if (flagFromEvent(event)) hoverPause = true;
  });
  flagPort.addEventListener("focusout", () => {
    hoverPause = readingNote();
  });
  flagPort.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      driftY -= event.deltaY;
      applyDrift();
      retirePassedFlags();
      flushPending();
    },
    { passive: false },
  );
  window.addEventListener("resize", () => applyDrift());
  driftRaf = requestAnimationFrame(driftTick);
}

function sortNotes(): Note[] {
  return [...notes.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 48);
}

function pushBar(): void {
  queueBarState({
    npub: barNpub(currentNpub),
    mode: currentMode,
    count: liveCount,
    notes: barNotes(
      sortNotes().filter((note) => !note.local),
      displayName,
    ),
  });
}

export function paintFlags(ownPubkey?: string): void {
  if (ownPubkey) currentOwnHex = ownPubkey;
  for (const [id, el] of flagEls) {
    const note = notes.get(id);
    if (!note) continue;
    el.classList.toggle("own", Boolean(currentOwnHex && note.pubkey === currentOwnHex));
  }
  flushPending();
  applyDrift();
  pushBar();
}

export function upsertNote(note: Note, ownPubkey?: string): void {
  if (ownPubkey) currentOwnHex = ownPubkey;
  const isNew = !notes.has(note.id);
  notes.set(note.id, note);
  if (isNew && !note.local) liveCount += 1;
  const existing = flagEls.get(note.id);
  if (existing) {
    existing.classList.toggle("own", Boolean(currentOwnHex && note.pubkey === currentOwnHex));
    if (!intersectsPort(existing)) {
      const who = existing.querySelector(".who");
      if (who) who.textContent = displayName(note.pubkey);
    }
    pushBar();
    return;
  }
  queueIncoming(note);
  flushPending();
  pushBar();
}

export function clearSeeds(_ownPubkey?: string): void {
  for (const [id, note] of [...notes]) {
    if (!note.local) continue;
    notes.delete(id);
    const el = flagEls.get(id);
    if (el) {
      el.remove();
      flagEls.delete(id);
    }
  }
  streamPrimed = true;
  pushBar();
}

export function wipeFlags(ownPubkey?: string): void {
  pending.length = 0;
  pendingIds.clear();
  for (const el of [...flagEls.values()]) el.remove();
  flagEls.clear();
  notes.clear();
  liveCount = 0;
  driftY = 0;
  streamPrimed = false;
  clearReply();
  applyDrift();
  paintFlags(ownPubkey);
}

export function clearLiveNotes(ownPubkey?: string): void {
  pending.length = 0;
  pendingIds.clear();
  for (const [id, el] of [...flagEls]) {
    if (intersectsPort(el)) continue;
    if (el.getBoundingClientRect().bottom <= portRect().top) retireFlag(el);
    else {
      el.remove();
      flagEls.delete(id);
    }
  }
  for (const id of [...notes.keys()]) {
    if (!flagEls.has(id)) notes.delete(id);
  }
  liveCount = [...notes.values()].filter((note) => !note.local).length;
  paintFlags(ownPubkey);
}

export function setProfile(pubkey: string, profile: Profile, _ownPubkey?: string): void {
  profiles.set(pubkey, profile);
  const name = displayName(pubkey);
  for (const [id, el] of flagEls) {
    const note = notes.get(id);
    if (!note || note.pubkey !== pubkey) continue;
    if (intersectsPort(el)) continue;
    const who = el.querySelector(".who");
    if (who) who.textContent = name;
  }
  pushBar();
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

export function setIdentity(npub: string | null, canPost: boolean, via = "nsec", hex?: string): void {
  currentNpub = npub;
  currentOwnHex = hex;
  callsignEl.textContent = npub ? shortNpub(npub) : "listening";
  roleEl.textContent = canPost ? (via === "nip07" ? "signed by extension" : "on the string") : "read-only";
  npubEl.textContent = npub ?? "none";
  releaseBtn.disabled = !canPost;
  pushBar();
}

export function setWindMode(mode: WindMode, followCount?: number, who?: string): void {
  currentMode = mode;
  followBtn.setAttribute("aria-pressed", String(mode === "follows"));
  globalBtn.setAttribute("aria-pressed", String(mode === "global"));
  oneBtn.hidden = mode !== "one";
  oneBtn.setAttribute("aria-pressed", String(mode === "one"));
  if (mode === "follows") {
    followCountEl.textContent =
      followCount === undefined
        ? "Reading your follow list…"
        : followCount === 0
          ? "No follows on relays yet"
          : `${followCount} people on this wind`;
  } else if (mode === "one") {
    followCountEl.textContent = who ? `This string — ${who}` : "This string";
  } else {
    followCountEl.textContent = "Open wind — anyone on these relays";
  }
  pushBar();
}

export function nameOf(pubkey: string): string {
  return displayName(pubkey);
}

export function bindDesk(handlers: {
  listenTo: (pubkey: string) => void;
  pickReply: (note: Note | null) => void;
}): void {
  onListenTo = handlers.listenTo;
  onPickReply = handlers.pickReply;
}

export function currentReply(): Note | null {
  return replyTarget;
}

export function clearReply(): void {
  setReply(null);
}

export function showNip07(available: boolean): void {
  nip07Btn.hidden = !available;
}

export function rememberChecked(): boolean {
  return rememberEl.checked;
}

export function setRememberChecked(value: boolean): void {
  rememberEl.checked = value;
}

export const seedNotes: Note[] = [
  {
    id: "seed-1",
    pubkey: "0".repeat(64),
    createdAt: Math.floor(Date.now() / 1000) - 40,
    content: "Kite is a listening desk. Notes clip to the string. Relays are weather.",
    reply: false,
    local: true,
  },
  {
    id: "seed-2",
    pubkey: "0".repeat(64),
    createdAt: Math.floor(Date.now() / 1000) - 20,
    content: "Hold a string in this session, or sign with a NIP-07 extension. The nsec stays off disk unless you ask.",
    reply: false,
    local: true,
  },
  {
    id: "seed-3",
    pubkey: "0".repeat(64),
    createdAt: Math.floor(Date.now() / 1000) - 5,
    content: "Click a name to listen on that string. Click a flag to reply. Open wind is the public gust.",
    reply: false,
    local: true,
  },
];

profiles.set(seedNotes[0].pubkey, { name: "kite" });
startDrift();
