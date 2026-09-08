import type { Note, WindMode } from "./types";
import { shortNpub } from "./keys";

const MAX_NOTES = 5;
const MAX_CONTENT = 180;

type BarState = {
  npub: string;
  mode: WindMode;
  count: number;
  notes: { who: string; content: string; createdAt: number }[];
};

let timer: number | undefined;

function sanitize(state: BarState): BarState {
  return {
    npub: state.npub.slice(0, 80),
    mode: state.mode === "follows" ? "follows" : "global",
    count: Number.isFinite(state.count) ? Math.max(0, Math.floor(state.count)) : 0,
    notes: state.notes.slice(0, MAX_NOTES).map((note) => ({
      who: String(note.who || "note").slice(0, 48),
      content: String(note.content || "").slice(0, MAX_CONTENT),
      createdAt: Number(note.createdAt) || 0,
    })),
  };
}

export function queueBarState(state: BarState): void {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    void fetch("/kite/state", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(sanitize(state)),
    }).catch(() => {
      /* desk still works if the bar helper is not listening */
    });
  }, 400);
}

export function barNotes(
  notes: Note[],
  who: (pubkey: string) => string,
): BarState["notes"] {
  return notes.slice(0, MAX_NOTES).map((note) => ({
    who: who(note.pubkey),
    content: note.content.replace(/\s+/g, " ").trim(),
    createdAt: note.createdAt,
  }));
}

export function barNpub(npub: string | null): string {
  return npub ? shortNpub(npub) : "";
}
