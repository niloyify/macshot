import Cocoa
import ScreenCaptureKit
import AVFoundation

// Screen recording for MacShot: records the main display with the
// computer's own sound (music, videos) and the microphone into one .mov
// file, using macOS's ScreenCaptureKit. Needs macOS 15 or later.

let recordingsDir = FileManager.default.homeDirectoryForCurrentUser
    .appendingPathComponent("ScreenshotTool/Recordings", isDirectory: true)

enum RecorderError: LocalizedError {
    case noDisplay
    var errorDescription: String? { "No screen was found to record." }
}

@available(macOS 15.0, *)
final class ScreenRecorder: NSObject, SCStreamDelegate, SCRecordingOutputDelegate {
    private var stream: SCStream?
    private var output: SCRecordingOutput?
    private(set) var file: URL?
    private var finished = false

    /// Called once on the main thread when the recording ends:
    /// the saved file, or the error that stopped it.
    var onFinish: ((URL?, Error?) -> Void)?

    var isRecording: Bool { stream != nil }

    func start(microphone: Bool) async throws {
        try FileManager.default.createDirectory(at: recordingsDir, withIntermediateDirectories: true)
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd 'at' HH.mm.ss"
        let url = recordingsDir.appendingPathComponent("Recording \(formatter.string(from: Date())).mov")

        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        guard let display = content.displays.first(where: { $0.displayID == CGMainDisplayID() })
                ?? content.displays.first else { throw RecorderError.noDisplay }

        let filter = SCContentFilter(display: display, excludingWindows: [])
        let config = SCStreamConfiguration()
        let scale = NSScreen.screens.first { screen in
            (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? CGDirectDisplayID) == display.displayID
        }?.backingScaleFactor ?? 2
        config.width = Int(CGFloat(display.width) * scale)
        config.height = Int(CGFloat(display.height) * scale)
        config.minimumFrameInterval = CMTime(value: 1, timescale: 30)   // 30 frames a second
        config.showsCursor = true
        config.capturesAudio = true                 // the Mac's own sound
        config.excludesCurrentProcessAudio = true
        config.captureMicrophone = microphone       // your voice

        let stream = SCStream(filter: filter, configuration: config, delegate: self)
        let recordingConfig = SCRecordingOutputConfiguration()
        recordingConfig.outputURL = url
        recordingConfig.outputFileType = .mov
        recordingConfig.videoCodecType = .hevc      // small files, good quality
        let output = SCRecordingOutput(configuration: recordingConfig, delegate: self)
        try stream.addRecordingOutput(output)
        try await stream.startCapture()

        self.stream = stream
        self.output = output
        self.file = url
        self.finished = false
    }

    func stop() {
        guard let stream else { return }
        Task { try? await stream.stopCapture() }
    }

    private func finish(_ error: Error?) {
        DispatchQueue.main.async {
            guard !self.finished else { return }
            self.finished = true
            let file = self.file
            self.stream = nil
            self.output = nil
            let saved = file.map { FileManager.default.fileExists(atPath: $0.path) } ?? false
            self.onFinish?(saved ? file : nil, error)
        }
    }

    // MARK: SCRecordingOutputDelegate

    func recordingOutputDidFinishRecording(_ recordingOutput: SCRecordingOutput) {
        finish(nil)
    }

    func recordingOutput(_ recordingOutput: SCRecordingOutput, didFailWithError error: Error) {
        finish(error)
    }

    // MARK: SCStreamDelegate

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        finish(error)
    }
}

// Sound recording for MacShot: records only the microphone (the sound
// around you, like a class or a party) into an .m4a file. Works on macOS 13+.
final class SoundRecorder: NSObject, AVAudioRecorderDelegate {
    private var recorder: AVAudioRecorder?
    private(set) var file: URL?
    var onFinish: ((URL?) -> Void)?

    var isRecording: Bool { recorder?.isRecording ?? false }

    func start() throws {
        try FileManager.default.createDirectory(at: recordingsDir, withIntermediateDirectories: true)
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd 'at' HH.mm.ss"
        let url = recordingsDir.appendingPathComponent("Sound \(formatter.string(from: Date())).m4a")
        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: 44100,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
        ]
        let recorder = try AVAudioRecorder(url: url, settings: settings)
        recorder.delegate = self
        guard recorder.record() else {
            throw NSError(domain: "MacShot", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "The microphone could not start."])
        }
        self.recorder = recorder
        self.file = url
    }

    func stop() { recorder?.stop() }

    func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        DispatchQueue.main.async {
            let file = self.file
            self.recorder = nil
            let saved = file.map { FileManager.default.fileExists(atPath: $0.path) } ?? false
            self.onFinish?(saved ? file : nil)
        }
    }
}
