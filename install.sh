#!/usr/bin/env bash
# Re-runnable user install. Never blocks on a sudo password prompt.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_ID="hurly.kite"
PLUGIN_SRC="${ROOT}/omarchy/${PLUGIN_ID}"
PLUGIN_DIR="${HOME}/.config/omarchy/plugins/${PLUGIN_ID}"
BIN_DST="${HOME}/.local/bin/kite"
SYNC_DST="${HOME}/.local/bin/kite-sync-theme"
WWW_DST="${HOME}/.local/share/kite/www"
ICON_DST="${HOME}/.local/share/icons/hicolor/scalable/apps/kite.svg"
DESKTOP_DST="${HOME}/.local/share/applications/kite.desktop"
SHELL_JSON="${HOME}/.config/omarchy/shell.json"
BINDINGS="${HOME}/.config/hypr/bindings.lua"

install_web() {
  mkdir -p "${WWW_DST}" "${HOME}/.local/bin" "${HOME}/.local/share/applications"
  mkdir -p "$(dirname "${ICON_DST}")"

  if ! command -v npm >/dev/null 2>&1; then
    echo "npm is not on PATH. Install Node, then re-run ./install.sh to build the desk."
    echo "The Omarchy plugin, hook, and launcher will still be installed."
    return 0
  fi

  (cd "${ROOT}" && npm install && npm run build)
  rm -rf "${WWW_DST}"
  mkdir -p "${WWW_DST}"
  cp -a "${ROOT}/dist/." "${WWW_DST}/"
  install -Dm644 "${ROOT}/public/kite.svg" "${ICON_DST}"
  echo "Web desk: ${WWW_DST}"
}

install_bins() {
  install -Dm755 "${ROOT}/bin/kite" "${BIN_DST}"
  install -Dm755 "${ROOT}/omarchy/sync-theme" "${SYNC_DST}"
  sed "s|^Icon=kite$|Icon=${ICON_DST}|" "${ROOT}/omarchy/kite.desktop" >"${DESKTOP_DST}"
  echo "Launcher: ${BIN_DST}"
}

install_plugin() {
  mkdir -p "${PLUGIN_DIR}"
  install -Dm644 "${PLUGIN_SRC}/manifest.json" "${PLUGIN_DIR}/manifest.json"
  install -Dm644 "${PLUGIN_SRC}/BarWidget.qml" "${PLUGIN_DIR}/BarWidget.qml"
  echo "Plugin: ${PLUGIN_DIR}"
}

patch_shell_json() {
  [[ -f "${SHELL_JSON}" ]] || {
    echo "Note: ${SHELL_JSON} not found; enable the plugin with: omarchy plugin enable ${PLUGIN_ID}"
    return 0
  }
  python3 - "${SHELL_JSON}" "${PLUGIN_ID}" <<'PY'
import json, pathlib, sys

path = pathlib.Path(sys.argv[1])
plugin_id = sys.argv[2]
try:
    data = json.loads(path.read_text(encoding="utf-8"))
except Exception as exc:
    print(f"Warning: could not parse {path}: {exc}")
    sys.exit(0)

layout = data.setdefault("bar", {}).setdefault("layout", {})
center = layout.setdefault("center", [])
right = layout.setdefault("right", [])

def ids(entries):
    return [e.get("id") for e in entries]

if plugin_id in ids(center) or plugin_id in ids(right):
    print(f"shell.json: {plugin_id} already present")
    sys.exit(0)

entry = {"id": plugin_id}
right_ids = ids(right)
if "sw.art.grok" in right_ids:
    right.insert(right_ids.index("sw.art.grok") + 1, entry)
    print(f"shell.json: inserted {plugin_id} after sw.art.grok")
elif "omarchy.tray" in right_ids:
    right.insert(right_ids.index("omarchy.tray") + 1, entry)
    print(f"shell.json: inserted {plugin_id} after omarchy.tray")
else:
    right.append(entry)
    print(f"shell.json: appended {plugin_id} to the right section")

path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
PY
}

patch_bindings() {
  [[ -f "${BINDINGS}" ]] || {
    echo "Note: ${BINDINGS} not found; skip Super+Shift+Alt+N binding."
    return 0
  }
  python3 - "${BINDINGS}" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
begin = "-- kite begin"
end = "-- kite end"
block = """-- kite begin
o.bind("SUPER + SHIFT + ALT + N", "Kite", os.getenv("HOME") .. "/.local/bin/kite")
-- kite end
"""
text = path.read_text(encoding="utf-8")
if begin in text:
    start = text.index(begin)
    stop = text.index(end, start) + len(end)
    text = text[:start] + block.rstrip() + text[stop:]
else:
    if not text.endswith("\n"):
        text += "\n"
    text += "\n" + block
path.write_text(text, encoding="utf-8")
print(f"bindings.lua: Super+Shift+Alt+N → Kite")
PY
}

install_hook() {
  if command -v omarchy >/dev/null 2>&1; then
    omarchy hook install theme-set "${ROOT}/omarchy/theme-set-hook.sh" || true
  else
    echo "Note: omarchy CLI not found; skip theme-set hook."
  fi
}

install_web
install_bins
install_plugin
patch_shell_json
patch_bindings
install_hook
"${SYNC_DST}" || true

echo
echo "Kite is installed."
echo "  Open: kite"
echo "  Key:  Super+Shift+Alt+N"
echo "  Bar:  wind icon (restart the shell if it is missing)"
echo
echo "  omarchy restart shell"
