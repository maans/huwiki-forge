using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using System.Reflection;
using System.Security.Cryptography;
[assembly: AssemblyTitle("ForgeShare")]
[assembly: AssemblyVersion("0.1.7.0")]

class Session {
    public Process Process; public string Name, Url = "", OwnerUrl = "", Id="", Mode="", Access=""; public bool Stopping, Local, OpenWhenReady;
    public FlowLayoutPanel Row; public Label Label; public Button Copy, Stop, Invite;
}
class LibraryEntry {
    public string id,name,kind,location,description,shareUrl;public bool available;
    public override string ToString() {bool da=CultureInfo.CurrentUICulture.TwoLetterISOLanguageName=="da";return name+"  ·  "+(!available?(da?"Filen mangler":"File missing"):kind=="site"?"Site":kind=="html"?(da?"Lokal HTML-fil":"Local HTML file"):(da?"Wikimappe":"Wiki folder"))+(String.IsNullOrEmpty(description)?"":" — "+description);}
}
class StartupChoice {public string wikiId,mode;public bool allowAnonymous;}
class StartupData {public StartupChoice startup;}
class PrepareData {public bool ok;public LibraryEntry[] entries;}
class SharingData {public string mode;public bool allowAnonymous;}
class LibraryData {public SharingData sharing;public string id;public LibraryEntry[] entries;}
class ForgeShare : Form {
    static int VaultCommand(string command) {
        try {
            Console.InputEncoding=Encoding.UTF8;Console.OutputEncoding=new UTF8Encoding(false);
            string folder=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"ForgeShare");
            string file=Path.Combine(folder,"vault.dpapi");
            if(command=="read") {Console.Write(File.Exists(file)?Encoding.UTF8.GetString(ProtectedData.Unprotect(File.ReadAllBytes(file),null,DataProtectionScope.CurrentUser)):"{}");return 0;}
            if(command!="write")return 1;
            string input=Console.In.ReadToEnd();if(input.Length>1048576)return 1;
            new JavaScriptSerializer().DeserializeObject(input);
            Directory.CreateDirectory(folder);string temp=file+"."+Guid.NewGuid().ToString();
            File.WriteAllBytes(temp,ProtectedData.Protect(Encoding.UTF8.GetBytes(input),null,DataProtectionScope.CurrentUser));
            if(File.Exists(file))File.Replace(temp,file,null);else File.Move(temp,file);return 0;
        }catch{return 1;}
    }
    readonly NotifyIcon tray=new NotifyIcon();bool explicitQuit=false;
    static bool Danish = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "da";
    static string T(string da, string en) { return Danish ? da : en; }
    readonly Queue<string> shareQueue=new Queue<string>();string sharingID=null;
    readonly List<Session> sessions = new List<Session>();
    readonly FlowLayoutPanel rows = new FlowLayoutPanel();
    readonly Button start = new Button();
    readonly Label empty = new Label(),sharingLabel=new Label {AutoSize=true};
    bool quitting = false,libraryBusy=false,nextLocal=false,nextStartup=false,checkStartup=true,checkDiscovery=true;string nextID="";
    readonly CheckedListBox library=new CheckedListBox();readonly List<Button> libraryButtons=new List<Button>();
    static string Helper { get { return Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"ForgeShare.mjs"); } }
    static string Node() {
        var candidates = new List<string>();
        foreach (string root in new [] { Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86) })
            candidates.Add(Path.Combine(root,"nodejs","node.exe"));
        foreach (string root in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator))
            if (!String.IsNullOrWhiteSpace(root)) candidates.Add(Path.Combine(root.Trim('"'),"node.exe"));
        return candidates.Find(File.Exists);
    }
    static ProcessStartInfo Command(string node, string args) {
        var info = new ProcessStartInfo(node,args) { UseShellExecute=false, CreateNoWindow=true,
            RedirectStandardInput=true, RedirectStandardOutput=true, RedirectStandardError=true,
            StandardOutputEncoding=Encoding.UTF8, WorkingDirectory=AppDomain.CurrentDomain.BaseDirectory };
        info.EnvironmentVariables["FORGESHARE_NATIVE"]=Application.ExecutablePath;info.EnvironmentVariables["FORGESHARE_APP"]=Application.ExecutablePath;info.EnvironmentVariables.Remove("NODE_OPTIONS"); info.EnvironmentVariables.Remove("NODE_PATH"); info.EnvironmentVariables["FORGESHARE_LANGUAGE"]=Danish?"da":"en"; return info;
    }
    static string Quote(string path) { return "\"" + path + "\""; }
    static bool PermittedAddress(Uri address) {
        if(!String.IsNullOrEmpty(address.UserInfo))return false;
        if(address.Scheme=="https")return address.Host.EndsWith(".ts.net",StringComparison.OrdinalIgnoreCase);
        if(address.Scheme!="http")return false;
        if(address.Host=="127.0.0.1")return true;
        System.Net.IPAddress ip;
        if(!System.Net.IPAddress.TryParse(address.Host,out ip) || ip.AddressFamily!=System.Net.Sockets.AddressFamily.InterNetwork)return false;
        var p=ip.GetAddressBytes();return p[0]==10 || (p[0]==172 && p[1]>=16 && p[1]<=31) || (p[0]==192 && p[1]==168);
    }
    [STAThread] static int Main(string[] args) {
        if(args.Length==1 && args[0]=="--mail"){Console.InputEncoding=Encoding.UTF8;string uri=Console.In.ReadToEnd();if(!uri.StartsWith("mailto:")||uri.Length>32000)return 1;Process.Start(new ProcessStartInfo(uri){UseShellExecute=true});return 0;}
        if(args.Length==2 && args[0]=="--vault")return VaultCommand(args[1]);
        if (Array.IndexOf(args,"--self-test") >= 0) {
            var node=Node(); if(node==null || !File.Exists(Helper)) return 2;
            using(var p=Process.Start(Command(node,"--check " + Quote(Helper)))) { p.WaitForExit(); if(p.ExitCode!=0)return p.ExitCode; }
            var data=new JavaScriptSerializer().Deserialize<LibraryData>("{\"entries\":[{\"id\":\"test\",\"name\":\"Notes\",\"kind\":\"html\",\"available\":true}]}");
            if(data.entries.Length!=1 || data.entries[0].name!="Notes")return 3;
            Application.EnableVisualStyles();
            using(var form=new ForgeShare()) {form.CreateControl();form.PerformLayout();form.Controls[0].PerformLayout();if(form.libraryButtons.Count!=5 || form.libraryButtons[4].Right>740)return 4;}
            foreach(var value in new[]{"http://127.0.0.1:20000","http://192.168.1.8:20000","http://10.0.0.8:20000","https://example.ts.net:21000"})if(!PermittedAddress(new Uri(value)))return 5;
            foreach(var value in new[]{"http://0.0.0.0:20000","http://8.8.8.8:20000","http://100.64.0.1:20000","file:///C:/wiki"})if(PermittedAddress(new Uri(value)))return 6;
            return 0;
        }
        Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new ForgeShare()); return 0;
    }
    ForgeShare() {
        Text="ForgeShare";Width=1100;Height=720;MinimumSize=new Size(1000,660);StartPosition=FormStartPosition.CenterScreen;
        Font=new Font("Segoe UI",10);Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        var shell=new TableLayoutPanel {Dock=DockStyle.Fill,ColumnCount=2,RowCount=1};shell.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,180));shell.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
        var sidebar=new FlowLayoutPanel {Dock=DockStyle.Fill,FlowDirection=FlowDirection.TopDown,WrapContents=false,Padding=new Padding(12),BackColor=SystemColors.Control};
        sidebar.Controls.Add(new Label {Text="ForgeShare",Font=new Font(Font.FontFamily,18,FontStyle.Bold),AutoSize=true,Margin=new Padding(0,12,0,20)});
        var detail=new Panel {Dock=DockStyle.Fill,Padding=new Padding(24)};shell.Controls.Add(sidebar,0,0);shell.Controls.Add(detail,1,0);Controls.Add(shell);
        var pages=new List<Panel>();
        Func<string,string,Panel> makePage=(title,description)=>{
            var p=new Panel {Dock=DockStyle.Fill};
            p.Controls.Add(new Label {Text=title,Font=new Font(Font.FontFamily,25,FontStyle.Bold),AutoSize=true,Location=new Point(0,0)});
            p.Controls.Add(new Label {Text=description,Location=new Point(0,55),Width=730,Height=60,ForeColor=SystemColors.GrayText});detail.Controls.Add(p);pages.Add(p);return p;
        };
        var libraryPage=makePage(T("Dit bibliotek","Your library"),T("Wikier og sites, samlet ét sted.","Wikis and sites, together in one place."));
        var toolbar=new FlowLayoutPanel {Location=new Point(0,110),Width=740,Height=45,WrapContents=false};
        string[] labels={T("Tilføj…","Add…"),T("Åbn","Open"),T("Del…","Share…"),T("Redigér…","Edit…"),T("Eksportér…","Export…")};
        Action[] actions={AddToLibrary,()=>LaunchSelected(true),ShareSelected,EditSelected,ExportSelected};
        for(int i=0;i<labels.Length;i++){var a=actions[i];var button=i==2?start:new Button();button.Text=labels[i];button.AutoSize=true;button.Click+=(sender,args)=>a();toolbar.Controls.Add(button);libraryButtons.Add(button);}
        libraryPage.Controls.Add(toolbar);library.CheckOnClick=true;library.HorizontalScrollbar=true;library.SetBounds(0,165,740,330);library.Anchor=AnchorStyles.Top|AnchorStyles.Bottom|AnchorStyles.Left|AnchorStyles.Right;libraryPage.Controls.Add(library);
        sharingLabel.Text=T("Finder dine wikier…","Finding your wikis…");sharingLabel.SetBounds(0,510,740,30);sharingLabel.Anchor=AnchorStyles.Bottom|AnchorStyles.Left;libraryPage.Controls.Add(sharingLabel);
        var sharePage=makePage(T("Aktive delinger","Active sharing"),T("Kopiér adressen, eller send en invitation. Stop afslutter kun den valgte deling.","Copy an address or send an invitation. Stop ends only the selected item."));
        empty.Text=T("Ingen delinger kører endnu.","Nothing is shared yet.");empty.AutoSize=true;empty.Location=new Point(0,120);sharePage.Controls.Add(empty);
        rows.SetBounds(0,160,740,330);rows.Anchor=AnchorStyles.Top|AnchorStyles.Bottom|AnchorStyles.Left|AnchorStyles.Right;rows.FlowDirection=FlowDirection.TopDown;rows.WrapContents=false;rows.AutoScroll=true;sharePage.Controls.Add(rows);
        sharePage.Controls.Add(new Label {Text=T("Computeren skal være tændt. Du kan lukke vinduet; ForgeShare fortsætter ved uret.","Keep this computer on. You can close the window; ForgeShare stays in the system tray."),Location=new Point(0,510),Width=730,Height=50,Anchor=AnchorStyles.Bottom|AnchorStyles.Left,ForeColor=SystemColors.GrayText});
        var connections=makePage(T("Dine forbindelser","Your connections"),T("Gem AI-forbindelser og adgangskoder i computerens nøgleboks. Du bestemmer, hvem der må bruge dem.","Save AI connections and passwords in this computer’s vault. You decide who may use them."));
        Action<Panel,string,int,Action> addButton=(panel,label,y,action)=>{var button=new Button {Text=label,Location=new Point(0,y),Size=new Size(260,44)};button.Click+=(sender,args)=>action();panel.Controls.Add(button);};
        addButton(connections,T("Åbn nøgleboks…","Open vault…"),130,()=>LibraryCommand("vault",new {},text=>{}));
        addButton(connections,T("Tailscale-enheder…","Tailscale devices…"),190,()=>LibraryCommand("devices",new {},text=>{}));
        var settings=makePage(T("Indstillinger","Settings"),T("Vælg, hvordan ForgeShare skal starte og dele.","Choose how ForgeShare starts and shares."));
        addButton(settings,T("Delingsindstillinger…","Sharing settings…"),130,()=>LibraryCommand("sharing",new {},text=>ReloadLibrary()));
        addButton(settings,T("Start ved login…","Start at login…"),190,()=>LibraryCommand("startup",new {},text=>{}));
        addButton(settings,T("Åbn Tailscale","Open Tailscale"),250,()=>{
            string file=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),"Tailscale","tailscale-ipn.exe");
            if(File.Exists(file))Process.Start(new ProcessStartInfo(file){UseShellExecute=true});
            else if(MessageBox.Show(T("Hent Tailscale fra den officielle hjemmeside?","Get Tailscale from the official website?"),"ForgeShare",MessageBoxButtons.OKCancel)==DialogResult.OK)Process.Start(new ProcessStartInfo("https://tailscale.com/download"){UseShellExecute=true});
        });
        addButton(settings,T("Hjælp","Help"),310,OpenHelp);
        string[] names={T("Bibliotek","Library"),T("Delinger","Sharing"),T("Forbindelser","Connections"),T("Indstillinger","Settings")};
        for(int i=0;i<names.Length;i++){int index=i;var button=new Button {Text=names[i],Size=new Size(148,44),TextAlign=ContentAlignment.MiddleLeft};button.Click+=(sender,args)=>{for(int j=0;j<pages.Count;j++)pages[j].Visible=j==index;};sidebar.Controls.Add(button);}
        for(int i=0;i<pages.Count;i++)pages[i].Visible=i==0;
        sidebar.Controls.Add(new Label {Text=T("Fortsætter, når du lukker vinduet.","Keeps running when you close the window."),Width=148,Height=80,ForeColor=SystemColors.GrayText});
        var menu=new ContextMenuStrip();menu.Items.Add(T("Åbn ForgeShare","Open ForgeShare"),null,(s,e)=>{Show();WindowState=FormWindowState.Normal;Activate();});menu.Items.Add(T("Afslut ForgeShare","Quit ForgeShare"),null,(s,e)=>{explicitQuit=true;Close();});tray.Icon=Icon;tray.Text="ForgeShare";tray.ContextMenuStrip=menu;tray.DoubleClick+=(s,e)=>{Show();Activate();};
        FormClosing+=OnClosing;Shown+=(sender,args)=>{tray.Visible=true;ReloadLibrary();};FormClosed+=(s,e)=>tray.Dispose();
    }
    void UI(Action action) { if (!IsDisposed && IsHandleCreated) BeginInvoke(action); }
    void StartWiki() {
        bool startupLaunch=nextStartup;nextStartup=false;
        var node=Node();
        if(node==null) {
            if(MessageBox.Show(T("Node.js skal installeres først. Vil du åbne den officielle downloadside?","Install Node.js first. Open its official download page?"),"ForgeShare",MessageBoxButtons.YesNo)==DialogResult.Yes)
                Process.Start(new ProcessStartInfo("https://nodejs.org/en/download") { UseShellExecute=true });
            sharingID=null;shareQueue.Clear();return;
        }
        if(!File.Exists(Helper)) { sharingID=null;shareQueue.Clear();MessageBox.Show(T("Pak hele ZIP-filen ud. ForgeShare.mjs skal ligge ved siden af programmet.","Extract the whole ZIP. ForgeShare.mjs must stay beside the application."),"ForgeShare"); return; }
        var session=new Session { Id=nextID,Local=nextLocal,OpenWhenReady=nextLocal && !startupLaunch,Name=T("Vælger wiki…","Choosing a wiki…"), Row=new FlowLayoutPanel { AutoSize=true,WrapContents=false } };
        nextID="";nextLocal=false;
        session.Label=new Label { Width=300,Height=56,AutoEllipsis=true,TextAlign=ContentAlignment.MiddleLeft };
        session.Copy=new Button { Text=T("Kopiér adresse","Copy address"),AutoSize=true,Enabled=false };
        session.Stop=new Button { Text="Stop",AutoSize=true };
        session.Copy.Click+=(s,e)=>Clipboard.SetText(session.Url); session.Stop.Click+=(s,e)=>Stop(session);
        session.Invite=new Button {Text=T("Invitér…","Invite…"),AutoSize=true,Enabled=false};session.Invite.Click+=(sender,args)=>LibraryCommand("invite",new {id=session.Id},text=>{});
        session.Row.Controls.AddRange(new Control[] { session.Label,session.Copy,session.Invite,session.Stop });
        session.Process=new Process { StartInfo=Command(node,Quote(Helper)+" --gui --app --quick"+(session.Id.Length==0?"":" --profile "+session.Id)+(session.Local?" --local":"")+(startupLaunch?" --startup":"")),EnableRaisingEvents=true };
        session.Process.OutputDataReceived+=(s,e)=> {
            if(e.Data==null || e.Data.Length>65536) return;
            try { var data=new JavaScriptSerializer().Deserialize<Dictionary<string,string>>(e.Data);
                UI(()=> { if(!sessions.Contains(session)) return;
                    if(data.ContainsKey("name")) session.Name=data["name"];
                    Uri address;
                    if(data.ContainsKey("event") && data["event"]=="ready" && data.ContainsKey("url") && Uri.TryCreate(data["url"],UriKind.Absolute,out address) && PermittedAddress(address)) { session.Mode=data.ContainsKey("mode")?data["mode"]:"";session.Access=data.ContainsKey("access")?data["access"]:"login";session.Url=data["url"]; Uri own; if(data.ContainsKey("ownerUrl") && Uri.TryCreate(data["ownerUrl"],UriKind.Absolute,out own) && own.Scheme=="http" && own.Host=="127.0.0.1")session.OwnerUrl=data["ownerUrl"]; session.Copy.Enabled=true;if(session.Invite!=null)session.Invite.Enabled=!session.Local; if(session.OpenWhenReady){session.OpenWhenReady=false;Process.Start(new ProcessStartInfo(session.OwnerUrl.Length>0?session.OwnerUrl:session.Url){UseShellExecute=true});} ReloadLibrary(); AdvanceShareQueue(session.Id); }
                    Update(session);
                });
            } catch { }
        };
        // Drain stderr without exposing subprocess output or passwords in the UI.
        session.Process.ErrorDataReceived+=(s,e)=>{};
        session.Process.Exited+=(s,e)=>UI(()=> { if(sharingID==session.Id){sharingID=null;shareQueue.Clear();} rows.Controls.Remove(session.Row); sessions.Remove(session); session.Row.Dispose(); session.Process.Dispose(); empty.Visible=sessions.Count==0; if(!quitting)ReloadLibrary(); if(quitting && sessions.Count==0) Close(); });
        try { sessions.Add(session); rows.Controls.Add(session.Row); empty.Visible=false; Update(session);
            session.Process.Start(); session.Process.BeginOutputReadLine(); session.Process.BeginErrorReadLine();
        } catch { sharingID=null;shareQueue.Clear();sessions.Remove(session); rows.Controls.Remove(session.Row); session.Row.Dispose(); session.Process.Dispose(); empty.Visible=sessions.Count==0;
            MessageBox.Show(T("Wikien kunne ikke startes. Kontroller Node.js-installationen.","The wiki could not start. Check your Node.js installation."),"ForgeShare"); }
    }
    List<LibraryEntry> SelectedEntries() {var list=new List<LibraryEntry>();foreach(var item in library.CheckedItems)list.Add((LibraryEntry)item);return list;}
    LibraryEntry OneEntry() {var items=SelectedEntries();if(items.Count!=1){MessageBox.Show(T("Markér én wiki på listen.","Select one wiki in the list."),"ForgeShare");return null;}return items[0];}
    void LibraryCommand(string action,object input,Action<string> done) {
        if(libraryBusy)return;var node=Node();
        if(node==null || !File.Exists(Helper)){MessageBox.Show(T("Installer Node.js for at bruge wikibiblioteket.","Install Node.js to use the wiki library."),"ForgeShare");return;}
        libraryBusy=true;foreach(var b in libraryButtons)b.Enabled=false;
        var data=Convert.ToBase64String(Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(input)));
        System.Threading.Tasks.Task.Run(()=>{
            string output=null;
            try {using(var p=new Process {StartInfo=Command(node,Quote(Helper)+" --gui --library "+action+" "+data)}) {
                p.ErrorDataReceived+=(s,e)=>{};p.Start();p.BeginErrorReadLine();var text=p.StandardOutput.ReadToEnd();p.WaitForExit();if(p.ExitCode==0)output=text;
            }}catch{}
            UI(()=>{libraryBusy=false;foreach(var b in libraryButtons)b.Enabled=true;done(output);});
        });
    }
    void ReloadLibrary() {
        var selected=new HashSet<string>();foreach(var e in SelectedEntries())selected.Add(e.id);
        var action=checkDiscovery?"discover-auto":"list";checkDiscovery=false;
        LibraryCommand(action,new {},text=>{
            try {
                if(text==null)throw new Exception();var data=new JavaScriptSerializer().Deserialize<LibraryData>(text);
                if(data.sharing!=null)sharingLabel.Text=T("Deling: ","Sharing: ")+(data.sharing.mode=="lan"?T("Hjemmenetværk","Home network"):data.sharing.mode=="funnel"?"Funnel":"Tailscale")+" · "+(data.sharing.mode=="funnel"?T("læser- og redaktørkode","reader and editor codes"):data.sharing.allowAnonymous?T("uden wiki-login","no wiki login"):T("med wiki-login","with wiki login"));
                library.Items.Clear();foreach(var e in data.entries)library.Items.Add(e,selected.Contains(e.id));
                if(checkStartup){checkStartup=false;LibraryCommand("startup-status",new {},value=>{
                    if(value==null)return;var setting=new JavaScriptSerializer().Deserialize<StartupData>(value).startup;
                    if(setting!=null){nextID=setting.wikiId;nextLocal=setting.mode=="local";nextStartup=true;StartWiki();}
                });}
            }catch {MessageBox.Show(T("Wikibiblioteket kunne ikke læses. Ingen filer er ændret.","The wiki library could not be read. No files were changed."),"ForgeShare");}
        });
    }
    void OpenHelp() {
        var file=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,Danish?"help-da.html":"help-en.html");
        if(File.Exists(file))Process.Start(new ProcessStartInfo(file){UseShellExecute=true});
        else MessageBox.Show(T("Hjælpen mangler. Pak den nye ZIP-fil helt ud.","Help is missing. Extract the complete new ZIP."),"ForgeShare");
    }
    void AddToLibrary() {LibraryCommand("add",new {},text=>ReloadLibrary());}
    void EditSelected() {var e=OneEntry();if(e!=null)LibraryCommand("edit",new {id=e.id},text=>ReloadLibrary());}
    void ExportSelected() {
        var ids=new List<string>();foreach(var e in SelectedEntries())ids.Add(e.id);
        if(ids.Count==0){MessageBox.Show(T("Markér de wikier, der skal med i oversigten.","Select the wikis to include in the overview."),"ForgeShare");return;}
        LibraryCommand("export",new {ids=ids},text=>{});
    }
    void ShareSelected() {
        if(sharingID!=null || libraryBusy)return;
        var ids=new List<string>();foreach(var e in SelectedEntries())if(!sessions.Exists(s=>s.Id==e.id))ids.Add(e.id);
        if(ids.Count==0){MessageBox.Show(T("Vælg en wiki, der ikke allerede kører.","Select a wiki that is not already running."),"ForgeShare");return;}
        start.Text=T("Klargør…","Preparing…");
        LibraryCommand("prepare",new {ids=ids},text=>{
            start.Text=T("Del…","Share…");
            try {if(text==null || !new JavaScriptSerializer().Deserialize<PrepareData>(text).ok){ReloadLibrary();return;}}
            catch {ReloadLibrary();return;}
            foreach(var id in ids)shareQueue.Enqueue(id);AdvanceShareQueue(null);
        });
    }
    void AdvanceShareQueue(string completed) {
        if(quitting || sharingID!=completed)return;sharingID=null;
        if(shareQueue.Count==0)return;
        sharingID=shareQueue.Dequeue();nextID=sharingID;nextLocal=false;StartWiki();
    }
    void LaunchSelected(bool local) {
        var e=OneEntry();if(e==null)return;
        if(!e.available){MessageBox.Show(T("Filen findes ikke længere på den gemte placering.","The file is no longer at its saved location."),"ForgeShare");return;}
        if(e.kind=="html") {
            if(local){try{Process.Start(new ProcessStartInfo(e.location){UseShellExecute=true});}catch{MessageBox.Show(T("Filen kunne ikke åbnes.","The file could not be opened."),"ForgeShare");}}
            else MessageBox.Show(T("En HTML-fil skal først kopieres til en serverwiki. Se hjælpen i ForgeShare. Originalen kan fortsat bruges lokalt.","An HTML file first needs copying into a server wiki. See ForgeShare help. The original can still be used locally."),"ForgeShare");return;
        }
        var existing=sessions.Find(s=>s.Id==e.id);
        if(existing!=null) {
            if(local && existing.Url.Length>0)Process.Start(new ProcessStartInfo(existing.OwnerUrl.Length>0?existing.OwnerUrl:existing.Url){UseShellExecute=true});
            else MessageBox.Show(T("Denne wiki kører allerede. Stop den først for at ændre delingen.","This wiki is already running. Stop it first to change sharing."),"ForgeShare");return;
        }
        nextID=e.id;nextLocal=local;StartWiki();
    }
    void Update(Session s) {
        var network=s.Local?T("kun lokalt","local only"):s.Mode=="lan"?T("hjemmenetværk","home network"):s.Mode=="funnel"?"Funnel":"Tailscale";
        var login=s.Mode=="funnel"?T("læser- og redaktørkode","reader and editor codes"):s.Access=="open"?T("uden login","no login"):T("med login","with login");
        s.Label.Text=s.Name+(s.Stopping?T(" — stopper…"," — stopping…"):s.Url.Length==0?"":" — "+network+" · "+login)+(s.Url.Length==0?"":"\n"+s.Url);
    }
    void Stop(Session s) { if(s.Stopping) return; s.Stopping=true; s.Stop.Enabled=false; Update(s);
        try { s.Process.StandardInput.Write("STOP\n"); s.Process.StandardInput.Flush(); }
        catch { MessageBox.Show(T("Brug wikiens statusdialog til at stoppe delingen.","Use the wiki's status dialog to stop sharing."),"ForgeShare"); }
    }
    void OnClosing(object sender,FormClosingEventArgs e) {
        if(e.CloseReason==CloseReason.UserClosing && !explicitQuit){e.Cancel=true;Hide();return;}
        if(libraryBusy){explicitQuit=false;e.Cancel=true;MessageBox.Show(T("Afslut først biblioteksdialogen.","Finish the library dialog first."),"ForgeShare");return;}
        if(sessions.Count==0) return; e.Cancel=true;
        if(quitting) return;
        if(MessageBox.Show(T("Stop alle wikier startet i dette vindue og afslut? Vent først på, at ændringer er gemt.","Stop all wikis started in this window and quit? Wait for your edits to save first."),"ForgeShare",MessageBoxButtons.OKCancel)!=DialogResult.OK) {explicitQuit=false;return;}
        quitting=true; start.Enabled=false; foreach(var s in sessions.ToArray()) Stop(s);
    }
}
