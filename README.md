# Kite

A Nostr client that refuses to look like Twitter.

Kite is a **listening desk** for [Omarchy](https://omarchy.org/). Relays are weather. Your key is the string. Notes clip onto it like flags in the wind — not as a feed, not as a timeline, not as a global shouting match.

There is no account server.

## Marketplace

[omarchyplugins.com](https://omarchyplugins.com) / [plugins.omarchy.org](https://plugins.omarchy.org) had **no Nostr listening client** listed. Nearby Omarchy+Nostr work does something else:

| Project | What it is | What Kite does instead |
| --- | --- | --- |
| [omarchy-scrobble](https://github.com/Punk-Science-Studios-Inc/omarchy-scrobble) | Bar widget that publishes NIP-38 now-playing. Keys stay on a phone (NIP-46). `omarchy plugin add`. | Kind-1 notes on a desk, with a bar that *reads* the latest flags |
| [Omostrich](https://github.com/ninepointlabs/omostrich) | Signing vault + compose chip. Not a feed. Super+N to post | Super+Shift+Alt+N opens the desk. Prefer Omostrich if you want the nsec out of the browser |
| [birdwatch](https://github.com/tami1A84/birdwatch) | Keyboard-first TUI, gossip, NIP-49 vault | Same follow-list idea, as a visual string instead of curses |

Kite follows the marketplace contract those plugins use: `manifest.json` at the **repo root**, id `io.github.hurlydesousa.kite`, a `bar-widget` that loads a `KeyboardPanel`, `omarchy plugin add` / `remove` with no install hooks, and extra state documented so remove is complete.

## The desk

- A vertical string instead of a column of cards
- Relays drawn as wind on the left, not a settings table
- **Follow** wind reads your kind-3 list; **Open** wind is the public gust
- Compose from the spool at the ground — the button is **Release**
- Omarchy paints the sky: `theme-set` rewrites colours from `colors.toml`
- The bar chip opens a KeyboardPanel with the latest notes, then **Open desk**

You can listen with no key. Click the kite when you want to hold a string.

## Keys

In order of how little the desk should see:

1. **NIP-07 extension** — Kite never holds the nsec
2. **Session nsec** — default; forgotten when the desk closes
3. **Keep on this machine** — opt-in localStorage, same as the first Kite build
4. **Omostrich / phone signer** — keep the vault there and treat Kite as a listener

## Install on Omarchy

Plugins run unsandboxed inside `omarchy-shell`. Read this repo before you add it.

```bash
omarchy plugin add https://github.com/HurlyDesousa/kite.git --enable
```

That is the bar widget. It does not start Node. To also run the desk from `kite` / **Super+Shift+Alt+N**:

```bash
git clone https://github.com/HurlyDesousa/kite.git
cd kite
./install.sh
omarchy restart shell
```

`install.sh` builds the web desk into `~/.local/share/kite/www`, puts `kite` and `kite-serve` on your PATH, copies the plugin if you have not already `plugin add`’d it, migrates the old `hurly.kite` id, binds **Super+Shift+Alt+N**, and installs a `theme-set` hook.

Place the chip:

```bash
omarchy bar move io.github.hurlydesousa.kite --section right
```

### Remove

```bash
omarchy plugin remove io.github.hurlydesousa.kite
```

That disables the widget and deletes the plugin checkout. Extra state the desk writes:

```bash
rm -rf ~/.local/share/kite          # built web desk
rm -rf ~/.local/state/kite          # latest.json for the bar, server pid/log
rm -f ~/.local/bin/kite ~/.local/bin/kite-serve ~/.local/bin/kite-sync-theme
rm -f ~/.local/share/applications/kite.desktop
```

The Super+Shift+Alt+N block in `~/.config/hypr/bindings.lua` (between `-- kite begin` and `-- kite end`) is yours to delete. Browser storage for an nsec, if you checked “keep on this machine”, lives in the Kite origin’s localStorage — open the desk and press **Forget**.

If you still have the old nested plugin:

```bash
omarchy plugin remove hurly.kite
```

## Dev desk

```bash
npm install
npm run dev
```

Then open [http://127.0.0.1:7423](http://127.0.0.1:7423). Dev and preview accept `POST /kite/state` so the bar can watch `~/.local/state/kite/latest.json`.

```bash
omarchy plugin validate .
qmllint -I "$OMARCHY_PATH/shell" BarWidget.qml Panel.qml
```

If `validate` complains about symlinks, you likely have `node_modules` in the tree (npm’s `.bin` links). That directory is gitignored and is not part of `plugin add`. Validate a clean checkout, or copy `manifest.json`, `BarWidget.qml`, and `Panel.qml` into an empty folder and validate that.

## Protocol

Kind 1 notes over `damus`, `nos.lol`, `primal`, `snort`. Kind 0 profiles fill names. Kind 3 follow lists drive Follow wind. JSON blobs, `channel:` machine traffic, notes with two or more http links, and notes longer than 560 characters stay off the string.

## License

MIT
