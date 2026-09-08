import QtQuick
import qs.Ui

// Marketplace bar-widget: Loader → Panel.qml, injectPanel, togglePanel.
BarWidget {
    id: root
    moduleName: "io.github.hurlydesousa.kite"

    function injectPanel() {
        var target = panelLoader.item
        if (!target) return
        if ("bar" in target) target.bar = root.bar
        if ("settings" in target) target.settings = root.settings
        if ("anchorItem" in target) target.anchorItem = button
        if ("hostWidget" in target) target.hostWidget = root
    }

    function togglePanel() {
        if (panelLoader.item && panelLoader.item.toggle) panelLoader.item.toggle()
    }

    function toggle() {
        root.togglePanel()
    }

    readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false

    function open() {
        if (panelLoader.item && panelLoader.item.openFromHotkey)
            panelLoader.item.openFromHotkey()
        else if (panelLoader.item && panelLoader.item.open)
            panelLoader.item.open()
    }

    function close() {
        if (panelLoader.item && panelLoader.item.close) panelLoader.item.close()
    }

    readonly property bool popoutSwitchClosing: panelLoader.item
        ? panelLoader.item.popoutSwitchClosing === true : false

    function closeForPopoutSwitch() {
        if (panelLoader.item) panelLoader.item.closeForPopoutSwitch()
    }

    implicitWidth: button.implicitWidth
    implicitHeight: button.implicitHeight

    onBarChanged: injectPanel()
    onSettingsChanged: injectPanel()

    Loader {
        id: panelLoader
        active: true
        source: Qt.resolvedUrl("Panel.qml")
        visible: false
        onLoaded: {
            root.injectPanel()
            Qt.callLater(root.injectPanel)
        }
    }

    BarIconButton {
        id: button
        bar: root.bar
        text: "󰠳"
        tooltipText: "Kite"
        onPressed: function(b) {
            if (b !== Qt.RightButton) root.togglePanel()
        }
    }
}
