import AppKit

let danish = Locale.preferredLanguages.first?.hasPrefix("da") == true
func tr(_ da: String, _ en: String) -> String { danish ? da : en }
func nodeExecutable() -> String? {
    let paths = ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"] +
        (ProcessInfo.processInfo.environment["PATH"] ?? "").split(separator: ":").map { String($0) + "/node" }
    return paths.first { FileManager.default.isExecutableFile(atPath: $0) }
}
func permittedAddress(_ url:URL) -> Bool {
    guard let host=url.host,url.user==nil,url.password==nil else{return false}
    if url.scheme=="https" {return host.hasSuffix(".ts.net")}
    guard url.scheme=="http" else{return false}
    if host=="127.0.0.1" {return true}
    let parts=host.split(separator:".").compactMap{Int($0)}
    guard parts.count==4,parts.allSatisfy({$0>=0 && $0<=255}) else{return false}
    return parts[0]==10 || (parts[0]==172 && parts[1]>=16 && parts[1]<=31) || (parts[0]==192 && parts[1]==168)
}
final class LibraryStack: NSStackView { override var isFlipped:Bool {true} }
final class Session {
    let process = Process(), input = Pipe(), output = Pipe()
    var id="", local=false, openWhenReady=false, mode="", access=""
    var name = tr("Vælger wiki…", "Choosing a wiki…"), url = "", pending = Data(), stopping = false
    let row = NSStackView(), label = NSTextField(labelWithString: "")
    let copy = NSButton(title: tr("Kopiér adresse", "Copy address"), target: nil, action: nil)
    let stop = NSButton(title: tr("Stop", "Stop"), target: nil, action: nil)
}
final class App: NSObject, NSApplicationDelegate, NSWindowDelegate {
    var window: NSWindow!, rows: NSStackView!, empty: NSTextField!, start: NSButton!
    var sessions: [Session] = [], quitting = false
    var libraryView:NSStackView!,libraryChecks:[([String:Any],NSButton)]=[],libraryButtons:[NSButton]=[],libraryBusy=false
    var nextID="",nextLocal=false,nextStartup=false,checkStartup=true
    func applicationDidFinishLaunching(_ notification: Notification) {
        window = NSWindow(contentRect: NSRect(x: 0,y: 0,width: 760,height: 580),
                          styleMask: [.titled,.closable,.miniaturizable,.resizable], backing: .buffered, defer: false)
        window.title = "ForgeShare"; window.minSize = NSSize(width: 650,height: 540); window.delegate = self
        buildContent()
        reloadLibrary()
        let menu = NSMenu(), item = NSMenuItem(), appMenu = NSMenu()
        appMenu.addItem(withTitle: tr("Afslut ForgeShare", "Quit ForgeShare"),action:#selector(NSApplication.terminate(_:)),keyEquivalent:"q")
        item.submenu = appMenu; menu.addItem(item); NSApp.mainMenu = menu
        window.center(); window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps:true)
    }
    func buildContent() {
        let content = NSStackView(); content.orientation = .vertical; content.alignment = .leading; content.spacing = 12
        content.translatesAutoresizingMaskIntoConstraints = false; window.contentView!.addSubview(content)
        NSLayoutConstraint.activate([content.leadingAnchor.constraint(equalTo: window.contentView!.leadingAnchor,constant: 24),
          content.trailingAnchor.constraint(equalTo: window.contentView!.trailingAnchor,constant: -24),
          content.topAnchor.constraint(equalTo: window.contentView!.topAnchor,constant: 24),
          content.bottomAnchor.constraint(equalTo: window.contentView!.bottomAnchor,constant: -24)])
        let title = NSTextField(labelWithString: "ForgeShare"); title.font = .systemFont(ofSize: 30,weight: .bold)
        let header=NSStackView();header.orientation = .horizontal;header.spacing=12
        let spacer=NSView();spacer.setContentHuggingPriority(.defaultLow,for:.horizontal)
        let startupButton=NSButton(title:tr("Opstart…","Startup…"),target:self,action:#selector(configureStartup));startupButton.bezelStyle = .rounded
        let helpButton=NSButton(title:tr("Hjælp","Help"),target:self,action:#selector(openHelp));helpButton.bezelStyle = .rounded
        for view in [title,spacer,startupButton,helpButton] {header.addArrangedSubview(view)}
        let intro = NSTextField(wrappingLabelWithString: tr("Dine wikier, samlet ét sted.", "Your wikis, together in one place."))
        intro.textColor = .secondaryLabelColor
        let toolbar=NSStackView();toolbar.orientation = .horizontal;toolbar.spacing=8
        let actions:[(String,String,Selector)]=[("Tilføj…","Add…",#selector(addToLibrary)),("Åbn","Open",#selector(openSelected)),("Del…","Share…",#selector(shareSelected)),("Redigér…","Edit…",#selector(editSelected)),("Eksportér valgte…","Export selected…",#selector(exportSelected))]
        for (da,en,action) in actions {let button=NSButton(title:tr(da,en),target:self,action:action);button.bezelStyle = .rounded;toolbar.addArrangedSubview(button);libraryButtons.append(button)}
        start=libraryButtons[2]
        let libraryHeading=NSTextField(labelWithString:tr("Mine wikier","My wikis"));libraryHeading.font = .boldSystemFont(ofSize:14)
        libraryView=LibraryStack();libraryView.orientation = .vertical;libraryView.alignment = .leading;libraryView.spacing=8;libraryView.translatesAutoresizingMaskIntoConstraints=false
        let libraryScroll=NSScrollView();libraryScroll.hasVerticalScroller=true;libraryScroll.documentView=libraryView
        libraryScroll.heightAnchor.constraint(greaterThanOrEqualToConstant:100).isActive=true
        libraryScroll.setContentHuggingPriority(.defaultLow,for:.vertical)
        libraryView.widthAnchor.constraint(equalTo:libraryScroll.contentView.widthAnchor).isActive=true
        let heading = NSTextField(labelWithString: tr("Aktive wikier", "Active wikis")); heading.font = .boldSystemFont(ofSize: 14)
        rows = LibraryStack(); rows.orientation = .vertical; rows.alignment = .leading; rows.spacing = 12; rows.translatesAutoresizingMaskIntoConstraints=false
        let activeScroll=NSScrollView();activeScroll.hasVerticalScroller=true;activeScroll.documentView=rows;activeScroll.heightAnchor.constraint(equalToConstant:100).isActive=true
        empty = NSTextField(wrappingLabelWithString: tr("Ingen serverwikier kører endnu.", "No server wikis are running yet.")); empty.textColor = .secondaryLabelColor
        let help = NSTextField(wrappingLabelWithString: tr("Deling virker, mens computeren er tændt og ForgeShare kører. Stop afslutter kun den valgte wiki.", "Sharing works while this computer is on and ForgeShare is running. Stop ends only the selected wiki.")); help.font = .systemFont(ofSize: 12); help.textColor = .secondaryLabelColor
        let status=NSStackView();status.orientation = .vertical;status.alignment = .leading;status.spacing=8
        status.edgeInsets=NSEdgeInsets(top:16,left:16,bottom:16,right:16)
        status.wantsLayer=true;status.layer?.cornerRadius=12;status.layer?.backgroundColor=NSColor.controlBackgroundColor.cgColor
        for view in [heading,help,empty,activeScroll] as [NSView] {status.addArrangedSubview(view)}
        for view in [header,intro,libraryHeading,toolbar,libraryScroll,status] as [NSView] { content.addArrangedSubview(view) }
        header.widthAnchor.constraint(equalTo:content.widthAnchor).isActive=true
        rows.widthAnchor.constraint(equalTo: activeScroll.contentView.widthAnchor).isActive = true
        activeScroll.widthAnchor.constraint(equalTo:status.widthAnchor,constant:-32).isActive=true
        libraryScroll.widthAnchor.constraint(equalTo:content.widthAnchor).isActive=true
        status.widthAnchor.constraint(equalTo:content.widthAnchor).isActive=true
        help.widthAnchor.constraint(equalTo:status.widthAnchor,constant:-32).isActive=true
    }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows: Bool) -> Bool { window.makeKeyAndOrderFront(nil); return true }
    func windowShouldClose(_ sender: NSWindow) -> Bool { NSApp.terminate(nil); return false }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if libraryBusy {showError(tr("Afslut først den åbne biblioteksdialog.","Finish the open library dialog first."));return .terminateCancel}
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
        let startupLaunch=nextStartup;nextStartup=false
        guard let node = nodeExecutable() else {
            let a=NSAlert(); a.messageText=tr("Installer Node.js først", "Install Node.js first")
            a.informativeText=tr("Node.js er motoren til wikien. Hent installationsprogrammet fra den officielle hjemmeside, og åbn derefter ForgeShare igen.", "Node.js runs the wiki. Download its installer from the official website, then reopen ForgeShare.")
            a.addButton(withTitle:tr("Luk", "Close")); a.addButton(withTitle:tr("Hent Node.js", "Get Node.js"))
            if a.runModal() == .alertSecondButtonReturn { NSWorkspace.shared.open(URL(string:"https://nodejs.org/en/download")!) }; return
        }
        guard let helper=Bundle.main.url(forResource:"ForgeShare",withExtension:"mjs") else { showError(tr("Appen er ufuldstændig. Pak hele den originale ZIP ud igen.", "The app is incomplete. Extract the complete original ZIP again.")); return }
        let session=Session(); session.id=nextID;session.local=nextLocal;session.openWhenReady=nextLocal && !startupLaunch;nextID="";nextLocal=false; session.process.executableURL=URL(fileURLWithPath:node)
        session.process.arguments=[helper.path,"--gui","--app"] + (session.id.isEmpty ? [] : ["--profile",session.id]) + (session.local ? ["--local"] : []) + (startupLaunch ? ["--startup"] : []); session.process.currentDirectoryURL=helper.deletingLastPathComponent()
        var env=ProcessInfo.processInfo.environment; env.removeValue(forKey:"NODE_OPTIONS"); env.removeValue(forKey:"NODE_PATH")
        env["PATH"]="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"; env["FORGESHARE_LANGUAGE"]=danish ? "da" : "en"; session.process.environment=env
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
                        if data["event"] == "ready", let address=data["url"], let url=URL(string:address), permittedAddress(url) { s.mode=data["mode"] ?? "";s.access=data["access"] ?? "login";s.url=address; s.copy.isEnabled=true; if s.openWhenReady {s.openWhenReady=false;NSWorkspace.shared.open(url)};self.reloadLibrary() }
                        self.update(s)
                    }
                }
            }
        }
        session.process.terminationHandler = { [weak self, weak session] _ in DispatchQueue.main.async {
            guard let self=self, let s=session else { return }; s.output.fileHandleForReading.readabilityHandler=nil
            try? s.input.fileHandleForWriting.close(); self.rows.removeArrangedSubview(s.row); s.row.removeFromSuperview()
            self.sessions.removeAll { $0 === s }; self.empty.isHidden = !self.sessions.isEmpty;if !self.quitting {self.reloadLibrary()}
            if self.quitting && self.sessions.isEmpty { NSApp.reply(toApplicationShouldTerminate:true) }
        }}
        do { try session.process.run(); sessions.append(session); rows.addArrangedSubview(session.row)
            session.row.widthAnchor.constraint(equalTo:rows.widthAnchor).isActive=true; empty.isHidden=true; update(session)
        } catch { showError(tr("Wikien kunne ikke startes. Kontroller Node.js-installationen.", "The wiki could not start. Check your Node.js installation.")) }
    }
    func selectedEntries() -> [[String:Any]] { libraryChecks.filter{$0.1.state == .on}.map{$0.0} }
    func oneEntry() -> [String:Any]? {
        let items=selectedEntries(); if items.count != 1 {showError(tr("Markér én wiki på listen.","Select one wiki in the list."));return nil};return items[0]
    }
    func libraryCommand(_ action:String,_ input:[String:Any]=[:],completion:@escaping ([String:Any]?)->Void) {
        guard !libraryBusy else {return}
        guard let node=nodeExecutable(),let helper=Bundle.main.url(forResource:"ForgeShare",withExtension:"mjs") else {showError(tr("Installer Node.js for at bruge wikibiblioteket.","Install Node.js to use the wiki library."));return}
        libraryBusy=true;libraryButtons.forEach{$0.isEnabled=false}
        let p=Process(),out=Pipe();p.executableURL=URL(fileURLWithPath:node)
        let data=(try? JSONSerialization.data(withJSONObject:input)) ?? Data("{}".utf8)
        p.arguments=[helper.path,"--gui","--library",action,data.base64EncodedString()];p.standardOutput=out;p.standardError=FileHandle.nullDevice
        var env=ProcessInfo.processInfo.environment;env.removeValue(forKey:"NODE_OPTIONS");env.removeValue(forKey:"NODE_PATH");env["FORGESHARE_LANGUAGE"]=danish ? "da" : "en";p.environment=env
        DispatchQueue.global().async {
            var result:[String:Any]?
            do {try p.run();let bytes=out.fileHandleForReading.readDataToEndOfFile();p.waitUntilExit()
                if p.terminationStatus==0 {result=(try? JSONSerialization.jsonObject(with:bytes)) as? [String:Any]}
            }catch {}
            DispatchQueue.main.async {self.libraryBusy=false;self.libraryButtons.forEach{$0.isEnabled=true};completion(result)}
        }
    }
    func reloadLibrary() {
        let selected=Set(selectedEntries().compactMap{$0["id"] as? String})
        libraryCommand("list") { result in
            guard let entries=result?["entries"] as? [[String:Any]] else {self.showError(tr("Wikibiblioteket kunne ikke læses. Ingen filer er ændret.","The wiki library could not be read. No files were changed."));return}
            self.renderLibrary(entries,selected:selected)
            if self.checkStartup {
                self.checkStartup=false
                self.libraryCommand("startup-status") { result in
                    guard let setting=result?["startup"] as? [String:Any],let id=setting["wikiId"] as? String else{return}
                    self.nextID=id;self.nextLocal=setting["mode"] as? String == "local";self.nextStartup=true;self.startWiki()
                }
            }
        }
    }
    func renderLibrary(_ entries:[[String:Any]],selected:Set<String>=[]) {
            libraryView.arrangedSubviews.forEach {libraryView.removeArrangedSubview($0);$0.removeFromSuperview()};libraryChecks=[]
            if entries.isEmpty {libraryView.addArrangedSubview(NSTextField(labelWithString:tr("Tryk Tilføj for at finde dine wikier.","Choose Add to find your wikis.")))}
            for entry in entries {
                let name=entry["name"] as? String ?? "",kind=entry["kind"] as? String ?? ""
                let missing=entry["available"] as? Bool == false
                let label=name+"  ·  "+(missing ? tr("Filen mangler","File missing") : kind=="html" ? tr("Lokal HTML-fil","Local HTML file") : tr("Wikimappe","Wiki folder"))
                let box=NSButton(checkboxWithTitle:label,target:nil,action:nil);box.state=selected.contains(entry["id"] as? String ?? "") ? .on : .off
                box.cell?.lineBreakMode = .byTruncatingMiddle
                box.setContentCompressionResistancePriority(.defaultLow,for:.horizontal)
                libraryView.addArrangedSubview(box);libraryChecks.append((entry,box))
                // The row must join the hierarchy BEFORE activating a constraint to its parent.
                box.widthAnchor.constraint(equalTo:libraryView.widthAnchor,constant:-8).isActive=true
                if let description=entry["description"] as? String,!description.isEmpty {let text=NSTextField(wrappingLabelWithString:description);text.textColor = .secondaryLabelColor;text.font = .systemFont(ofSize:12);libraryView.addArrangedSubview(text);text.widthAnchor.constraint(equalTo:libraryView.widthAnchor,constant:-8).isActive=true}
            }
    }

    @objc func configureStartup() {libraryCommand("startup"){_ in}}
    @objc func openHelp() {
        if let file=Bundle.main.url(forResource:danish ? "help-da" : "help-en",withExtension:"html") {NSWorkspace.shared.open(file)}
        else {showError(tr("Hjælpen mangler. Pak den nye ZIP-fil helt ud.","Help is missing. Extract the complete new ZIP."))}
    }
    @objc func addToLibrary() {libraryCommand("add"){_ in self.reloadLibrary()}}
    @objc func editSelected() {guard let e=oneEntry() else{return};libraryCommand("edit",["id":e["id"]!]){_ in self.reloadLibrary()}}
    @objc func exportSelected() {let ids=selectedEntries().compactMap{$0["id"] as? String};if ids.isEmpty {showError(tr("Markér de wikier, der skal med i oversigten.","Select the wikis to include in the overview."));return};libraryCommand("export",["ids":ids]){_ in}}
    @objc func shareSelected() {launchSelected(local:false)}
    @objc func openSelected() {launchSelected(local:true)}
    func launchSelected(local:Bool) {
        guard let e=oneEntry(),let id=e["id"] as? String,let location=e["location"] as? String else{return}
        if e["available"] as? Bool == false {showError(tr("Filen findes ikke længere på den gemte placering.","The file is no longer at its saved location."));return}
        if e["kind"] as? String == "html" {
            if local {NSWorkspace.shared.open(URL(fileURLWithPath:location))}
            else {showError(tr("En HTML-fil skal først kopieres til en serverwiki. Se hjælpen i ForgeShare. Originalen kan fortsat bruges lokalt.","An HTML file first needs copying into a server wiki. See ForgeShare help. The original can still be used locally."))};return
        }
        if let existing=sessions.first(where:{$0.id==id}) {
            if local && !existing.url.isEmpty {NSWorkspace.shared.open(URL(string:existing.url)!)}
            else {showError(tr("Denne wiki kører allerede. Stop den først, hvis du vil ændre delingen.","This wiki is already running. Stop it first to change sharing."))};return
        }
        nextID=id;nextLocal=local;startWiki()
    }
    func update(_ s: Session) {
        let network=s.local ? tr("kun lokalt","local only") : s.mode=="lan" ? tr("hjemmenetværk","home network") : "Tailscale"
        let login=s.access=="open" ? tr("uden login","no login") : tr("med login","with login")
        s.label.stringValue=s.name+(s.stopping ? tr(" — stopper…"," — stopping…") : s.url.isEmpty ? "" : " — "+network+" · "+login)
        s.label.stringValue += s.url.isEmpty ? "" : "\n"+s.url;s.label.toolTip=s.label.stringValue
    }
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
    try p.run(); p.waitUntilExit(); if p.terminationStatus != 0 {exit(p.terminationStatus)}
    // Exercise the production row-rendering code without windows, dialogs, or user data.
    let application=NSApplication.shared;application.setActivationPolicy(.prohibited)
    let testApp=App()
    testApp.window=NSWindow(contentRect:NSRect(x:0,y:0,width:760,height:580),styleMask:[.titled],backing:.buffered,defer:false)
    testApp.buildContent()
    let fixture:[[String:Any]]=[
        ["id":"first","name":"Projektwiki","description":"En beskrivelse","kind":"folder","available":true],
        ["id":"second","name":"Notes","description":"","kind":"html","available":false]]
    testApp.renderLibrary([],selected:[])
    testApp.renderLibrary(fixture,selected:["first"])
    testApp.libraryView.layoutSubtreeIfNeeded()
    precondition(testApp.libraryChecks.count==2 && testApp.selectedEntries().count==1)
    precondition(testApp.libraryChecks.allSatisfy{$0.1.superview != nil})
    testApp.renderLibrary(fixture,selected:["second"])
    precondition(testApp.libraryChecks.count==2 && testApp.selectedEntries().first?["id"] as? String == "second")
    testApp.renderLibrary([],selected:[]);precondition(testApp.libraryChecks.isEmpty)
    for size in [NSSize(width:760,height:580),NSSize(width:650,height:540)] {
        testApp.window.setContentSize(size);testApp.window.contentView!.layoutSubtreeIfNeeded()
        precondition(testApp.libraryButtons.count==5)
        for button in testApp.libraryButtons {
            let frame=button.convert(button.bounds,to:testApp.window.contentView!)
            precondition(frame.minX>=0 && frame.maxX<=size.width && frame.minY>=0 && frame.maxY<=size.height)
        }
    }
    for value in ["http://127.0.0.1:20000","http://192.168.1.8:20000","http://10.0.0.8:20000","https://example.ts.net:21000"] {precondition(permittedAddress(URL(string:value)!))}
    for value in ["http://0.0.0.0:20000","http://8.8.8.8:20000","http://100.64.0.1:20000","file:///tmp/wiki"] {precondition(!permittedAddress(URL(string:value)!))}
    exit(0)
}
let app = NSApplication.shared
let delegate = App(); app.delegate=delegate; app.setActivationPolicy(.regular); app.run()
