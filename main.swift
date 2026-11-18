import Cocoa
import Carbon.HIToolbox
import AVFoundation

// MacShot: a tiny menu bar screenshot tool.
// Captures an area, a window, or the full screen with macOS's own
// `screencapture`, saves the PNG to ~/ScreenshotTool/Screenshots and
// copies it to the clipboard. It also records the screen (recorder.swift).

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

        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = statusItem.button {
            button.setAccessibilityLabel("MacShot")
            button.image = eyesImage(look: .zero, open: 1)
        }
        startEyes()

        let menu = NSMenu()
        menu.addItem(item("Capture Area", #selector(captureArea), "1"))
        menu.addItem(item("Capture Window", #selector(captureWindow), "2"))
        menu.addItem(item("Capture Full Screen", #selector(captureFull), "3"))
        menu.addItem(.separator())
        recordItem = item("Start Recording", #selector(toggleRecording), "5")
        if #unavailable(macOS 15) {
            recordItem.title = "Start Recording (needs macOS 15)"
            recordItem.action = nil
        }
        menu.addItem(recordItem)
        menu.addItem(.separator())
        menu.addItem(item("Open Screenshots Folder", #selector(openFolder), "o"))
        menu.addItem(item("Open Recordings Folder", #selector(openRecordings), "r"))
        menu.addItem(.separator())
        menu.addItem(item("Quit MacShot", #selector(quit), "q"))
        statusItem.menu = menu

        // `--test-full` takes one full-screen capture and quits (used to verify the build).
        if CommandLine.arguments.contains("--test-full") {
            FileHandle.standardError.write(
                "screen permission: \(CGPreflightScreenCaptureAccess())\n".data(using: .utf8)!)
            capture(.full) { _ in NSApp.terminate(nil) }
        } else if let i = CommandLine.arguments.firstIndex(of: "--test-record") {
            // `--test-record N` records N seconds (default 5), prints the file and quits.
            let seconds = CommandLine.arguments.dropFirst(i + 1).first.flatMap(Double.init) ?? 5
            testRecording(seconds: seconds)
        } else {
            registerHotKeys()
            // Ask macOS for Screen Recording permission up front, so the
            // prompt appears at launch instead of on the first capture.
            if !CGPreflightScreenCaptureAccess() {
                CGRequestScreenCaptureAccess()
            }
        }
    }

    // MARK: Animated eyes in the menu bar

    var look = CGPoint.zero        // where the pupils point, each axis -1...1
    var eyeOpen: CGFloat = 1       // 1 = open, 0 = closed
    var blinkStart: Date?
    var nextBlink = Date().addingTimeInterval(3)

    /// The eyes follow the mouse pointer and blink every few seconds.
    func startEyes() {
        let timer = Timer(timeInterval: 1.0 / 20.0, repeats: true) { [weak self] _ in
            self?.updateEyes()
        }
        RunLoop.main.add(timer, forMode: .common) // keeps moving while the menu is open
    }

    func updateEyes() {
        guard let button = statusItem.button, let window = button.window else { return }
        let frame = window.convertToScreen(button.convert(button.bounds, to: nil))
        let mouse = NSEvent.mouseLocation
        let dx = mouse.x - frame.midX, dy = mouse.y - frame.midY
        let distance = max(sqrt(dx * dx + dy * dy), 1)
        let reach = min(distance / 150, 1)
        let target = CGPoint(x: dx / distance * reach, y: dy / distance * reach)

        let now = Date()
        if blinkStart == nil, now >= nextBlink { blinkStart = now }
        var open: CGFloat = 1
        if let start = blinkStart {
            let t = now.timeIntervalSince(start) / 0.25   // one blink takes a quarter second
            if t >= 1 {
                blinkStart = nil
                nextBlink = now.addingTimeInterval(Double.random(in: 3...7))
            } else {
                open = CGFloat(abs(t * 2 - 1))            // close, then open again
            }
        }

        // Redraw only when something changed, so the app stays idle otherwise.
        if abs(target.x - look.x) < 0.02, abs(target.y - look.y) < 0.02, open == eyeOpen,
           drawnRecording == isRecording { return }
        look = target
        eyeOpen = open
        drawnRecording = isRecording
        button.image = eyesImage(look: look, open: open)
    }

    var drawnRecording = false

    /// Two eyes on a blue rounded square, like the app icon.
    /// The square turns red while the screen is being recorded.
    func eyesImage(look: CGPoint, open: CGFloat) -> NSImage {
        let red = isRecording
        let image = NSImage(size: NSSize(width: 28, height: 20), flipped: false) { rect in
            (red ? NSColor(red: 0.90, green: 0.16, blue: 0.16, alpha: 1)
                 : NSColor(red: 0.20, green: 0.47, blue: 0.96, alpha: 1)).setFill()
            NSBezierPath(roundedRect: rect, xRadius: 5.5, yRadius: 5.5).fill()

            for centerX in [CGFloat(8.5), CGFloat(19.5)] {
                let eyeWidth: CGFloat = 8.5
                let eyeHeight = max(13 * open, 1.5)
                let eye = NSRect(x: centerX - eyeWidth / 2, y: 10 - eyeHeight / 2,
                                 width: eyeWidth, height: eyeHeight)
                let outline = NSBezierPath(ovalIn: eye)
                NSColor.white.setFill()
                outline.fill()

                NSGraphicsContext.saveGraphicsState()
                outline.addClip() // the closing lid hides the iris
                let iris = NSRect(x: centerX + look.x * 1.7 - 2.6, y: 10 + look.y * 3.2 - 2.6,
                                  width: 5.2, height: 5.2)
                NSColor(red: 0.55, green: 0.27, blue: 0.07, alpha: 1).setFill()
                NSBezierPath(ovalIn: iris).fill()
                NSColor.black.setFill()
                NSBezierPath(ovalIn: iris.insetBy(dx: 1.2, dy: 1.2)).fill()
                NSColor.white.setFill()
                NSBezierPath(ovalIn: NSRect(x: iris.midX + 0.2, y: iris.midY + 0.2,
                                            width: 1.3, height: 1.3)).fill()
                NSGraphicsContext.restoreGraphicsState()
            }
            return true
        }
        image.isTemplate = false
        return image
    }

    func item(_ title: String, _ action: Selector, _ key: String) -> NSMenuItem {
        let menuItem = NSMenuItem(title: title, action: action, keyEquivalent: key)
        menuItem.target = self
        // These items show their global shortcut: Option+Shift+1/2/3/5.
        if ["1", "2", "3", "5"].contains(key) {
            menuItem.keyEquivalentModifierMask = [.option, .shift]
        }
        return menuItem
    }

    /// Global shortcuts that work from any app: Option+Shift+1 (area),
    /// Option+Shift+2 (window), Option+Shift+3 (full screen),
    /// Option+Shift+5 (start or stop screen recording).
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
                case 5: app.toggleRecording()
                default: break
                }
            }
            return noErr
        }, 1, &spec, nil, nil)

        let keys: [(UInt32, Int)] = [(1, kVK_ANSI_1), (2, kVK_ANSI_2), (3, kVK_ANSI_3), (5, kVK_ANSI_5)]
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
    @objc func openRecordings() {
        try? FileManager.default.createDirectory(at: recordingsDir, withIntermediateDirectories: true)
        NSWorkspace.shared.open(recordingsDir)
    }
    @objc func quit() {
        // Save a running recording before quitting.
        if isRecording, #available(macOS 15, *), let recorder = recorder as? ScreenRecorder {
            recorder.onFinish = { _, _ in NSApp.terminate(nil) }
            recorder.stop()
            DispatchQueue.main.asyncAfter(deadline: .now() + 5) { NSApp.terminate(nil) }
            return
        }
        NSApp.terminate(nil)
    }

    // MARK: Screen recording

    var recordItem: NSMenuItem!
    var recorder: AnyObject?   // a ScreenRecorder on macOS 15 and later
    var isRecording: Bool {
        if #available(macOS 15, *) { return (recorder as? ScreenRecorder)?.isRecording ?? false }
        return false
    }

    @objc func toggleRecording() {
        guard #available(macOS 15, *) else { return }
        let recorder = (self.recorder as? ScreenRecorder) ?? ScreenRecorder()
        self.recorder = recorder
        if recorder.isRecording {
            recorder.stop()
            return
        }
        recorder.onFinish = { [weak self] file, error in
            self?.recordItem.title = "Start Recording"
            if let file {
                NSWorkspace.shared.activateFileViewerSelecting([file])
            } else if let error {
                self?.showRecordingError(error)
            }
        }
        recordItem.title = "Starting…"
        // Ask for the microphone first; record without it if the user says no.
        AVCaptureDevice.requestAccess(for: .audio) { micAllowed in
            Task { @MainActor in
                do {
                    try await recorder.start(microphone: micAllowed)
                    self.recordItem.title = "Stop Recording"
                } catch {
                    self.recordItem.title = "Start Recording"
                    self.showRecordingError(error)
                }
            }
        }
    }

    func showRecordingError(_ error: Error) {
        let alert = NSAlert()
        alert.messageText = "MacShot could not record the screen"
        alert.informativeText = error.localizedDescription
            + "\n\nCheck that MacShot is allowed under System Settings → Privacy & Security → Screen & System Audio Recording (and Microphone)."
        alert.addButton(withTitle: "Open Settings")
        alert.addButton(withTitle: "Cancel")
        NSApp.activate(ignoringOtherApps: true)
        if alert.runModal() == .alertFirstButtonReturn,
           let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture") {
            NSWorkspace.shared.open(url)
        }
    }

    func testRecording(seconds: Double) {
        func log(_ text: String) { FileHandle.standardError.write((text + "\n").data(using: .utf8)!) }
        guard #available(macOS 15, *) else { log("needs macOS 15"); exit(2) }
        let recorder = ScreenRecorder()
        self.recorder = recorder
        recorder.onFinish = { file, error in
            log("finished: \(file?.path ?? "no file") \(error.map { "\($0)" } ?? "")")
            exit(file == nil ? 1 : 0)
        }
        Task { @MainActor in
            do {
                try await recorder.start(microphone: AVCaptureDevice.authorizationStatus(for: .audio) == .authorized)
                log("recording to \(recorder.file!.path)")
                DispatchQueue.main.asyncAfter(deadline: .now() + seconds) { recorder.stop() }
            } catch {
                log("start failed: \(error)")
                exit(1)
            }
        }
    }

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
        alert.messageText = "MacShot could not capture the screen"
        alert.informativeText = "Allow MacShot under System Settings → Privacy & Security → Screen & System Audio Recording, then try again."
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
