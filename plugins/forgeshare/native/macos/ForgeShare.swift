import AppKit
import Security


// Private IPC: secrets are read/written only over inherited pipes, never arguments.
func vaultCommand(_ command:String) -> Int32 {
    let query:[String:Any] = [kSecClass as String:kSecClassGenericPassword,
        kSecAttrService as String:"org.huwiki.ForgeShare",kSecAttrAccount as String:"vault-v1"]
    if command == "read" {
        var q=query;q[kSecReturnData as String]=true;q[kSecMatchLimit as String]=kSecMatchLimitOne
        var result:CFTypeRef?;let status=SecItemCopyMatching(q as CFDictionary,&result)
        if status == errSecItemNotFound {FileHandle.standardOutput.write(Data("{}".utf8));return 0}
        guard status == errSecSuccess,let data=result as? Data else{return 1}
        FileHandle.standardOutput.write(data);return 0
    }
    guard command == "write" else{return 1}
    let data=FileHandle.standardInput.readDataToEndOfFile()
    guard data.count <= 1048576,(try? JSONSerialization.jsonObject(with:data)) != nil else{return 1}
    var status=SecItemUpdate(query as CFDictionary,[kSecValueData as String:data] as CFDictionary)
    if status == errSecItemNotFound {
        var q=query;q[kSecValueData as String]=data
        q[kSecAttrAccessible as String]=kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        status=SecItemAdd(q as CFDictionary,nil)
    }
    return status == errSecSuccess ? 0:1
}
if CommandLine.arguments.count == 3 && CommandLine.arguments[1] == "--vault" {exit(vaultCommand(CommandLine.arguments[2]))}

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
    var name = tr("Vælger wiki…", "Choosing a wiki…"), url = "", ownerUrl = "", pending = Data(), stopping = false
    let row = NSStackView(), label = NSTextField(labelWithString: "")
    let copy = NSButton(title: tr("Kopiér adresse", "Copy address"), target: nil, action: nil)
    let invite = NSButton(title:tr("Invitér…","Invite…"),target:nil,action:nil)
    let stop = NSButton(title: tr("Stop", "Stop"), target: nil, action: nil)
}
final class App: NSObject, NSApplicationDelegate, NSWindowDelegate {
    var window: NSWindow!, rows: NSStackView!, empty: NSTextField!, start: NSButton!
    var sessions: [Session] = [], quitting = false
    var statusItem:NSStatusItem?
    var pages:[NSView]=[],navigation:[NSButton]=[]
    var libraryView:NSStackView!,libraryChecks:[([String:Any],NSButton)]=[],libraryButtons:[NSButton]=[],libraryBusy=false
    let sharingLabel=NSTextField(labelWithString:"")
    var shareQueue:[String]=[], sharingID:String?
    var nextID="",nextLocal=false,nextStartup=false,checkStartup=true,checkDiscovery=true
    func applicationDidFinishLaunching(_ notification: Notification) {
        window = NSWindow(contentRect: NSRect(x: 0,y: 0,width: 1000,height: 660),
                          styleMask: [.titled,.closable,.miniaturizable,.resizable], backing: .buffered, defer: false)
        window.title = "ForgeShare"; window.minSize = NSSize(width: 900,height: 600); window.delegate = self
        buildContent()
        reloadLibrary()
        let menu = NSMenu(), item = NSMenuItem(), appMenu = NSMenu()
        appMenu.addItem(withTitle: tr("Afslut ForgeShare", "Quit ForgeShare"),action:#selector(NSApplication.terminate(_:)),keyEquivalent:"q")
        item.submenu = appMenu; menu.addItem(item); NSApp.mainMenu = menu
        statusItem=NSStatusBar.system.statusItem(withLength:NSStatusItem.squareLength)
        statusItem?.button?.image=NSImage(systemSymbolName:"books.vertical",accessibilityDescription:"ForgeShare")
        let statusMenu=NSMenu()
        let openItem=NSMenuItem(title:tr("Åbn ForgeShare","Open ForgeShare"),action:#selector(showLibrary),keyEquivalent:"");openItem.target=self;statusMenu.addItem(openItem)
        statusMenu.addItem(NSMenuItem.separator())
        statusMenu.addItem(withTitle:tr("Afslut ForgeShare","Quit ForgeShare"),action:#selector(NSApplication.terminate(_:)),keyEquivalent:"")
        statusItem?.menu=statusMenu
        window.center(); window.makeKeyAndOrderFront(nil); NSApp.activate(ignoringOtherApps:true)
    }
    func buildContent() {
        window.contentView!.wantsLayer=true
        let shell=NSStackView();shell.orientation = .horizontal;shell.alignment = .top;shell.spacing=0;shell.translatesAutoresizingMaskIntoConstraints=false;window.contentView!.addSubview(shell)
        NSLayoutConstraint.activate([shell.leadingAnchor.constraint(equalTo:window.contentView!.leadingAnchor),shell.trailingAnchor.constraint(equalTo:window.contentView!.trailingAnchor),shell.topAnchor.constraint(equalTo:window.contentView!.topAnchor),shell.bottomAnchor.constraint(equalTo:window.contentView!.bottomAnchor)])
        let sidebar=NSStackView();sidebar.orientation = .vertical;sidebar.alignment = .leading;sidebar.spacing=10;sidebar.edgeInsets=NSEdgeInsets(top:24,left:16,bottom:20,right:16);sidebar.wantsLayer=true;sidebar.layer?.backgroundColor=NSColor.windowBackgroundColor.cgColor
        let brand=NSTextField(labelWithString:"ForgeShare");brand.font = .systemFont(ofSize:20,weight:.bold);sidebar.addArrangedSubview(brand)
        let destinations=[("Bibliotek","Library","books.vertical"),("Delinger","Sharing","network"),("Forbindelser","Connections","key"),("Indstillinger","Settings","gearshape")]
        for (index,item) in destinations.enumerated(){let button=NSButton(title:tr(item.0,item.1),target:self,action:#selector(selectPage(_:)));button.tag=index;button.bezelStyle = .rounded;button.image=NSImage(systemSymbolName:item.2,accessibilityDescription:nil);button.imagePosition = .imageLeading;button.alignment = .left;sidebar.addArrangedSubview(button);button.widthAnchor.constraint(equalToConstant:148).isActive=true;button.heightAnchor.constraint(equalToConstant:40).isActive=true;navigation.append(button)}
        let sideNote=NSTextField(wrappingLabelWithString:tr("Fortsætter, når du lukker vinduet.","Keeps running when you close the window."));sideNote.font = .systemFont(ofSize:11);sideNote.textColor = .secondaryLabelColor;sidebar.addArrangedSubview(sideNote);sideNote.widthAnchor.constraint(equalToConstant:148).isActive=true
        shell.addArrangedSubview(sidebar);sidebar.widthAnchor.constraint(equalToConstant:180).isActive=true;sidebar.heightAnchor.constraint(equalTo:shell.heightAnchor).isActive=true
        let detail=NSView();detail.wantsLayer=true;detail.layer?.backgroundColor=NSColor.controlBackgroundColor.cgColor;detail.translatesAutoresizingMaskIntoConstraints=false;shell.addArrangedSubview(detail);detail.heightAnchor.constraint(equalTo:shell.heightAnchor).isActive=true;detail.widthAnchor.constraint(equalTo:shell.widthAnchor,constant:-180).isActive=true
        func page(_ title:String,_ subtitle:String)->NSStackView {
            let v=NSStackView();v.orientation = .vertical;v.alignment = .leading;v.spacing=16;v.translatesAutoresizingMaskIntoConstraints=false;detail.addSubview(v)
            NSLayoutConstraint.activate([v.leadingAnchor.constraint(equalTo:detail.leadingAnchor,constant:28),v.trailingAnchor.constraint(equalTo:detail.trailingAnchor,constant:-28),v.topAnchor.constraint(equalTo:detail.topAnchor,constant:28),v.bottomAnchor.constraint(equalTo:detail.bottomAnchor,constant:-28)])
            let h=NSTextField(labelWithString:title);h.font = .systemFont(ofSize:28,weight:.bold);v.addArrangedSubview(h)
            let sub=NSTextField(wrappingLabelWithString:subtitle);sub.textColor = .secondaryLabelColor;v.addArrangedSubview(sub);sub.widthAnchor.constraint(equalTo:v.widthAnchor).isActive=true;pages.append(v);return v
        }
        func button(_ da:String,_ en:String,_ action:Selector)->NSButton {let b=NSButton(title:tr(da,en),target:self,action:action);b.bezelStyle = .rounded;return b}
        let libraryPage=page(tr("Dit bibliotek","Your library"),tr("Wikier og sites, samlet ét sted.","Wikis and sites, together in one place."))
        let toolbar=NSStackView();toolbar.orientation = .horizontal;toolbar.spacing=8
        let actions:[(String,String,Selector)]=[("Tilføj…","Add…",#selector(addToLibrary)),("Åbn","Open",#selector(openSelected)),("Del…","Share…",#selector(shareSelected)),("Redigér…","Edit…",#selector(editSelected)),("Eksportér…","Export…",#selector(exportSelected))]
        for (da,en,action) in actions {let b=button(da,en,action);toolbar.addArrangedSubview(b);libraryButtons.append(b)};start=libraryButtons[2];libraryPage.addArrangedSubview(toolbar)
        libraryView=LibraryStack();libraryView.orientation = .vertical;libraryView.alignment = .leading;libraryView.spacing=16;libraryView.translatesAutoresizingMaskIntoConstraints=false
        let scroll=NSScrollView();scroll.hasVerticalScroller=true;scroll.documentView=libraryView;scroll.drawsBackground=false;libraryPage.addArrangedSubview(scroll);scroll.widthAnchor.constraint(equalTo:libraryPage.widthAnchor).isActive=true;libraryView.widthAnchor.constraint(equalTo:scroll.contentView.widthAnchor).isActive=true;scroll.heightAnchor.constraint(greaterThanOrEqualToConstant:120).isActive=true
        sharingLabel.textColor = .secondaryLabelColor;sharingLabel.font = .systemFont(ofSize:12);libraryPage.addArrangedSubview(sharingLabel)
        let sharingPage=page(tr("Aktive delinger","Active sharing"),tr("Adressen er klar til at blive kopieret. Stop afslutter kun den valgte deling.","Copy an address to share it. Stop ends only the selected item."))
        empty=NSTextField(labelWithString:tr("Ingen delinger kører endnu.","Nothing is shared yet."));empty.textColor = .secondaryLabelColor;sharingPage.addArrangedSubview(empty)
        rows=LibraryStack();rows.orientation = .vertical;rows.alignment = .leading;rows.spacing=18;rows.translatesAutoresizingMaskIntoConstraints=false
        let activeScroll=NSScrollView();activeScroll.documentView=rows;activeScroll.hasVerticalScroller=true;activeScroll.drawsBackground=false;sharingPage.addArrangedSubview(activeScroll);activeScroll.widthAnchor.constraint(equalTo:sharingPage.widthAnchor).isActive=true;rows.widthAnchor.constraint(equalTo:activeScroll.contentView.widthAnchor).isActive=true
        let hint=NSTextField(wrappingLabelWithString:tr("Computeren skal være tændt. Du kan lukke dette vindue; ForgeShare fortsætter i menulinjen.","Keep this computer on. You can close this window; ForgeShare stays in the menu bar."));hint.textColor = .secondaryLabelColor;hint.font = .systemFont(ofSize:12);sharingPage.addArrangedSubview(hint);hint.widthAnchor.constraint(equalTo:sharingPage.widthAnchor).isActive=true
        let connections=page(tr("Dine forbindelser","Your connections"),tr("Gem AI-forbindelser og adgangskoder i computerens nøgleboks. Du bestemmer, hvilke enheder og personer der må bruge dem.","Save AI connections and passwords in this computer’s vault. You decide which devices and people may use them."))
        connections.addArrangedSubview(button("Åbn nøgleboks…","Open vault…",#selector(openVault)))
        connections.addArrangedSubview(button("Tailscale-enheder…","Tailscale devices…",#selector(showDevices)))
        let connectionNote=NSTextField(wrappingLabelWithString:tr("Enheder i Tailscale har ikke automatisk adgang til dine AI-konti. Godkend hver anmodning i nøgleboksen.","Tailscale devices do not automatically have access to your AI accounts. Approve each request in the vault."));connections.addArrangedSubview(connectionNote);connectionNote.widthAnchor.constraint(equalTo:connections.widthAnchor).isActive=true;connections.addArrangedSubview(NSView())
        let settings=page(tr("Indstillinger","Settings"),tr("Vælg, hvordan ForgeShare skal starte og dele.","Choose how ForgeShare starts and shares."))
        for b in [button("Delingsindstillinger…","Sharing settings…",#selector(configureSharing)),button("Start ved login…","Start at login…",#selector(configureStartup)),button("Åbn Tailscale","Open Tailscale",#selector(openTailscale)),button("Hjælp","Help",#selector(openHelp))]{settings.addArrangedSubview(b)};settings.addArrangedSubview(NSView())
        showPage(0)
    }
    func showPage(_ index:Int){for (i,page) in pages.enumerated(){page.isHidden=i != index};for(i,b) in navigation.enumerated(){b.state=i==index ? .on:.off;b.contentTintColor=i==index ? .controlAccentColor:.labelColor}}
    @objc func selectPage(_ sender:NSButton){showPage(sender.tag)}
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows: Bool) -> Bool { window.makeKeyAndOrderFront(nil); return true }
    @objc func showLibrary() { window.makeKeyAndOrderFront(nil);NSApp.activate(ignoringOtherApps:true) }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender:NSApplication) -> Bool {false}
    func windowShouldClose(_ sender: NSWindow) -> Bool { sender.orderOut(nil); return false }
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
    func requireNode() -> String? {
        if let node=nodeExecutable(){return node}
        while true {
            let a=NSAlert();a.messageText=tr("ForgeShare mangler Node.js","ForgeShare needs Node.js")
            a.informativeText=tr("Installer Node.js fra den officielle hjemmeside. Vend tilbage hertil, og vælg Prøv igen.","Install Node.js from the official website, then return here and choose Try again.")
            a.addButton(withTitle:tr("Hent Node.js","Get Node.js"));a.addButton(withTitle:tr("Prøv igen","Try again"));a.addButton(withTitle:tr("Senere","Later"))
            let result=a.runModal()
            if result == .alertFirstButtonReturn {NSWorkspace.shared.open(URL(string:"https://nodejs.org/en/download")!)}
            else if result == .alertSecondButtonReturn {if let node=nodeExecutable(){return node}}
            else {return nil}
        }
    }
    @objc func startWiki() {
        let startupLaunch=nextStartup;nextStartup=false
        guard let node = requireNode() else {sharingID=nil;shareQueue.removeAll();return}
        guard let helper=Bundle.main.url(forResource:"ForgeShare",withExtension:"mjs") else { sharingID=nil;shareQueue.removeAll();showError(tr("Appen er ufuldstændig. Pak hele den originale ZIP ud igen.", "The app is incomplete. Extract the complete original ZIP again.")); return }
        let session=Session(); session.id=nextID;session.local=nextLocal;session.openWhenReady=nextLocal && !startupLaunch;nextID="";nextLocal=false; session.process.executableURL=URL(fileURLWithPath:node)
        session.process.arguments=[helper.path,"--gui","--app","--quick"] + (session.id.isEmpty ? [] : ["--profile",session.id]) + (session.local ? ["--local"] : []) + (startupLaunch ? ["--startup"] : []); session.process.currentDirectoryURL=helper.deletingLastPathComponent()
        var env=ProcessInfo.processInfo.environment; env.removeValue(forKey:"NODE_OPTIONS"); env.removeValue(forKey:"NODE_PATH")
        env["PATH"]="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"; env["FORGESHARE_NATIVE"]=Bundle.main.executableURL?.path;env["FORGESHARE_APP"]=Bundle.main.bundleURL.path;env["FORGESHARE_LANGUAGE"]=danish ? "da" : "en"; session.process.environment=env
        session.process.standardInput=session.input; session.process.standardOutput=session.output; session.process.standardError=FileHandle.nullDevice
        session.row.orientation = .horizontal; session.row.spacing=10; session.label.lineBreakMode = .byTruncatingMiddle; session.label.maximumNumberOfLines = 2
        session.label.setContentCompressionResistancePriority(.defaultLow,for:.horizontal)
        session.row.addArrangedSubview(session.label); session.row.addArrangedSubview(session.copy);session.row.addArrangedSubview(session.invite);session.invite.target=self;session.invite.action=#selector(inviteSession(_:));session.invite.isEnabled=false; session.row.addArrangedSubview(session.stop)
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
                        if data["event"] == "ready", let address=data["url"], let url=URL(string:address), permittedAddress(url) { s.mode=data["mode"] ?? "";s.access=data["access"] ?? "login";s.url=address; if let own=data["ownerUrl"],let u=URL(string:own),u.scheme=="http",u.host=="127.0.0.1" {s.ownerUrl=own}; s.copy.isEnabled=true;s.invite.isEnabled = !s.local; if s.openWhenReady {s.openWhenReady=false;NSWorkspace.shared.open(URL(string:s.ownerUrl.isEmpty ? s.url:s.ownerUrl)!)};self.reloadLibrary();self.advanceShareQueue(s.id) }
                        self.update(s)
                    }
                }
            }
        }
        session.process.terminationHandler = { [weak self, weak session] _ in DispatchQueue.main.async {
            guard let self=self, let s=session else { return }; s.output.fileHandleForReading.readabilityHandler=nil
            try? s.input.fileHandleForWriting.close(); self.rows.removeArrangedSubview(s.row); s.row.removeFromSuperview()
            if self.sharingID==s.id {self.sharingID=nil;self.shareQueue.removeAll()}
            self.sessions.removeAll { $0 === s }; self.empty.isHidden = !self.sessions.isEmpty;if !self.quitting {self.reloadLibrary()}
            if self.quitting && self.sessions.isEmpty { NSApp.reply(toApplicationShouldTerminate:true) }
        }}
        do { try session.process.run(); sessions.append(session); rows.addArrangedSubview(session.row)
            session.row.widthAnchor.constraint(equalTo:rows.widthAnchor).isActive=true; empty.isHidden=true; update(session)
        } catch { sharingID=nil;shareQueue.removeAll();showError(tr("Wikien kunne ikke startes. Kontroller Node.js-installationen.", "The wiki could not start. Check your Node.js installation.")) }
    }
    func selectedEntries() -> [[String:Any]] { libraryChecks.filter{$0.1.state == .on}.map{$0.0} }
    func oneEntry() -> [String:Any]? {
        let items=selectedEntries(); if items.count != 1 {showError(tr("Markér én wiki på listen.","Select one wiki in the list."));return nil};return items[0]
    }
    func libraryCommand(_ action:String,_ input:[String:Any]=[:],completion:@escaping ([String:Any]?)->Void) {
        guard !libraryBusy else {return}
        guard let node=requireNode() else {return}
        guard let helper=Bundle.main.url(forResource:"ForgeShare",withExtension:"mjs") else {showError(tr("Appen er ufuldstændig. Hent hele pakken igen.","The app is incomplete. Download the complete package again."));return}
        libraryBusy=true;libraryButtons.forEach{$0.isEnabled=false}
        let p=Process(),out=Pipe();p.executableURL=URL(fileURLWithPath:node)
        let data=(try? JSONSerialization.data(withJSONObject:input)) ?? Data("{}".utf8)
        p.arguments=[helper.path,"--gui","--library",action,data.base64EncodedString()];p.standardOutput=out;p.standardError=FileHandle.nullDevice
        var env=ProcessInfo.processInfo.environment;env.removeValue(forKey:"NODE_OPTIONS");env.removeValue(forKey:"NODE_PATH");env["FORGESHARE_NATIVE"]=Bundle.main.executableURL?.path;env["FORGESHARE_APP"]=Bundle.main.bundleURL.path;env["FORGESHARE_LANGUAGE"]=danish ? "da" : "en";p.environment=env
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
        let action=checkDiscovery ? "discover-auto" : "list";checkDiscovery=false
        libraryCommand(action) { result in
            guard let entries=result?["entries"] as? [[String:Any]] else {self.showError(tr("Wikibiblioteket kunne ikke læses. Ingen filer er ændret.","The wiki library could not be read. No files were changed."));return}
            self.renderLibrary(entries,selected:selected)
            if let sharing=result?["sharing"] as? [String:Any] {self.sharingLabel.stringValue=tr("Deling: ","Sharing: ")+(sharing["mode"] as? String == "lan" ? tr("Hjemmenetværk","Home network") : sharing["mode"] as? String == "funnel" ? "Funnel" : "Tailscale")+" · "+(sharing["mode"] as? String == "funnel" ? tr("læser- og redaktørkode","reader and editor codes") : sharing["allowAnonymous"] as? Bool == true ? tr("uden wiki-login","no wiki login") : tr("med wiki-login","with wiki login"))}
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
                let label=name+"  ·  "+(missing ? tr("Filen mangler","File missing") : kind=="site" ? tr("Site","Site") : kind=="html" ? tr("Lokal HTML-fil","Local HTML file") : tr("Wikimappe","Wiki folder"))
                let box=NSButton(checkboxWithTitle:label,target:nil,action:nil);box.state=selected.contains(entry["id"] as? String ?? "") ? .on : .off
                box.cell?.lineBreakMode = .byTruncatingMiddle
                box.setContentCompressionResistancePriority(.defaultLow,for:.horizontal)
                libraryView.addArrangedSubview(box);libraryChecks.append((entry,box))
                // The row must join the hierarchy BEFORE activating a constraint to its parent.
                box.widthAnchor.constraint(equalTo:libraryView.widthAnchor,constant:-8).isActive=true
                if let description=entry["description"] as? String,!description.isEmpty {let text=NSTextField(wrappingLabelWithString:description);text.textColor = .secondaryLabelColor;text.font = .systemFont(ofSize:12);libraryView.addArrangedSubview(text);text.widthAnchor.constraint(equalTo:libraryView.widthAnchor,constant:-8).isActive=true}
            }
    }

    @objc func openTailscale() {
        for id in ["io.tailscale.ipn.macsys","io.tailscale.ipn.macos"] {if let url=NSWorkspace.shared.urlForApplication(withBundleIdentifier:id){NSWorkspace.shared.openApplication(at:url,configuration:NSWorkspace.OpenConfiguration());return}}
        let alert=NSAlert();alert.messageText=tr("Installer Tailscale","Install Tailscale");alert.addButton(withTitle:tr("Annuller","Cancel"));alert.addButton(withTitle:tr("Hent Tailscale","Get Tailscale"));if alert.runModal() == .alertSecondButtonReturn {NSWorkspace.shared.open(URL(string:"https://tailscale.com/download")!)}
    }
    @objc func showDevices(){libraryCommand("devices"){_ in}}
    @objc func openVault() {libraryCommand("vault"){_ in}}
    @objc func inviteMail() {guard let e=oneEntry() else{return};libraryCommand("invite",["id":e["id"]!]){_ in}}
    @objc func configureSharing() {libraryCommand("sharing"){_ in self.reloadLibrary()}}
    @objc func configureStartup() {libraryCommand("startup"){_ in}}
    @objc func openHelp() {
        if let file=Bundle.main.url(forResource:danish ? "help-da" : "help-en",withExtension:"html") {NSWorkspace.shared.open(file)}
        else {showError(tr("Hjælpen mangler. Pak den nye ZIP-fil helt ud.","Help is missing. Extract the complete new ZIP."))}
    }
    @objc func addToLibrary() {libraryCommand("add"){_ in self.reloadLibrary()}}
    @objc func editSelected() {guard let e=oneEntry() else{return};libraryCommand("edit",["id":e["id"]!]){_ in self.reloadLibrary()}}
    @objc func exportSelected() {let ids=selectedEntries().compactMap{$0["id"] as? String};if ids.isEmpty {showError(tr("Markér de wikier, der skal med i oversigten.","Select the wikis to include in the overview."));return};libraryCommand("export",["ids":ids]){_ in}}
    @objc func shareSelected() {
        guard sharingID==nil && !libraryBusy else{return}
        let ids=selectedEntries().compactMap{$0["id"] as? String}.filter{id in !sessions.contains{$0.id==id}}
        if ids.isEmpty {showError(tr("Vælg en wiki, der ikke allerede kører.","Select a wiki that is not already running."));return}
        start.title=tr("Klargør…","Preparing…")
        libraryCommand("prepare",["ids":ids]) { result in
            self.start.title=tr("Del…","Share…")
            guard result?["ok"] as? Bool == true else{self.reloadLibrary();return}
            self.shareQueue=ids;self.advanceShareQueue(nil)
        }
    }
    func advanceShareQueue(_ completed:String?) {
        guard !quitting,sharingID==completed else{return}
        sharingID=nil
        guard !shareQueue.isEmpty else{return}
        let id=shareQueue.removeFirst();sharingID=id;nextID=id;nextLocal=false;startWiki()
    }
    @objc func openSelected() {launchSelected(local:true)}
    func launchSelected(local:Bool) {
        guard let e=oneEntry(),let id=e["id"] as? String,let location=e["location"] as? String else{return}
        if e["available"] as? Bool == false {showError(tr("Filen findes ikke længere på den gemte placering.","The file is no longer at its saved location."));return}
        if e["kind"] as? String == "html" {
            if local {NSWorkspace.shared.open(URL(fileURLWithPath:location))}
            else {showError(tr("En HTML-fil skal først kopieres til en serverwiki. Se hjælpen i ForgeShare. Originalen kan fortsat bruges lokalt.","An HTML file first needs copying into a server wiki. See ForgeShare help. The original can still be used locally."))};return
        }
        if let existing=sessions.first(where:{$0.id==id}) {
            if local && !existing.url.isEmpty {NSWorkspace.shared.open(URL(string:existing.ownerUrl.isEmpty ? existing.url:existing.ownerUrl)!)}
            else {showError(tr("Denne wiki kører allerede. Stop den først, hvis du vil ændre delingen.","This wiki is already running. Stop it first to change sharing."))};return
        }
        nextID=id;nextLocal=local;startWiki()
    }
    func update(_ s: Session) {
        let network=s.local ? tr("kun lokalt","local only") : s.mode=="lan" ? tr("hjemmenetværk","home network") : s.mode=="funnel" ? "Funnel" : "Tailscale"
        let login=s.mode=="funnel" ? tr("læser- og redaktørkode","reader and editor codes") : s.access=="open" ? tr("uden login","no login") : tr("med login","with login")
        s.label.stringValue=s.name+(s.stopping ? tr(" — stopper…"," — stopping…") : s.url.isEmpty ? "" : " — "+network+" · "+login)
        s.label.stringValue += s.url.isEmpty ? "" : "\n"+s.url;s.label.toolTip=s.label.stringValue
    }
    func stopSession(_ s: Session) { guard !s.stopping else { return }; s.stopping=true; s.stop.isEnabled=false; update(s)
        do { try s.input.fileHandleForWriting.write(contentsOf:Data("STOP\n".utf8)) } catch { showError(tr("Kunne ikke bede wikien stoppe. Brug wikiens statusdialog.", "Could not request a stop. Use the wiki's status dialog.")) }
    }
    @objc func stopClicked(_ sender:NSButton) { if let s=sessions.first(where:{$0.stop === sender}) { stopSession(s) } }
    @objc func inviteSession(_ sender:NSButton){if let s=sessions.first(where:{$0.invite === sender}){libraryCommand("invite",["id":s.id]){_ in}}}
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
    testApp.window=NSWindow(contentRect:NSRect(x:0,y:0,width:1000,height:660),styleMask:[.titled],backing:.buffered,defer:false)
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
    for size in [NSSize(width:1000,height:660),NSSize(width:900,height:600)] {
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
