import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui

Panel {
    id: root
    moduleName: "io.github.hurlydesousa.kite"
    ipcTarget: "io.github.hurlydesousa.kite"
    manageIpc: false

    property var anchorItem: null
    property var hostWidget: null
    readonly property var barIdentity: hostWidget || root

    property var latest: ({ notes: [], npub: "", mode: "global", count: 0 })

    function open() {
        stateFile.reload()
        root.controller.show()
    }

    function openFromHotkey() {
        root.open()
    }

    function close() {
        root.controller.hide()
    }

    function toggle() {
        if (root.opened) root.close()
        else root.openFromHotkey()
    }

    function closeForPopoutSwitch() {
        root.close()
    }

    function switchPanel(direction) {
        if (root.bar && typeof root.bar.switchPanelFrom === "function")
            return root.bar.switchPanelFrom(root.barIdentity, direction)
        return false
    }

    function launchDesk() {
        if (!launchProc.running) launchProc.running = true
        root.close()
    }

    function parseState(text) {
        try {
            return JSON.parse(text)
        } catch (e) {
            return ({ notes: [], npub: "", mode: "global", count: 0 })
        }
    }

    FileView {
        id: stateFile
        path: Quickshell.env("HOME") + "/.local/state/kite/latest.json"
        watchChanges: true
        printErrors: false
        onFileChanged: reload()
        onLoaded: root.latest = root.parseState(text())
        onLoadFailed: root.latest = ({ notes: [], npub: "", mode: "global", count: 0 })
    }

    Timer {
        interval: 1500
        running: true
        onTriggered: stateFile.reload()
    }

    Process {
        id: launchProc
        command: ["/bin/bash", "-c",
            "exec kite 2>/dev/null" +
            " || exec \"$HOME/.local/bin/kite\" 2>/dev/null || true"]
    }

    KeyboardPanel {
        id: panel
        anchorItem: root.anchorItem
        owner: root.barIdentity
        bar: root.bar
        open: root.opened
        focusTarget: keyCatcher
        contentWidth: panel.fittedContentWidth(Style.space(280))
        contentHeight: panel.fittedContentHeight(content.implicitHeight)

        PanelKeyCatcher {
            id: keyCatcher
            anchors.fill: parent
            onCloseRequested: root.close()
            onTabRequested: function(direction) { root.switchPanel(direction) }

            Column {
                id: content
                width: parent.width
                spacing: Style.space(8)

                Text {
                    width: parent.width
                    text: "Kite"
                    color: root.barForeground
                    font.family: root.bar ? root.bar.fontFamily : Style.font.family
                    font.pixelSize: Style.font.subtitle
                    font.bold: true
                }

                Text {
                    width: parent.width
                    text: root.latest.npub
                        ? ((root.latest.mode === "follows" ? "Follow wind · " : "Open wind · ") + root.latest.npub)
                        : "Listening. Hold a string in the desk to follow people."
                    color: root.barForeground
                    opacity: 0.7
                    font.family: root.bar ? root.bar.fontFamily : Style.font.family
                    font.pixelSize: Style.font.caption
                    wrapMode: Text.WordWrap
                }

                Text {
                    visible: !(root.latest.notes && root.latest.notes.length)
                    width: parent.width
                    text: "Open the desk to fill the string."
                    color: root.barForeground
                    opacity: 0.7
                    font.family: root.bar ? root.bar.fontFamily : Style.font.family
                    font.pixelSize: Style.font.body
                    wrapMode: Text.WordWrap
                }

                Repeater {
                    model: (root.latest.notes || []).slice(0, 3)

                    Text {
                        width: content.width
                        text: (modelData.who || "note") + " — " + (modelData.content || "")
                        color: root.barForeground
                        font.family: root.bar ? root.bar.fontFamily : Style.font.family
                        font.pixelSize: Style.font.body
                        wrapMode: Text.WordWrap
                        maximumLineCount: 3
                        elide: Text.ElideRight
                    }
                }

                WidgetButton {
                    bar: root.bar
                    text: "Open desk"
                    onPressed: root.launchDesk()
                }
            }
        }
    }
}
