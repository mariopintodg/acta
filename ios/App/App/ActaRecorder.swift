import Foundation
import AVFoundation
import UIKit
import Capacitor

/// Grabadora nativa de Acta.
/// Sigue grabando con la pantalla bloqueada o mientras usas otra app (WhatsApp, correo, etc.),
/// gracias al modo de audio en segundo plano. Guarda el audio en partes de pocos minutos (AAC .m4a)
/// para que la transcripción en paralelo funcione igual que en la versión web.
/// Si una llamada o un audio de WhatsApp ocupa el micrófono, se pausa y retoma solo al terminar.
@objc(ActaRecorderPlugin)
public class ActaRecorderPlugin: CAPPlugin, CAPBridgedPlugin, AVAudioRecorderDelegate {
    public let identifier = "ActaRecorderPlugin"
    public let jsName = "ActaRecorder"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listParts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteRecording", returnType: CAPPluginReturnPromise)
    ]

    private enum State: String { case idle, recording, paused, interrupted }

    private var state: State = .idle
    private var recorder: AVAudioRecorder?
    private var recId = ""
    private var dir: URL?
    private var part = 0
    private var partSec: Double = 300
    private var bitrate = 32000
    private var doneSec: Double = 0          // segundos ya cerrados (partes anteriores)
    private var parts: [[String: Any]] = []  // partes cerradas
    private var levelTimer: Timer?
    private var rotateTimer: Timer?
    private var resumeWhenActive = false
    private var observersOn = false

    // MARK: - API para JavaScript

    @objc func start(_ call: CAPPluginCall) {
        if state != .idle { call.reject("Ya hay una grabación en curso"); return }
        AVAudioSession.sharedInstance().requestRecordPermission { granted in
            DispatchQueue.main.async {
                guard granted else { call.reject("Acta necesita permiso para usar el micrófono. Actívalo en Ajustes › Acta › Micrófono.", "NotAllowedError"); return }
                self.recId = call.getString("id") ?? UUID().uuidString
                self.partSec = call.getDouble("partSec") ?? 300
                self.bitrate = call.getInt("bitrate") ?? 32000
                self.part = 0; self.doneSec = 0; self.parts = []
                do {
                    let base = try FileManager.default.url(for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
                    let d = base.appendingPathComponent("rec/\(self.recId)", isDirectory: true)
                    try FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
                    self.dir = d
                    try self.activateSession()
                    try self.beginPart()
                } catch {
                    call.reject("No se pudo iniciar la grabación: \(error.localizedDescription)"); return
                }
                self.state = .recording
                self.addObservers()
                self.startTimers()
                call.resolve(["id": self.recId])
            }
        }
    }

    @objc func pause(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if self.state == .recording { self.recorder?.pause(); self.state = .paused }
            call.resolve(self.statusDict())
        }
    }

    @objc func resume(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if self.state == .paused || self.state == .interrupted {
                do { try self.activateSession(); try self.resumeOrNewPart(); self.state = .recording }
                catch { call.reject("No se pudo retomar: \(error.localizedDescription)"); return }
            }
            call.resolve(self.statusDict())
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if self.state == .idle { call.resolve(["parts": [Any](), "duration": 0]); return }
            self.closePart(notify: false)
            self.stopTimers(); self.removeObservers()
            self.state = .idle; self.resumeWhenActive = false
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            call.resolve(["id": self.recId, "parts": self.parts, "duration": self.doneSec])
        }
    }

    @objc func status(_ call: CAPPluginCall) {
        DispatchQueue.main.async { call.resolve(self.statusDict()) }
    }

    /// Lista las partes guardadas de una grabación (sirve para recuperar si la app se cerró).
    @objc func listParts(_ call: CAPPluginCall) {
        guard let id = call.getString("id"),
              let base = try? FileManager.default.url(for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: false) else { call.resolve(["parts": [Any]()]); return }
        let d = base.appendingPathComponent("rec/\(id)", isDirectory: true)
        let files = ((try? FileManager.default.contentsOfDirectory(at: d, includingPropertiesForKeys: nil)) ?? [])
            .filter { $0.pathExtension == "m4a" }
            .sorted { $0.lastPathComponent.localizedStandardCompare($1.lastPathComponent) == .orderedAscending }
        var out: [[String: Any]] = []; var off: Double = 0
        for (i, f) in files.enumerated() {
            let dur = CMTimeGetSeconds(AVURLAsset(url: f).duration)
            let secs = dur.isFinite ? dur : 0
            if secs < 0.3 { continue }
            out.append(["part": i, "path": f.absoluteString, "offset": off, "duration": secs])
            off += secs
        }
        call.resolve(["parts": out, "duration": off])
    }

    @objc func deleteRecording(_ call: CAPPluginCall) {
        if let id = call.getString("id"),
           let base = try? FileManager.default.url(for: .documentDirectory, in: .userDomainMask, appropriateFor: nil, create: false) {
            try? FileManager.default.removeItem(at: base.appendingPathComponent("rec/\(id)", isDirectory: true))
        }
        call.resolve()
    }

    // MARK: - Grabación

    private func activateSession() throws {
        let s = AVAudioSession.sharedInstance()
        // mixWithOthers: escuchar un audio de WhatsApp o un video no corta la grabación.
        try s.setCategory(.playAndRecord, mode: .default, options: [.mixWithOthers, .allowBluetooth, .defaultToSpeaker])
        try s.setActive(true)
    }

    private func currentSec() -> Double { doneSec + (recorder?.currentTime ?? 0) }

    private func beginPart() throws {
        guard let d = dir else { return }
        let url = d.appendingPathComponent(String(format: "part-%03d.m4a", part))
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 22050,
            AVNumberOfChannelsKey: 1,
            AVEncoderBitRateKey: bitrate,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue
        ]
        let r = try AVAudioRecorder(url: url, settings: settings)
        r.delegate = self
        r.isMeteringEnabled = true
        guard r.record() else { throw NSError(domain: "Acta", code: 1, userInfo: [NSLocalizedDescriptionKey: "El micrófono está ocupado por otra app"]) }
        recorder = r
    }

    /// Cierra la parte actual y avisa a JavaScript para que la guarde.
    private func closePart(notify: Bool = true) {
        guard let r = recorder else { return }
        let dur = r.currentTime
        r.stop(); recorder = nil
        if dur >= 0.3 {
            let info: [String: Any] = ["part": part, "path": r.url.absoluteString, "offset": doneSec, "duration": dur]
            parts.append(info)
            doneSec += dur
            if notify { notifyListeners("partSaved", data: info) }
        } else {
            try? FileManager.default.removeItem(at: r.url)
        }
        part += 1
    }

    private func resumeOrNewPart() throws {
        if let r = recorder, r.record() { return }
        closePart()
        try beginPart()
    }

    private func rotate() {
        guard state == .recording, let r = recorder, r.currentTime >= partSec else { return }
        closePart()
        do { try beginPart() } catch { interrupt(reason: "No se pudo continuar la grabación") }
    }

    private func interrupt(reason: String) {
        guard state == .recording else { return }
        closePart()
        state = .interrupted
        notifyListeners("interrupted", data: ["reason": reason, "at": doneSec])
    }

    private func tryResumeAfterInterruption() {
        guard state == .interrupted else { return }
        do {
            try activateSession()
            try beginPart()
            state = .recording; resumeWhenActive = false
            notifyListeners("resumed", data: ["at": doneSec])
        } catch {
            // iOS a veces no deja retomar el micrófono desde segundo plano: lo hacemos al volver a Acta.
            resumeWhenActive = true
        }
    }

    // MARK: - Temporizadores

    private func startTimers() {
        stopTimers()
        levelTimer = Timer.scheduledTimer(withTimeInterval: 0.12, repeats: true) { [weak self] _ in
            guard let self = self, UIApplication.shared.applicationState == .active else { return }
            var level: Double = 0
            if self.state == .recording, let r = self.recorder {
                r.updateMeters()
                let db = Double(r.averagePower(forChannel: 0))        // -160 … 0
                level = max(0, min(1, (db + 55) / 50))
            }
            self.notifyListeners("level", data: ["level": level, "elapsed": self.currentSec(), "state": self.state.rawValue])
        }
        rotateTimer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in self?.rotate() }
        RunLoop.main.add(levelTimer!, forMode: .common); RunLoop.main.add(rotateTimer!, forMode: .common)
    }

    private func stopTimers() { levelTimer?.invalidate(); rotateTimer?.invalidate(); levelTimer = nil; rotateTimer = nil }

    // MARK: - Interrupciones del sistema (llamadas, audios de WhatsApp, Siri)

    private func addObservers() {
        guard !observersOn else { return }; observersOn = true
        let nc = NotificationCenter.default
        nc.addObserver(self, selector: #selector(onInterruption(_:)), name: AVAudioSession.interruptionNotification, object: nil)
        nc.addObserver(self, selector: #selector(onMediaReset), name: AVAudioSession.mediaServicesWereResetNotification, object: nil)
        nc.addObserver(self, selector: #selector(onActive), name: UIApplication.didBecomeActiveNotification, object: nil)
    }

    private func removeObservers() { if observersOn { NotificationCenter.default.removeObserver(self); observersOn = false } }

    @objc private func onInterruption(_ n: Notification) {
        guard let raw = n.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        DispatchQueue.main.async {
            if type == .began {
                self.interrupt(reason: "Otra app ocupó el micrófono")
            } else {
                // Terminó la llamada o el audio: retomamos sin esperar al usuario.
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { self.tryResumeAfterInterruption() }
            }
        }
    }

    @objc private func onMediaReset() {
        DispatchQueue.main.async {
            if self.state == .recording { self.recorder = nil; self.state = .interrupted }
            self.tryResumeAfterInterruption()
        }
    }

    @objc private func onActive() {
        DispatchQueue.main.async { if self.state == .interrupted || self.resumeWhenActive { self.tryResumeAfterInterruption() } }
    }

    public func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
        DispatchQueue.main.async { self.interrupt(reason: "Error del micrófono") }
    }

    private func statusDict() -> [String: Any] {
        ["state": state.rawValue, "id": recId, "elapsed": currentSec(), "part": part, "parts": parts]
    }
}

/// Controlador principal: registra la grabadora nativa en el puente de Capacitor.
class ActaViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(ActaRecorderPlugin())
        overrideUserInterfaceStyle = .dark
        view.backgroundColor = UIColor(red: 7/255, green: 8/255, blue: 13/255, alpha: 1)
        webView?.isOpaque = false
        webView?.backgroundColor = view.backgroundColor
        webView?.scrollView.backgroundColor = view.backgroundColor
    }
    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
}
