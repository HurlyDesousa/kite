import type { Note, Profile, RelayState, WindMode } from "./types";
import { hostOf, npubOf } from "./nostr";
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
const followCountEl = document.querySelector<HTMLParagraphElement>("#follow-count")!;
const nip07Btn = document.querySelector<HTMLButtonElement>("#nip07")!;
const rememberEl = document.querySelector<HTMLInputElement>("#remember")!;

const profiles = new Map<string, Profile>();
const notes = new Map<string, Note>();
const relayState = new Map<string, RelayState>();
const flagEls = new Map<string, HTMLLIElement>();

const DRIFT_PX_PER_SEC = 22;
const FLAG_GAP = 18;

let currentNpub: string | null = null;
let currentMode: WindMode = "global";
let liveCount = 0;
let hoverPause = false;
let driftY = 0;
let driftLast = 0;
let driftRaf = 0;

const spacer = document.createElement("li");
spacer.className = "flag-spacer";
spacer.setAttribute("aria-hidden", "true");

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

function refreshFlag(el: HTMLLIElement, note: Note): void {
  const who = el.querySelector(".who");
  if (who) who.textContent = displayName(note.pubkey);
  const time = el.querySelector("time");
  if (time instanceof HTMLTimeElement) {
    time.dateTime = new Date(note.createdAt * 1000).toISOString();
    time.textContent = relativeTime(note.createdAt);
  }
}

function applyDrift(): void {
  flagsEl.style.transform = `translate3d(0, ${driftY}px, 0)`;
}

function ensureSpacer(): void {
  spacer.style.height = `${Math.max(flagPort.clientHeight, 1)}px`;
  if (spacer.parentElement !== flagsEl) flagsEl.append(spacer);
}

function firstFlag(): HTMLLIElement | null {
  for (const child of flagsEl.children) {
    if (child === spacer) continue;
    if (child instanceof HTMLLIElement && child.classList.contains("flag")) return child;
  }
  return null;
}

function parkNewFlag(el: HTMLLIElement): void {
  flagsEl.insertBefore(el, spacer);
}

function flagFromEvent(event: Event): HTMLElement | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const flag = target.closest(".flag");
  return flag instanceof HTMLElement && flag !== spacer && flagsEl.contains(flag) ? flag : null;
}

function readingNote(): boolean {
  return Boolean(flagPort.querySelector(".flag:hover, .flag:focus-within"));
}

function recyclePassedFlags(): void {
  const portTop = flagPort.getBoundingClientRect().top;
  for (let i = 0; i < 8; i += 1) {
    const el = firstFlag();
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.bottom > portTop) return;
    const shift = el.offsetHeight + FLAG_GAP;
    flagsEl.append(el);
    driftY += shift;
  }
  applyDrift();
}

function driftTick(now: number): void {
  const dt = driftLast ? Math.min(0.048, (now - driftLast) / 1000) : 0;
  driftLast = now;
  ensureSpacer();
  if (!reduceMotion.matches && !hoverPause && flagEls.size > 0) {
    driftY -= DRIFT_PX_PER_SEC * dt;
    recyclePassedFlags();
    applyDrift();
  }
  driftRaf = requestAnimationFrame(driftTick);
}

function startDrift(): void {
  if (driftRaf) return;
  ensureSpacer();
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
      recyclePassedFlags();
      applyDrift();
    },
    { passive: false },
  );
  window.addEventListener("resize", () => {
    ensureSpacer();
    applyDrift();
  });
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
  ensureSpacer();
  const snapshot = sortNotes();
  const keep = new Set(snapshot.map((note) => note.id));

  for (const [id, el] of flagEls) {
    if (keep.has(id)) continue;
    const portTop = flagPort.getBoundingClientRect().top;
    const above = el.getBoundingClientRect().bottom <= portTop;
    const shift = el.offsetHeight + FLAG_GAP;
    el.remove();
    flagEls.delete(id);
    if (above) driftY += shift;
  }

  if (flagEls.size === 0) driftY = 0;

  for (const note of snapshot) {
    let el = flagEls.get(note.id);
    if (el) {
      refreshFlag(el, note);
      el.classList.toggle("own", Boolean(ownPubkey && note.pubkey === ownPubkey));
      continue;
    }
    el = renderFlag(note);
    flagEls.set(note.id, el);
    el.classList.toggle("own", Boolean(ownPubkey && note.pubkey === ownPubkey));
    parkNewFlag(el);
  }

  applyDrift();
  pushBar();
}

export function upsertNote(note: Note, ownPubkey?: string): void {
  const isNew = !notes.has(note.id);
  notes.set(note.id, note);
  if (isNew && !note.local) liveCount += 1;
  paintFlags(ownPubkey);
}

export function clearSeeds(ownPubkey?: string): void {
  for (const [id, note] of notes) {
    if (note.local) notes.delete(id);
  }
  paintFlags(ownPubkey);
}

export function clearLiveNotes(ownPubkey?: string): void {
  notes.clear();
  liveCount = 0;
  driftY = 0;
  paintFlags(ownPubkey);
}

export function setProfile(pubkey: string, profile: Profile, _ownPubkey?: string): void {
  profiles.set(pubkey, profile);
  const name = displayName(pubkey);
  for (const [id, el] of flagEls) {
    const note = notes.get(id);
    if (!note || note.pubkey !== pubkey) continue;
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

export function setIdentity(npub: string | null, canPost: boolean, via = "nsec"): void {
  currentNpub = npub;
  callsignEl.textContent = npub ? shortNpub(npub) : "listening";
  roleEl.textContent = canPost ? (via === "nip07" ? "signed by extension" : "on the string") : "read-only";
  npubEl.textContent = npub ?? "none";
  releaseBtn.disabled = !canPost;
  pushBar();
}

export function setWindMode(mode: WindMode, followCount?: number): void {
  currentMode = mode;
  followBtn.setAttribute("aria-pressed", String(mode === "follows"));
  globalBtn.setAttribute("aria-pressed", String(mode === "global"));
  if (mode === "follows") {
    followCountEl.textContent =
      followCount === undefined
        ? "Reading your follow list…"
        : followCount === 0
          ? "No follows on relays yet"
          : `${followCount} people on this wind`;
  } else {
    followCountEl.textContent = "Open wind — anyone on these relays";
  }
  pushBar();
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
    content: "Follow wind reads your kind-3 list. Open wind is the public gust. Super+Shift+Alt+N lifts this window.",
    reply: false,
    local: true,
  },
];

profiles.set(seedNotes[0].pubkey, { name: "kite" });
startDrift();
