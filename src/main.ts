import {
  forgetSecret,
  generateKey,
  decodeSecret,
  hexPubkey,
  loadSecret,
  npubFromSecret,
  saveSecret,
  signNote,
} from "./keys";
import { listen, publish } from "./nostr";
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
} from "./ui";

const dialog = document.querySelector<HTMLDialogElement>("#keys-dialog")!;
const identityBtn = document.querySelector<HTMLButtonElement>("#identity")!;
const generateBtn = document.querySelector<HTMLButtonElement>("#generate")!;
const importBtn = document.querySelector<HTMLButtonElement>("#import-key")!;
const forgetBtn = document.querySelector<HTMLButtonElement>("#forget")!;
const nsecInput = document.querySelector<HTMLInputElement>("#nsec-input")!;
const spool = document.querySelector<HTMLFormElement>("#spool")!;
const note = document.querySelector<HTMLTextAreaElement>("#note")!;

let secret = loadSecret();
let liveCount = 0;
let seedCleared = false;

function ownPubkey(): string | undefined {
  return secret ? hexPubkey(secret) : undefined;
}

function refreshIdentity(): void {
  setIdentity(secret ? npubFromSecret(secret) : null, Boolean(secret));
}

function maybeClearSeed(): void {
  if (seedCleared) return;
  seedCleared = true;
  clearSeeds(ownPubkey());
}

identityBtn.addEventListener("click", () => {
  dialog.showModal();
});

generateBtn.addEventListener("click", () => {
  secret = generateKey();
  saveSecret(secret);
  refreshIdentity();
  setStatus("A new string is in your hand. Notes you release are yours.");
  dialog.close();
});

importBtn.addEventListener("click", () => {
  try {
    secret = decodeSecret(nsecInput.value);
    saveSecret(secret);
    nsecInput.value = "";
    refreshIdentity();
    setStatus("String held. Relays already know this key if you have used it.");
    dialog.close();
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Could not read that key.");
  }
});

forgetBtn.addEventListener("click", () => {
  forgetSecret();
  secret = null;
  refreshIdentity();
  setStatus("Listening only. The string is back in the drawer.");
  dialog.close();
});

note.addEventListener("input", () => {
  note.style.height = "auto";
  note.style.height = `${Math.min(note.scrollHeight, 120)}px`;
});

spool.addEventListener("submit", async (event) => {
  event.preventDefault();
  const content = note.value.trim();
  if (!content) return;
  if (!secret) {
    dialog.showModal();
    setStatus("Hold a string before you release a note.");
    return;
  }
  try {
    const signed = signNote(secret, content);
    await publish(signed);
    note.value = "";
    note.style.height = "auto";
    upsertNote(
      {
        id: signed.id,
        pubkey: signed.pubkey,
        createdAt: signed.created_at,
        content: signed.content,
        reply: false,
      },
      ownPubkey(),
    );
    setStatus("Released. The wind has it.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "The wind would not take it.");
  }
});

for (const seed of seedNotes) {
  upsertNote(seed);
}
refreshIdentity();
paintFlags(ownPubkey());

const session = listen({
  onNote(n) {
    if (!seedCleared) {
      maybeClearSeed();
    }
    liveCount += 1;
    upsertNote(n, ownPubkey());
    if (liveCount === 1 || liveCount % 8 === 0) {
      session.loadProfiles(knownPubkeys());
    }
    setStatus(`${liveCount} notes on the string`);
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
    if (liveCount === 0) {
      setStatus("Relays are quiet. Seed notes stay until the wind picks up.");
    }
  },
});

window.addEventListener("beforeunload", () => session.close());
