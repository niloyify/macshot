// TouchKit input helper for macOS.
// Reads one command per line on stdin and moves the mouse, presses keys,
// or arranges windows. Started by TouchKit; needs the Accessibility permission.
//
//   move DX DY | click left|right|double | down | up | scroll DX DY
//   key NAME   | combo cmd+shift+4       | type TEXT
//   snap left|right|top|bottom|max|center | trusted | prompt

import AppKit
import ApplicationServices

setvbuf(stdout, nil, _IOLBF, 0)
var mouseDown = false

func post(_ e: CGEvent?) { e?.post(tap: .cghidEventTap) }

func location() -> CGPoint { CGEvent(source: nil)?.location ?? .zero }

func screenBounds() -> CGRect {
    var r = CGRect.null
    for s in NSScreen.screens { r = r.union(s.frame) }
    return r
}

func move(_ dx: Double, _ dy: Double) {
    let b = screenBounds()
    var p = location()
    p.x = min(max(p.x + dx, b.minX), b.maxX - 1)
    p.y = min(max(p.y + dy, b.minY), b.maxY - 1)
    let type: CGEventType = mouseDown ? .leftMouseDragged : .mouseMoved
    post(CGEvent(mouseEventSource: nil, mouseType: type, mouseCursorPosition: p, mouseButton: .left))
}

func click(_ kind: String) {
    let p = location()
    let right = kind == "right"
    let (d, u, btn): (CGEventType, CGEventType, CGMouseButton) =
        right ? (.rightMouseDown, .rightMouseUp, .right) : (.leftMouseDown, .leftMouseUp, .left)
    let times = kind == "double" ? 2 : 1
    for i in 1...times {
        let down = CGEvent(mouseEventSource: nil, mouseType: d, mouseCursorPosition: p, mouseButton: btn)
        let up = CGEvent(mouseEventSource: nil, mouseType: u, mouseCursorPosition: p, mouseButton: btn)
        down?.setIntegerValueField(.mouseEventClickState, value: Int64(i))
        up?.setIntegerValueField(.mouseEventClickState, value: Int64(i))
        post(down); post(up)
    }
}

func button(_ down: Bool) {
    mouseDown = down
    let p = location()
    post(CGEvent(mouseEventSource: nil, mouseType: down ? .leftMouseDown : .leftMouseUp,
                 mouseCursorPosition: p, mouseButton: .left))
}

func scroll(_ dx: Double, _ dy: Double) {
    post(CGEvent(scrollWheelEvent2Source: nil, units: .pixel, wheelCount: 2,
                 wheel1: Int32(dy), wheel2: Int32(dx), wheel3: 0))
}

// Media and brightness keys (NX_KEYTYPE_*).
func systemKey(_ code: Int) {
    for down in [true, false] {
        let flags = NSEvent.ModifierFlags(rawValue: down ? 0xa00 : 0xb00)
        let data1 = (code << 16) | ((down ? 0xa : 0xb) << 8)
        let e = NSEvent.otherEvent(with: .systemDefined, location: .zero, modifierFlags: flags,
                                   timestamp: 0, windowNumber: 0, context: nil, subtype: 8,
                                   data1: data1, data2: -1)
        e?.cgEvent?.post(tap: .cghidEventTap)
    }
}

let keyCodes: [String: CGKeyCode] = [
    "a": 0, "s": 1, "d": 2, "f": 3, "h": 4, "g": 5, "z": 6, "x": 7, "c": 8, "v": 9, "b": 11,
    "q": 12, "w": 13, "e": 14, "r": 15, "y": 16, "t": 17, "1": 18, "2": 19, "3": 20, "4": 21,
    "6": 22, "5": 23, "9": 25, "7": 26, "8": 28, "0": 29, "o": 31, "u": 32, "i": 34, "p": 35,
    "l": 37, "j": 38, "k": 40, "n": 45, "m": 46,
    "enter": 36, "tab": 48, "space": 49, "backspace": 51, "esc": 53, "delete": 117,
    "left": 123, "right": 124, "down": 125, "up": 126, "home": 115, "end": 119,
    "pageup": 116, "pagedown": 121, "f11": 103,
]

func pressKey(_ code: CGKeyCode, _ flags: CGEventFlags = []) {
    let d = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: true)
    let u = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: false)
    d?.flags = flags; u?.flags = flags
    post(d); post(u)
}

func combo(_ spec: String) {
    var flags: CGEventFlags = []
    var key = ""
    for part in spec.lowercased().split(separator: "+") {
        switch part {
        case "cmd": flags.insert(.maskCommand)
        case "ctrl": flags.insert(.maskControl)
        case "alt", "option": flags.insert(.maskAlternate)
        case "shift": flags.insert(.maskShift)
        default: key = String(part)
        }
    }
    if let c = keyCodes[key] { pressKey(c, flags) }
}

func open(_ app: String) {
    let p = Process()
    p.executableURL = URL(fileURLWithPath: "/usr/bin/open")
    p.arguments = ["-a", app]
    try? p.run()
}

func key(_ name: String) {
    switch name {
    case "volup": systemKey(0)
    case "voldown": systemKey(1)
    case "mute": systemKey(7)
    case "brightup": systemKey(2)
    case "brightdown": systemKey(3)
    case "play": systemKey(16)
    case "next": systemKey(17)
    case "prev": systemKey(18)
    case "missioncontrol": open("Mission Control")
    case "launchpad": open("Launchpad")
    case "desktop": pressKey(103)                       // F11: show desktop
    case "search": combo("cmd+space")                   // Spotlight
    case "screenshot": combo("cmd+shift+4")
    case "lock": combo("ctrl+cmd+q")
    case "copy": combo("cmd+c")
    case "paste": combo("cmd+v")
    case "undo": combo("cmd+z")
    case "switchapp": combo("cmd+tab")
    case "closewin": combo("cmd+w")
    default: if let c = keyCodes[name] { pressKey(c) }
    }
}

func type(_ text: String) {
    for ch in text {
        if ch == "\n" { pressKey(36); continue }
        var units = Array(String(ch).utf16)
        for down in [true, false] {
            let e = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: down)
            e?.keyboardSetUnicodeString(stringLength: units.count, unicodeString: &units)
            post(e)
        }
    }
}

// Move the front window to a half / full / centred position on its screen.
func snap(_ where_: String) {
    guard let app = NSWorkspace.shared.frontmostApplication else { return }
    let ax = AXUIElementCreateApplication(app.processIdentifier)
    var winRef: CFTypeRef?
    guard AXUIElementCopyAttributeValue(ax, kAXFocusedWindowAttribute as CFString, &winRef) == .success,
          let win = winRef else { print("err no-window"); return }
    let w = win as! AXUIElement
    let screen = NSScreen.main ?? NSScreen.screens[0]
    let full = NSScreen.screens[0].frame
    let v = screen.visibleFrame
    // AX uses a top-left origin.
    var r = CGRect(x: v.minX, y: full.maxY - v.maxY, width: v.width, height: v.height)
    switch where_ {
    case "left": r.size.width /= 2
    case "right": r.size.width /= 2; r.origin.x += r.size.width
    case "top": r.size.height /= 2
    case "bottom": r.size.height /= 2; r.origin.y += r.size.height
    case "center": r = r.insetBy(dx: r.width * 0.15, dy: r.height * 0.1)
    default: break
    }
    var pos = r.origin, size = r.size
    if let p = AXValueCreate(.cgPoint, &pos) { AXUIElementSetAttributeValue(w, kAXPositionAttribute as CFString, p) }
    if let s = AXValueCreate(.cgSize, &size) { AXUIElementSetAttributeValue(w, kAXSizeAttribute as CFString, s) }
}

while let line = readLine() {
    let parts = line.split(separator: " ", maxSplits: 2).map(String.init)
    guard let cmd = parts.first else { continue }
    let a = parts.count > 1 ? parts[1] : ""
    let b = parts.count > 2 ? parts[2] : ""
    switch cmd {
    case "move": move(Double(a) ?? 0, Double(b) ?? 0)
    case "click": click(a)
    case "down": button(true)
    case "up": button(false)
    case "scroll": scroll(Double(a) ?? 0, Double(b) ?? 0)
    case "key": key(a)
    case "combo": combo(a)
    case "type": type(String(line.dropFirst(5)))
    case "snap": snap(a)
    case "trusted": print(AXIsProcessTrusted() ? "trusted 1" : "trusted 0")
    case "prompt":
        let opts = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        print(AXIsProcessTrustedWithOptions(opts) ? "trusted 1" : "trusted 0")
    default: print("err unknown \(cmd)")
    }
}
