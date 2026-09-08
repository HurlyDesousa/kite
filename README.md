# Kite

A Nostr client that refuses to look like Twitter.

Kite is a **listening desk** for [Omarchy](https://omarchy.org/). Relays are weather. Your key is the string. Notes clip onto it like flags in the wind — not as a feed, not as a timeline, not as a global shouting match.

Keys never leave this machine. There is no account server.

## The desk

- A vertical string instead of a column of cards
- Relays drawn as wind on the left, not a settings table
- Compose from the spool at the ground, like letting go of a line
- Omarchy paints the sky: `theme-set` rewrites Kite’s colours from `colors.toml`
- The bar gets a wind icon; **Super+Shift+Alt+N** raises the window

You can listen with no key. Click the kite when you want to hold a string (generate or import an `nsec`).

## Run

```bash
git clone https://github.com/HurlyDesousa/kite.git
cd kite
npm install
npm run dev
```

Then open [http://127.0.0.1:7423](http://127.0.0.1:7423).

## Install on Omarchy

```bash
./install.sh
omarchy restart shell
```

That builds the web desk into `~/.local/share/kite/www`, puts `kite` on your PATH, copies the `hurly.kite` bar widget, binds **Super+Shift+Alt+N**, and installs a `theme-set` hook so the desk follows your Omarchy theme.

## Protocol

Kind 1 notes over a small public relay set (`damus`, `nos.lol`, `primal`, `snort`). Kind 0 profiles fill in names as they arrive. NIP-07 browser extensions are not required; this is a local desk.

## Next

- Follow lists and replies as threads along the string
- NIP-05 / NIP-07
- Mention badge on the bar widget
- Secret key in the OS keyring instead of `localStorage`
