import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import type { Connect } from "vite";

const MAX_BYTES = 64 * 1024;

function kiteStateDir(): string {
  const xdg = process.env.XDG_STATE_HOME;
  return xdg ? path.join(xdg, "kite") : path.join(os.homedir(), ".local/state/kite");
}

function writeBarState(raw: string): void {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("invalid");
  }
  const notes = Array.isArray(parsed.notes)
    ? parsed.notes.slice(0, 5).map((note) => {
        const row = note as Record<string, unknown>;
        return {
          who: String(row.who ?? "note").slice(0, 48),
          content: String(row.content ?? "").slice(0, 180),
          createdAt: Number(row.createdAt) || 0,
        };
      })
    : [];
  const payload = {
    npub: typeof parsed.npub === "string" ? parsed.npub.slice(0, 80) : "",
    mode: parsed.mode === "follows" || parsed.mode === "one" ? parsed.mode : "global",
    count: Number(parsed.count) || 0,
    notes,
  };
  const dir = kiteStateDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const dest = path.join(dir, "latest.json");
  const tmp = `${dest}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tmp, dest);
}

function kiteStatePlugin(): Plugin {
  return {
    name: "kite-state",
    configureServer(server) {
      server.middlewares.use(stateMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(stateMiddleware);
    },
  };
}

function stateMiddleware(req: Connect.IncomingMessage, res: Connect.ServerResponse, next: () => void): void {
  const url = req.url?.split("?")[0];
  if (req.method !== "POST" || url !== "/kite/state") {
    next();
    return;
  }

  const chunks: Buffer[] = [];
  let size = 0;
  let tooLarge = false;

  req.on("data", (chunk: Buffer) => {
    size += chunk.length;
    if (size > MAX_BYTES) {
      tooLarge = true;
      res.statusCode = 413;
      res.end();
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on("end", () => {
    if (tooLarge) return;
    try {
      writeBarState(Buffer.concat(chunks).toString("utf8"));
      res.statusCode = 204;
      res.end();
    } catch {
      res.statusCode = 400;
      res.end();
    }
  });
}

export default defineConfig({
  plugins: [kiteStatePlugin()],
  server: {
    host: "127.0.0.1",
    port: 7423,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 7423,
    strictPort: true,
  },
});
