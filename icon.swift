import Cocoa

// Draws the MacShot app icon (the 👀 emoji on a blue rounded square)
// as a 1024x1024 PNG. Used by build.sh: swift icon.swift icon.png
let size = 1024
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
                           bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                           colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)

let tile = NSRect(x: 100, y: 100, width: 824, height: 824)
NSColor(red: 0.20, green: 0.47, blue: 0.96, alpha: 1).setFill()
NSBezierPath(roundedRect: tile, xRadius: 185, yRadius: 185).fill()

let text = "👀" as NSString
let attributes: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 560)]
let textSize = text.size(withAttributes: attributes)
text.draw(at: NSPoint(x: (CGFloat(size) - textSize.width) / 2,
                      y: (CGFloat(size) - textSize.height) / 2),
          withAttributes: attributes)

NSGraphicsContext.current?.flushGraphics()
let png = rep.representation(using: .png, properties: [:])!
try! png.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
