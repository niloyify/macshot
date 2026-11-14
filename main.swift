import Cocoa
import Carbon.HIToolbox

// Shot: a tiny menu bar screenshot tool.
// Captures an area, a window, or the full screen with macOS's own
// `screencapture`, saves the PNG to ~/ScreenshotTool/Screenshots and
// copies it to the clipboard.

let saveDir = FileManager.default.homeDirectoryForCurrentUser
    .appendingPathComponent("ScreenshotTool/Screenshots", isDirectory: true)

enum Mode {
    case area, window, full

    var arguments: [String] {
        switch self {
        case .area: return ["-i", "-x"]          // drag to select
        case .window: return ["-i", "-w", "-x"]  // click a window
        case .full: return ["-x"]                // everything, no sound
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    var statusItem: NSStatusItem!

    func applicationDidFinishLaunching(_ notification: Notification) {
        try? FileManager.default.createDirectory(at: saveDir, withIntermediateDirectories: true)

        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if let button = statusItem.button {
            button.image = NSImage(systemSymbolName: "camera.viewfinder",
                                   accessibilityDescription: "Screenshot")
        }

        let menu = NSMenu()
        menu.addItem(item("Capture Area", #selector(captureArea), "1"))
        menu.addItem(item("Capture Window", #selector(captureWindow), "2"))
        menu.addItem(item("Capture Full Screen", #selector(captureFull), "3"))
        menu.addItem(.separator())
        menu.addItem(item("Open Screenshots Folder", #selector(openFolder), "o"))
        menu.addItem(.separator())
        menu.addItem(item("Quit Shot", #selector(quit), "q"))
        statusItem.menu = menu

        // `--test-full` takes one full-screen capture and quits (used to verify the build).
        if CommandLine.arguments.contains("--test-full") {
            FileHandle.standardError.write(
                "screen permission: \(CGPreflightScreenCaptureAccess())\n".data(using: .utf8)!)
            capture(.full) { _ in NSApp.terminate(nil) }
        } else {
            registerHotKeys()
            // Ask macOS for Screen Recording permission up front, so the
            // prompt appears at launch instead of on the first capture.
            if !CGPreflightScreenCaptureAccess() {
                CGRequestScreenCaptureAccess()
            }
        }
    }

    func item(_ title: String, _ action: Selector, _ key: String) -> NSMenuItem {
        let menuItem = NSMenuItem(title: title, action: action, keyEquivalent: key)
        menuItem.target = self
        // The capture items show their global shortcut: Option+Shift+1/2/3.
        if ["1", "2", "3"].contains(key) {
            menuItem.keyEquivalentModifierMask = [.option, .shift]
        }
        return menuItem
    }

    /// Global shortcuts that work from any app: Option+Shift+1 (area),
    /// Option+Shift+2 (window), Option+Shift+3 (full screen).
    func registerHotKeys() {
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard),
                                 eventKind: UInt32(kEventHotKeyPressed))
        InstallEventHandler(GetApplicationEventTarget(), { _, event, _ in
            var hotKey = EventHotKeyID()
            GetEventParameter(event, EventParamName(kEventParamDirectObject),
                              EventParamType(typeEventHotKeyID), nil,
                              MemoryLayout<EventHotKeyID>.size, nil, &hotKey)
            let id = hotKey.id
            DispatchQueue.main.async {
                guard let app = NSApp.delegate as? AppDelegate else { return }
                switch id {
                case 1: app.capture(.area)
                case 2: app.capture(.window)
                case 3: app.capture(.full)
                default: break
                }
            }
            return noErr
        }, 1, &spec, nil, nil)

        let keys: [(UInt32, Int)] = [(1, kVK_ANSI_1), (2, kVK_ANSI_2), (3, kVK_ANSI_3)]
        for (id, keyCode) in keys {
            var ref: EventHotKeyRef?
            RegisterEventHotKey(UInt32(keyCode), UInt32(optionKey | shiftKey),
                                EventHotKeyID(signature: 0x53484F54, id: id), // "SHOT"
                                GetApplicationEventTarget(), 0, &ref)
        }
    }

    @objc func captureArea() { capture(.area) }
    @objc func captureWindow() { capture(.window) }
    @objc func captureFull() { capture(.full) }
    @objc func openFolder() { NSWorkspace.shared.open(saveDir) }
    @objc func quit() { NSApp.terminate(nil) }

    func capture(_ mode: Mode, completion: ((Bool) -> Void)? = nil) {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd 'at' HH.mm.ss"
        let file = saveDir.appendingPathComponent("Screenshot \(formatter.string(from: Date())).png")

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
        process.arguments = mode.arguments + [file.path]
        process.terminationHandler = { _ in
            DispatchQueue.main.async {
                // No file means the user pressed Esc or macOS refused the capture.
                let saved = FileManager.default.fileExists(atPath: file.path)
                if saved, let image = NSImage(contentsOf: file) {
                    let pasteboard = NSPasteboard.general
                    pasteboard.clearContents()
                    pasteboard.writeObjects([image])
                } else if mode == .full {
                    self.showPermissionHelp()
                }
                completion?(saved)
            }
        }

        // Short delay so the menu has closed before the screen is captured.
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            do { try process.run() } catch { completion?(false) }
        }
    }

    func showPermissionHelp() {
        let alert = NSAlert()
        alert.messageText = "Shot could not capture the screen"
        alert.informativeText = "Allow Shot under System Settings → Privacy & Security → Screen & System Audio Recording, then try again."
        alert.addButton(withTitle: "Open Settings")
        alert.addButton(withTitle: "Cancel")
        NSApp.activate(ignoringOtherApps: true)
        if alert.runModal() == .alertFirstButtonReturn,
           let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture") {
            NSWorkspace.shared.open(url)
        }
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory) // menu bar only, no Dock icon
app.run()
