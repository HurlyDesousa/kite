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

function toNote(event: Event): Note {
  return {
    id: event.id,
    pubkey: event.pubkey,
    createdAt: event.created_at,
    content: event.content,
    reply: event.tags.some((tag) => tag[0] === "e"),
  };
}

function isNoise(content: string): boolean {
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

export function listen(handlers: {
  onNote: (note: Note) => void;
  onProfile: (pubkey: string, profile: Profile) => void;
  onRelay: (state: RelayState) => void;
  onReady: () => void;
}): { close: () => void; loadProfiles: (pubkeys: string[]) => void } {
  const seen = new Set<string>();
  let ready = false;

  const sub = pool.subscribe(
    RELAYS,
    { kinds: [1], limit: 32 },
    {
      onevent(event) {
        if (event.kind !== 1 || seen.has(event.id) || isNoise(event.content)) return;
        seen.add(event.id);
        handlers.onNote(toNote(event));
      },
      oneose() {
        if (ready) return;
        ready = true;
        handlers.onReady();
      },
    },
  );

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
      sub.close();
    },
    loadProfiles(pubkeys: string[]) {
      const unique = [...new Set(pubkeys)].slice(0, 40);
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
  };
}

export async function publish(event: Event, relays = RELAYS): Promise<void> {
  const results = await Promise.allSettled(pool.publish(relays, event));
  if (results.every((result) => result.status === "rejected")) {
    throw new Error("No relay accepted the note.");
  }
}
