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
[assembly: AssemblyTitle("ForgeShare")]
[assembly: AssemblyVersion("0.1.6.0")]

class Session {
    public Process Process; public string Name, Url = "", Id="", Mode="", Access=""; public bool Stopping, Local, OpenWhenReady;
    public FlowLayoutPanel Row; public Label Label; public Button Copy, Stop;
}
class LibraryEntry {
    public string id,name,kind,location,description,shareUrl;public bool available;
    public override string ToString() {bool da=CultureInfo.CurrentUICulture.TwoLetterISOLanguageName=="da";return name+"  ·  "+(!available?(da?"Filen mangler":"File missing"):kind=="html"?(da?"Lokal HTML-fil":"Local HTML file"):(da?"Wikimappe":"Wiki folder"))+(String.IsNullOrEmpty(description)?"":" — "+description);}
}
class StartupChoice {public string wikiId,mode;public bool allowAnonymous;}
class StartupData {public StartupChoice startup;}
class PrepareData {public bool ok;public LibraryEntry[] entries;}
class SharingData {public string mode;public bool allowAnonymous;}
class LibraryData {public SharingData sharing;public string id;public LibraryEntry[] entries;}
class ForgeShare : Form {
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
        info.EnvironmentVariables.Remove("NODE_OPTIONS"); info.EnvironmentVariables.Remove("NODE_PATH"); info.EnvironmentVariables["FORGESHARE_LANGUAGE"]=Danish?"da":"en"; return info;
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
        if (Array.IndexOf(args,"--self-test") >= 0) {
            var node=Node(); if(node==null || !File.Exists(Helper)) return 2;
            using(var p=Process.Start(Command(node,"--check " + Quote(Helper)))) { p.WaitForExit(); if(p.ExitCode!=0)return p.ExitCode; }
            var data=new JavaScriptSerializer().Deserialize<LibraryData>("{\"entries\":[{\"id\":\"test\",\"name\":\"Notes\",\"kind\":\"html\",\"available\":true}]}");
            if(data.entries.Length!=1 || data.entries[0].name!="Notes")return 3;
            Application.EnableVisualStyles();
            using(var form=new ForgeShare()) {form.CreateControl();form.PerformLayout();form.Controls[0].PerformLayout();if(form.libraryButtons.Count!=5 || form.Controls[0].Controls[form.Controls[0].Controls.Count-1].Bottom>form.Controls[0].ClientSize.Height)return 4;}
            foreach(var value in new[]{"http://127.0.0.1:20000","http://192.168.1.8:20000","http://10.0.0.8:20000","https://example.ts.net:21000"})if(!PermittedAddress(new Uri(value)))return 5;
            foreach(var value in new[]{"http://0.0.0.0:20000","http://8.8.8.8:20000","http://100.64.0.1:20000","file:///C:/wiki"})if(PermittedAddress(new Uri(value)))return 6;
            return 0;
        }
        Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new ForgeShare()); return 0;
    }
    ForgeShare() {
        Text="ForgeShare"; Width=850; Height=650; MinimumSize=new Size(750,620); StartPosition=FormStartPosition.CenterScreen;
        Font=new Font("Segoe UI",10); Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        var content=new TableLayoutPanel { Dock=DockStyle.Fill, Padding=new Padding(24), ColumnCount=1, RowCount=8 };
        foreach(var height in new [] {50,35,48,0,35,35,100,55})content.RowStyles.Add(new RowStyle(height==0?SizeType.Percent:SizeType.Absolute,height==0?100:height));
        var header=new TableLayoutPanel {Dock=DockStyle.Fill,ColumnCount=4,RowCount=1};
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,110));header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,80));header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,100));
        header.Controls.Add(new Label {Text="ForgeShare",Font=new Font("Segoe UI",25,FontStyle.Bold),AutoSize=true},0,0);
        var sharingButton=new Button {Text=T("Deling…","Sharing…"),Dock=DockStyle.Fill};sharingButton.Click+=(sender,args)=>LibraryCommand("sharing",new {},text=>ReloadLibrary());header.Controls.Add(sharingButton,3,0);
        var startupButton=new Button {Text=T("Opstart…","Startup…"),Dock=DockStyle.Fill};startupButton.Click+=(sender,args)=>LibraryCommand("startup",new {},text=>{});header.Controls.Add(startupButton,1,0);
        var helpButton=new Button {Text=T("Hjælp","Help"),Dock=DockStyle.Fill};helpButton.Click+=(sender,args)=>OpenHelp();header.Controls.Add(helpButton,2,0);content.Controls.Add(header,0,0);
        sharingLabel.Text=T("Finder dine wikier…","Finding your wikis…");content.Controls.Add(sharingLabel,0,1);
        var toolbar=new FlowLayoutPanel {Dock=DockStyle.Fill,WrapContents=false};
        string[] labels={T("Tilføj…","Add…"),T("Åbn","Open"),T("Del…","Share…"),T("Redigér…","Edit…"),T("Eksportér valgte…","Export selected…")};
        Action[] actions={AddToLibrary,()=>LaunchSelected(true),ShareSelected,EditSelected,ExportSelected};
        for(int i=0;i<labels.Length;i++){var a=actions[i];var button=i==2?start:new Button();button.Text=labels[i];button.AutoSize=true;button.Click+=(sender,args)=>a();toolbar.Controls.Add(button);libraryButtons.Add(button);}
        content.Controls.Add(toolbar,0,2);
        library.Dock=DockStyle.Fill;library.CheckOnClick=true;library.HorizontalScrollbar=true;content.Controls.Add(library,0,3);
        content.Controls.Add(new Label {Text=T("Aktive serverwikier","Active server wikis"),AutoSize=true,Font=new Font(Font,FontStyle.Bold)},0,4);
        empty.Text=T("Ingen serverwikier kører endnu.","No server wikis are running yet.");empty.AutoSize=true;content.Controls.Add(empty,0,5);
        rows.Dock=DockStyle.Fill;rows.FlowDirection=FlowDirection.TopDown;rows.WrapContents=false;rows.AutoScroll=true;content.Controls.Add(rows,0,6);
        content.Controls.Add(new Label {Text=T("Deling virker, mens computeren er tændt og ForgeShare kører.\nStop afslutter kun den valgte wiki.","Sharing works while this computer is on and ForgeShare is running.\nStop ends only the selected wiki."),Dock=DockStyle.Fill,ForeColor=SystemColors.GrayText},0,7);
        Controls.Add(content);FormClosing+=OnClosing;Shown+=(sender,args)=>ReloadLibrary();
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
        session.Row.Controls.AddRange(new Control[] { session.Label,session.Copy,session.Stop });
        session.Process=new Process { StartInfo=Command(node,Quote(Helper)+" --gui --app --quick"+(session.Id.Length==0?"":" --profile "+session.Id)+(session.Local?" --local":"")+(startupLaunch?" --startup":"")),EnableRaisingEvents=true };
        session.Process.OutputDataReceived+=(s,e)=> {
            if(e.Data==null || e.Data.Length>65536) return;
            try { var data=new JavaScriptSerializer().Deserialize<Dictionary<string,string>>(e.Data);
                UI(()=> { if(!sessions.Contains(session)) return;
                    if(data.ContainsKey("name")) session.Name=data["name"];
                    Uri address;
                    if(data.ContainsKey("event") && data["event"]=="ready" && data.ContainsKey("url") && Uri.TryCreate(data["url"],UriKind.Absolute,out address) && PermittedAddress(address)) { session.Mode=data.ContainsKey("mode")?data["mode"]:"";session.Access=data.ContainsKey("access")?data["access"]:"login";session.Url=data["url"]; session.Copy.Enabled=true; if(session.OpenWhenReady){session.OpenWhenReady=false;Process.Start(new ProcessStartInfo(session.Url){UseShellExecute=true});} ReloadLibrary(); AdvanceShareQueue(session.Id); }
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
                if(data.sharing!=null)sharingLabel.Text=T("Deling: ","Sharing: ")+(data.sharing.mode=="lan"?T("Hjemmenetværk","Home network"):"Tailscale")+" · "+(data.sharing.allowAnonymous?T("uden wiki-login","no wiki login"):T("med wiki-login","with wiki login"));
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
            if(local && existing.Url.Length>0)Process.Start(new ProcessStartInfo(existing.Url){UseShellExecute=true});
            else MessageBox.Show(T("Denne wiki kører allerede. Stop den først for at ændre delingen.","This wiki is already running. Stop it first to change sharing."),"ForgeShare");return;
        }
        nextID=e.id;nextLocal=local;StartWiki();
    }
    void Update(Session s) {
        var network=s.Local?T("kun lokalt","local only"):s.Mode=="lan"?T("hjemmenetværk","home network"):"Tailscale";
        var login=s.Access=="open"?T("uden login","no login"):T("med login","with login");
        s.Label.Text=s.Name+(s.Stopping?T(" — stopper…"," — stopping…"):s.Url.Length==0?"":" — "+network+" · "+login)+(s.Url.Length==0?"":"\n"+s.Url);
    }
    void Stop(Session s) { if(s.Stopping) return; s.Stopping=true; s.Stop.Enabled=false; Update(s);
        try { s.Process.StandardInput.Write("STOP\n"); s.Process.StandardInput.Flush(); }
        catch { MessageBox.Show(T("Brug wikiens statusdialog til at stoppe delingen.","Use the wiki's status dialog to stop sharing."),"ForgeShare"); }
    }
    void OnClosing(object sender,FormClosingEventArgs e) {
        if(libraryBusy){e.Cancel=true;MessageBox.Show(T("Afslut først biblioteksdialogen.","Finish the library dialog first."),"ForgeShare");return;}
        if(sessions.Count==0) return; e.Cancel=true;
        if(quitting) return;
        if(MessageBox.Show(T("Stop alle wikier startet i dette vindue og afslut? Vent først på, at ændringer er gemt.","Stop all wikis started in this window and quit? Wait for your edits to save first."),"ForgeShare",MessageBoxButtons.OKCancel)!=DialogResult.OK) return;
        quitting=true; start.Enabled=false; foreach(var s in sessions.ToArray()) Stop(s);
    }
}
