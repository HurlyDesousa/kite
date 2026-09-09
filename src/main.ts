import {
  forgetSecret,
  generateKey,
  decodeSecret,
  hexPubkey,
  loadSecret,
  npubFromHex,
  npubFromSecret,
  saveSecret,
  signNote,
  signWithNip07,
  hasNip07,
  preferNip07,
  rememberPreferred,
  signerPref,
} from "./keys";
import {
  listen,
  publish,
  replyTags,
} from "./nostr";
import type { WindMode } from "./types";
import {
  knownPubkeys,
  paintFlags,
  seedNotes,
  setIdentity,
  setProfile,
  setRelays,
  setStatus,
  upsertNote,
  clearSeeds,
  clearLiveNotes,
  wipeFlags,
  setWindMode,
  showNip07,
  rememberChecked,
  setRememberChecked,
  bindDesk,
  nameOf,
  currentReply,
  clearReply,
} from "./ui";

const WIND_KEY = "kite.wind";

const dialog = document.querySelector<HTMLDialogElement>("#keys-dialog")!;
const identityBtn = document.querySelector<HTMLButtonElement>("#identity")!;
const generateBtn = document.querySelector<HTMLButtonElement>("#generate")!;
const importBtn = document.querySelector<HTMLButtonElement>("#import-key")!;
const forgetBtn = document.querySelector<HTMLButtonElement>("#forget")!;
const nip07Btn = document.querySelector<HTMLButtonElement>("#nip07")!;
const nsecInput = document.querySelector<HTMLInputElement>("#nsec-input")!;
const spool = document.querySelector<HTMLFormElement>("#spool")!;
const note = document.querySelector<HTMLTextAreaElement>("#note")!;
const followBtn = document.querySelector<HTMLButtonElement>("#wind-follows")!;
const globalBtn = document.querySelector<HTMLButtonElement>("#wind-global")!;
const oneBtn = document.querySelector<HTMLButtonElement>("#wind-one")!;

let secret = loadSecret();
let nip07Pubkey: string | null = null;
let seedCleared = false;
let followPubkeys: string[] = [];
let followsLoaded = false;
let wind: WindMode = "global";
let thisPubkey: string | undefined;
let profileTick = 0;

function ownPubkey(): string | undefined {
  if (secret) return hexPubkey(secret);
  return nip07Pubkey ?? undefined;
}

function currentNpub(): string | null {
  if (secret) return npubFromSecret(secret);
  if (nip07Pubkey) return npubFromHex(nip07Pubkey);
  return null;
}

function canPost(): boolean {
  return Boolean(secret || nip07Pubkey);
}

function signerLabel(): string {
  return nip07Pubkey ? "nip07" : "nsec";
}

function refreshIdentity(): void {
  setIdentity(currentNpub(), canPost(), signerLabel(), ownPubkey());
}

function storedWind(): WindMode | null {
  const value = localStorage.getItem(WIND_KEY);
  return value === "follows" || value === "global" ? value : null;
}

function persistWind(mode: "follows" | "global"): void {
  localStorage.setItem(WIND_KEY, mode);
}

function maybeClearSeed(): void {
  if (seedCleared) return;
  seedCleared = true;
  clearSeeds(ownPubkey());
}

function listenTo(pubkey: string): void {
  thisPubkey = pubkey;
  wind = "one";
  wipeFlags(ownPubkey());
  session.setAuthors([pubkey]);
  session.loadProfiles([pubkey]);
  setWindMode("one", undefined, nameOf(pubkey));
  setStatus(`This string — ${nameOf(pubkey)}`);
}

function applyWind(mode: WindMode, follows?: string[], replace = true): void {
  wind = mode;
  if (follows) followPubkeys = follows;
  if (mode !== "one") thisPubkey = undefined;
  if (mode !== "one") clearReply();

  if (mode === "one" && thisPubkey) {
    if (replace) wipeFlags(ownPubkey());
    session.setAuthors([thisPubkey]);
    session.loadProfiles([thisPubkey]);
    setWindMode("one", undefined, nameOf(thisPubkey));
    setStatus(`This string — ${nameOf(thisPubkey)}`);
    return;
  }

  if (mode === "follows") {
    const self = ownPubkey();
    if (!self) {
      setWindMode("global");
      session.setAuthors(undefined);
      setStatus("Hold a string to follow people. Open wind until then.");
      return;
    }
    setWindMode("follows", followsLoaded ? followPubkeys.length : undefined);
    if (!followsLoaded) {
      setStatus("Reading your follow list…");
      return;
    }
    if (followPubkeys.length === 0) {
      setStatus("No follow list on these relays yet. Open wind until you follow people.");
      if (replace) {
        session.setAuthors(undefined);
      }
      return;
    }
    if (replace) clearLiveNotes(ownPubkey());
    session.setAuthors([...new Set([self, ...followPubkeys])].slice(0, 120));
    setStatus(`Follow wind — ${followPubkeys.length} people`);
    return;
  }

  setWindMode("global");
  if (replace) clearLiveNotes(ownPubkey());
  session.setAuthors(undefined);
  setStatus("Open wind. Anyone on these relays can clip a note.");
}

function afterKey(): void {
  refreshIdentity();
  const pubkey = ownPubkey();
  if (!pubkey) return;
  followsLoaded = false;
  followPubkeys = [];
  if (storedWind() !== "global") {
    applyWind("follows", undefined, false);
    session.loadFollows(pubkey);
  }
}

async function connectNip07(): Promise<void> {
  if (!window.nostr?.getPublicKey) {
    setStatus("No NIP-07 signer in this browser.");
    return;
  }
  nip07Pubkey = await window.nostr.getPublicKey();
  secret = null;
  preferNip07();
  setStatus("Extension is holding the string. Kite never sees the nsec.");
  dialog.close();
  afterKey();
}

identityBtn.addEventListener("click", () => {
  dialog.showModal();
});

generateBtn.addEventListener("click", () => {
  secret = generateKey();
  nip07Pubkey = null;
  saveSecret(secret, rememberChecked());
  setStatus(
    rememberChecked()
      ? "A new string is in your hand, kept on this machine."
      : "A new string is in your hand for this session only.",
  );
  dialog.close();
  afterKey();
});

importBtn.addEventListener("click", () => {
  try {
    secret = decodeSecret(nsecInput.value);
    nip07Pubkey = null;
    saveSecret(secret, rememberChecked());
    nsecInput.value = "";
    setStatus(
      rememberChecked()
        ? "String held on this machine."
        : "String held for this session. Closing the desk forgets it.",
    );
    dialog.close();
    afterKey();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Could not read that key.");
  }
});

forgetBtn.addEventListener("click", () => {
  forgetSecret();
  secret = null;
  nip07Pubkey = null;
  followPubkeys = [];
  followsLoaded = false;
  thisPubkey = undefined;
  refreshIdentity();
  persistWind("global");
  applyWind("global");
  setStatus("Listening only. The string is back in the drawer.");
  dialog.close();
});

nip07Btn.addEventListener("click", () => {
  void connectNip07().catch((error: unknown) => {
    setStatus(error instanceof Error ? error.message : "The extension would not sign.");
  });
});

followBtn.addEventListener("click", () => {
  const pubkey = ownPubkey();
  if (!pubkey) {
    dialog.showModal();
    setStatus("Hold a string before you follow wind.");
    return;
  }
  persistWind("follows");
  followsLoaded = followPubkeys.length > 0;
  applyWind("follows");
  session.loadFollows(pubkey);
});

globalBtn.addEventListener("click", () => {
  persistWind("global");
  applyWind("global");
});

oneBtn.addEventListener("click", () => {
  if (thisPubkey) listenTo(thisPubkey);
});

note.addEventListener("input", () => {
  note.style.height = "auto";
  note.style.height = `${Math.min(note.scrollHeight, 120)}px`;
});

spool.addEventListener("submit", async (event) => {
  event.preventDefault();
  const content = note.value.trim();
  if (!content) return;
  if (!canPost()) {
    dialog.showModal();
    setStatus("Hold a string before you release a note.");
    return;
  }
  try {
    const reply = currentReply();
    const tags = reply ? replyTags(reply) : [];
    const signed = secret ? signNote(secret, content, tags) : await signWithNip07(content, tags);
    await publish(signed);
    note.value = "";
    note.style.height = "auto";
    upsertNote(
      {
        id: signed.id,
        pubkey: signed.pubkey,
        createdAt: signed.created_at,
        content: signed.content,
        reply: Boolean(reply),
        replyTo: reply?.id,
      },
      ownPubkey(),
    );
    clearReply();
    setStatus(reply ? `Reply clipped to ${nameOf(reply.pubkey)}.` : "Released. The wind has it.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "The wind would not take it.");
  }
});

const session = listen({
  onNote(n) {
    maybeClearSeed();
    upsertNote(n, ownPubkey());
    profileTick += 1;
    if (profileTick === 1 || profileTick % 8 === 0) {
      session.loadProfiles(knownPubkeys());
    }
    setStatus(
      `${wind === "follows" ? "Follow wind" : wind === "one" ? "This string" : "Open wind"} — notes on the string`,
    );
  },
  onProfile(pubkey, profile) {
    setProfile(pubkey, profile, ownPubkey());
  },
  onRelay(state) {
    setRelays(state);
    if (state.live) {
      setStatus("Wind is up. Notes will clip to the string as they arrive.");
    }
  },
  onReady() {
    session.loadProfiles(knownPubkeys());
  },
  onFollows(pubkeys) {
    followsLoaded = true;
    followPubkeys = pubkeys;
    if (wind === "follows") applyWind("follows", pubkeys);
  },
});

bindDesk({
  listenTo,
  pickReply(note) {
    if (note) setStatus(`Replying to ${nameOf(note.pubkey)}. Click the flag again to let go.`);
  },
});

for (const seed of seedNotes) {
  upsertNote(seed);
}
setRememberChecked(rememberPreferred());
showNip07(hasNip07());
refreshIdentity();
paintFlags(ownPubkey());
setWindMode(ownPubkey() && storedWind() !== "global" ? "follows" : "global");

if (signerPref() === "nip07" && hasNip07()) {
  void connectNip07().catch(() => {
    nip07Pubkey = null;
    refreshIdentity();
    applyWind("global", undefined, false);
  });
} else if (ownPubkey() && storedWind() !== "global") {
  applyWind("follows", undefined, false);
  session.loadFollows(ownPubkey()!);
} else {
  applyWind("global", undefined, false);
}

window.addEventListener("beforeunload", () => session.close());
