import { SimplePool, nip19, type Event } from "nostr-tools";
import type { Note, Profile, RelayState } from "./types";

export const RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://relay.snort.social",
];

const pool = new SimplePool();

export function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function npubOf(pubkeyHex: string): string {
  return nip19.npubEncode(pubkeyHex);
}

function replyToOf(event: Event): string | undefined {
  const marker = event.tags.find((tag) => tag[0] === "e" && tag[3] === "reply" && tag[1]);
  if (marker?.[1]) return marker[1];
  const first = event.tags.find((tag) => tag[0] === "e" && tag[1]);
  return first?.[1];
}

function toNote(event: Event): Note {
  return {
    id: event.id,
    pubkey: event.pubkey,
    createdAt: event.created_at,
    content: event.content,
    reply: event.tags.some((tag) => tag[0] === "e"),
    replyTo: replyToOf(event),
  };
}

function isNoise(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return true;
  if (trimmed.startsWith("channel:")) return true;
  const links = content.match(/https?:\/\//g)?.length ?? 0;
  if (links >= 2) return true;
  if (content.length > 560) return true;
  return false;
}

export function parseProfile(event: Event): Profile {
  try {
    const data = JSON.parse(event.content) as {
      name?: string;
      display_name?: string;
      displayName?: string;
    };
    return {
      name: data.name,
      displayName: data.display_name ?? data.displayName,
    };
  } catch {
    return {};
  }
}

function followPubkeys(event: Event): string[] {
  return [...new Set(event.tags.filter((tag) => tag[0] === "p" && tag[1]).map((tag) => tag[1]))];
}

export function listen(handlers: {
  onNote: (note: Note) => void;
  onProfile: (pubkey: string, profile: Profile) => void;
  onRelay: (state: RelayState) => void;
  onReady: () => void;
  onFollows?: (pubkeys: string[]) => void;
}): {
  close: () => void;
  loadProfiles: (pubkeys: string[]) => void;
  loadFollows: (pubkey: string) => void;
  setAuthors: (authors?: string[]) => void;
} {
  const seen = new Set<string>();
  let notesSub = startNotes();

  function startNotes(authors?: string[]) {
    const filter =
      authors && authors.length > 0
        ? { kinds: [1], authors, limit: 48 }
        : { kinds: [1], limit: 32 };
    return pool.subscribe(RELAYS, filter, {
      onevent(event) {
        if (event.kind !== 1 || seen.has(event.id) || isNoise(event.content)) return;
        seen.add(event.id);
        handlers.onNote(toNote(event));
      },
      oneose() {
        handlers.onReady();
      },
    });
  }

  for (const url of RELAYS) {
    handlers.onRelay({ url, live: false });
  }

  void Promise.all(
    RELAYS.map(async (url) => {
      try {
        await pool.ensureRelay(url);
        handlers.onRelay({ url, live: true });
      } catch {
        handlers.onRelay({ url, live: false });
      }
    }),
  );

  return {
    close() {
      notesSub.close();
    },
    setAuthors(authors?: string[]) {
      seen.clear();
      notesSub.close();
      notesSub = startNotes(authors);
    },
    loadProfiles(pubkeys: string[]) {
      const unique = [...new Set(pubkeys)].slice(0, 80);
      if (unique.length === 0) return;
      const profiles = pool.subscribe(
        RELAYS,
        { kinds: [0], authors: unique },
        {
          onevent(event) {
            handlers.onProfile(event.pubkey, parseProfile(event));
          },
          oneose() {
            profiles.close();
          },
        },
      );
    },
    loadFollows(pubkey: string) {
      let got = false;
      const follows = pool.subscribe(
        RELAYS,
        { kinds: [3], authors: [pubkey], limit: 1 },
        {
          onevent(event) {
            got = true;
            handlers.onFollows?.(followPubkeys(event).slice(0, 200));
          },
          oneose() {
            if (!got) handlers.onFollows?.([]);
            follows.close();
          },
        },
      );
    },
  };
}

export function replyTags(note: Note): string[][] {
  const tags: string[][] = [];
  if (note.replyTo) tags.push(["e", note.replyTo, "", "root"]);
  tags.push(["e", note.id, "", "reply"]);
  tags.push(["p", note.pubkey]);
  return tags;
}

export async function publish(event: Event, relays = RELAYS): Promise<void> {
  const results = await Promise.allSettled(pool.publish(relays, event));
  if (results.every((result) => result.status === "rejected")) {
    throw new Error("No relay accepted the note.");
  }
}
