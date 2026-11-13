import AppKit

let danish = Locale.preferredLanguages.first?.hasPrefix("da") == true
func tr(_ da: String, _ en: String) -> String { danish ? da : en }
func nodeExecutable() -> String? {
    let paths = ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"] +
        (ProcessInfo.processInfo.environment["PATH"] ?? "").split(separator: ":").map { String($0) + "/node" }
    return paths.first { FileManager.default.isExecutableFile(atPath: $0) }
}
final class Session {
    let process = Process(), input = Pipe(), output = Pipe()
    var name = tr("Vælger wiki…", "Choosing a wiki…"), url = "", pending = Data(), stopping = false
    let row = NSStackView(), label = NSTextField(labelWithString: "")
    let copy = NSButton(title: tr("Kopiér adresse", "Copy address"), target: nil, action: nil)
    let stop = NSButton(title: tr("Stop", "Stop"), target: nil, action: nil)
}
final class App: NSObject, NSApplicationDelegate, NSWindowDelegate {
    var window: NSWindow!, rows: NSStackView!, empty: NSTextField!, start: NSButton!
    var sessions: [Session] = [], quitting = false
    func applicationDidFinishLaunching(_ notification: Notification) {
        window = NSWindow(contentRect: NSRect(x: 0,y: 0,width: 640,height: 440),
                          styleMask: [.titled,.closable,.miniaturizable,.resizable], backing: .buffered, defer: false)
        window.title = "ForgeShare"; window.minSize = NSSize(width: 560,height: 360); window.delegate = self
        let content = NSStackView(); content.orientation = .vertical; content.alignment = .leading; content.spacing = 16
        content.translatesAutoresizingMaskIntoConstraints = false; window.contentView!.addSubview(content)
        NSLayoutConstraint.activate([content.leadingAnchor.constraint(equalTo: window.contentView!.leadingAnchor,constant: 24),
          content.trailingAnchor.constraint(equalTo: window.contentView!.trailingAnchor,constant: -24),
          content.topAnchor.constraint(equalTo: window.contentView!.topAnchor,constant: 24),
          content.bottomAnchor.constraint(lessThanOrEqualTo: window.contentView!.bottomAnchor,constant: -24)])
        let title = NSTextField(labelWithString: "ForgeShare"); title.font = .systemFont(ofSize: 30,weight: .bold)
        let intro = NSTextField(wrappingLabelWithString: tr("Del dine wikier — én ad gangen eller flere sammen.", "Share your wikis — one at a time or several together."))
        intro.textColor = .secondaryLabelColor
        start = NSButton(title: tr("Start en wiki…", "Start a wiki…"),target:self,action:#selector(startWiki))
        start.bezelStyle = .rounded; start.controlSize = .large
        let heading = NSTextField(labelWithString: tr("Aktive wikier", "Active wikis")); heading.font = .boldSystemFont(ofSize: 14)
        rows = NSStackView(); rows.orientation = .vertical; rows.alignment = .leading; rows.spacing = 12
        empty = NSTextField(wrappingLabelWithString: tr("Ingen wikier kører endnu. Vælg et gemt navn, eller tilføj en wikimappe.", "No wikis are running yet. Choose a saved name or add a wiki folder.")); empty.textColor = .secondaryLabelColor
        let help = NSTextField(wrappingLabelWithString: tr("Computeren skal være tændt, mens I arbejder. Stop afslutter kun den valgte wiki. Adgang for andre styres i Tailscale.", "Keep this computer on while collaborating. Stop ends only the selected wiki. Access for other people is managed in Tailscale.")); help.font = .systemFont(ofSize: 12); help.textColor = .secondaryLabelColor
        for view in [title,intro,start,heading,empty,rows,help] as [NSView] { content.addArrangedSubview(view) }
        rows.widthAnchor.constraint(equalTo: content.widthAnchor).isActive = true
        let menu = NSMenu(), item = NSMenuItem(), appMenu = NSMenu()
        appMenu.addItem(withTitle: tr("Afslut ForgeShare", "Quit ForgeShare"),action:#selector(NSApplication.terminate(_:)),keyEquivalent:"q")
        item.submenu = appMenu; menu.addItem(item); NSApp.mainMenu = menu
        window.center(); window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps:true)
    }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows: Bool) -> Bool { window.makeKeyAndOrderFront(nil); return true }
    func windowShouldClose(_ sender: NSWindow) -> Bool { NSApp.terminate(nil); return false }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if sessions.isEmpty { return .terminateNow }
        if quitting { return .terminateLater }
        let alert = NSAlert(); alert.messageText = tr("Stop wikierne og afslut?", "Stop the wikis and quit?")
        alert.informativeText = tr("Vent på, at dine ændringer er gemt. Alle wikier startet i dette appvindue bliver stoppet.", "Wait for your edits to save. All wikis started in this app window will stop.")
        alert.addButton(withTitle:tr("Bliv her", "Keep running")); alert.addButton(withTitle:tr("Stop og afslut", "Stop and quit"))
        if alert.runModal() != .alertSecondButtonReturn { return .terminateCancel }
        quitting = true; start.isEnabled = false; sessions.forEach { stopSession($0) }; return .terminateLater
    }
    func showError(_ text: String) { let a=NSAlert(); a.messageText="ForgeShare"; a.informativeText=text; a.runModal() }
    @objc func startWiki() {
        guard let node = nodeExecutable() else {
            let a=NSAlert(); a.messageText=tr("Installer Node.js først", "Install Node.js first")
            a.informativeText=tr("Node.js er motoren til wikien. Hent installationsprogrammet fra den officielle hjemmeside, og åbn derefter ForgeShare igen.", "Node.js runs the wiki. Download its installer from the official website, then reopen ForgeShare.")
            a.addButton(withTitle:tr("Luk", "Close")); a.addButton(withTitle:tr("Hent Node.js", "Get Node.js"))
            if a.runModal() == .alertSecondButtonReturn { NSWorkspace.shared.open(URL(string:"https://nodejs.org/en/download")!) }; return
        }
        guard let helper=Bundle.main.url(forResource:"ForgeShare",withExtension:"mjs") else { showError(tr("Appen er ufuldstændig. Pak hele den originale ZIP ud igen.", "The app is incomplete. Extract the complete original ZIP again.")); return }
        let session=Session(); session.process.executableURL=URL(fileURLWithPath:node)
        session.process.arguments=[helper.path,"--gui","--app"]; session.process.currentDirectoryURL=helper.deletingLastPathComponent()
        var env=ProcessInfo.processInfo.environment; env.removeValue(forKey:"NODE_OPTIONS"); env.removeValue(forKey:"NODE_PATH")
        env["PATH"]="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"; session.process.environment=env
        session.process.standardInput=session.input; session.process.standardOutput=session.output; session.process.standardError=FileHandle.nullDevice
        session.row.orientation = .horizontal; session.row.spacing=10; session.label.lineBreakMode = .byTruncatingMiddle; session.label.maximumNumberOfLines = 2
        session.label.setContentCompressionResistancePriority(.defaultLow,for:.horizontal)
        session.row.addArrangedSubview(session.label); session.row.addArrangedSubview(session.copy); session.row.addArrangedSubview(session.stop)
        session.copy.target=self; session.copy.action=#selector(copyAddress(_:)); session.copy.isEnabled=false
        session.stop.target=self; session.stop.action=#selector(stopClicked(_:))
        session.output.fileHandleForReading.readabilityHandler = { [weak self, weak session] handle in
            let bytes=handle.availableData
            DispatchQueue.main.async { guard let self=self, let s=session, !bytes.isEmpty else { return }
                s.pending.append(bytes)
                if s.pending.count > 65536 { s.pending.removeAll(); return }
                while let end=s.pending.firstIndex(of:10) {
                    let line=s.pending.prefix(upTo:end); s.pending.removeSubrange(...end)
                    if let data=try? JSONSerialization.jsonObject(with:line) as? [String:String] {
                        if let name=data["name"] { s.name=name }
                        if data["event"] == "ready", let address=data["url"], URL(string:address)?.scheme == "https" { s.url=address; s.copy.isEnabled=true }
                        self.update(s)
                    }
                }
            }
        }
        session.process.terminationHandler = { [weak self, weak session] _ in DispatchQueue.main.async {
            guard let self=self, let s=session else { return }; s.output.fileHandleForReading.readabilityHandler=nil
            try? s.input.fileHandleForWriting.close(); self.rows.removeArrangedSubview(s.row); s.row.removeFromSuperview()
            self.sessions.removeAll { $0 === s }; self.empty.isHidden = !self.sessions.isEmpty
            if self.quitting && self.sessions.isEmpty { NSApp.reply(toApplicationShouldTerminate:true) }
        }}
        do { try session.process.run(); sessions.append(session); rows.addArrangedSubview(session.row)
            session.row.widthAnchor.constraint(equalTo:rows.widthAnchor).isActive=true; empty.isHidden=true; update(session)
        } catch { showError(tr("Wikien kunne ikke startes. Kontroller Node.js-installationen.", "The wiki could not start. Check your Node.js installation.")) }
    }
    func update(_ s: Session) { s.label.stringValue=s.name + (s.stopping ? tr(" — stopper…", " — stopping…") : s.url.isEmpty ? "" : tr(" — deler", " — sharing")); s.label.stringValue += s.url.isEmpty ? "" : "\n" + s.url; s.label.toolTip=s.url }
    func stopSession(_ s: Session) { guard !s.stopping else { return }; s.stopping=true; s.stop.isEnabled=false; update(s)
        do { try s.input.fileHandleForWriting.write(contentsOf:Data("STOP\n".utf8)) } catch { showError(tr("Kunne ikke bede wikien stoppe. Brug wikiens statusdialog.", "Could not request a stop. Use the wiki's status dialog.")) }
    }
    @objc func stopClicked(_ sender:NSButton) { if let s=sessions.first(where:{$0.stop === sender}) { stopSession(s) } }
    @objc func copyAddress(_ sender:NSButton) { if let s=sessions.first(where:{$0.copy === sender}) { NSPasteboard.general.clearContents(); NSPasteboard.general.setString(s.url,forType:.string) } }
}
if CommandLine.arguments.contains("--self-test") {
    guard let url=Bundle.main.url(forResource:"ForgeShare",withExtension:"mjs"), FileManager.default.fileExists(atPath:url.path) else { exit(1) }
    guard let node=nodeExecutable() else { exit(2) }
    let p=Process(); p.executableURL=URL(fileURLWithPath:node); p.arguments=["--check",url.path]
    try p.run(); p.waitUntilExit(); exit(p.terminationStatus)
}
let app = NSApplication.shared
let delegate = App(); app.delegate=delegate; app.setActivationPolicy(.regular); app.run()
