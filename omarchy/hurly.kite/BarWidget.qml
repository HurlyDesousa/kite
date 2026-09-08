import QtQuick
import Quickshell.Io
import qs.Ui

// Omarchy bar widget: launch the Kite Nostr listening desk.
BarWidget {
    id: root
    moduleName: "hurly.kite"

    width: button.implicitWidth
    height: button.implicitHeight
    implicitWidth: button.implicitWidth
    implicitHeight: button.implicitHeight

    Process {
        id: launchProc
    }

    BarIconButton {
        id: button
        bar: root.bar
        text: "󰠳"
        tooltipText: "Kite"
        onPressed: function(b) {
            if (b !== Qt.RightButton && !launchProc.running) {
                launchProc.command = ["/bin/bash", "-c",
                    "exec kite 2>/dev/null" +
                    " || exec \"$HOME/.local/bin/kite\" 2>/dev/null || true"]
                launchProc.running = true
            }
        }
    }
}
