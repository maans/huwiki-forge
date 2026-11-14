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
[assembly: AssemblyVersion("0.1.12.0")]

class Session {
    public Process Process; public string Name, Url = "", OwnerUrl = "", Id="", Mode="", Access=""; public bool Stopping, Local, OpenWhenReady;
    public FlowLayoutPanel Row; public Label Label; public Button Copy, Stop, Invite;
}
class LibraryEntry {
    public string id,name,kind,location,description,shareUrl;public bool available;public SharingData sharing;
    public override string ToString() {return name+"  ·  "+(kind=="site"?"Site":"Wiki");}
}
class StartupChoice {public string wikiId,mode;public bool allowAnonymous;}
class StartupData {public StartupChoice startup;}
class PrepareData {public bool ok;public LibraryEntry[] entries;}
class SharingData {public string mode;public bool allowAnonymous;}
class LibraryData {public SharingData sharing;public string id;public LibraryEntry[] entries;}
class LibraryListBox : ListBox {
    public readonly Dictionary<string,Button> Stops=new Dictionary<string,Button>();
    public Func<string,int> StopState; // 0 absent, 1 can stop, 2 stopping
    public Action<string> StopItem;
    public void RefreshStops() {
        var present=new HashSet<string>();
        for(int i=0;i<Items.Count;i++) {
            var entry=(LibraryEntry)Items[i];int state=StopState==null?0:StopState(entry.id);
            if(state==0)continue;present.Add(entry.id);Button button;
            if(!Stops.TryGetValue(entry.id,out button)) {
                string id=entry.id;button=new Button {Text="■ Stop",AccessibleName="Stop "+entry.name,Width=85,Height=30};
                button.Click+=(s,e)=>StopItem(id);Stops.Add(id,button);Controls.Add(button);
            }
            var rect=GetItemRectangle(i);button.SetBounds(ClientSize.Width-95,rect.Top+5,85,30);button.Enabled=state==1;
            button.Visible=rect.Top>=0&&rect.Bottom<=ClientSize.Height;
        }
        foreach(var id in new List<string>(Stops.Keys))if(!present.Contains(id)){Controls.Remove(Stops[id]);Stops[id].Dispose();Stops.Remove(id);}
    }
    protected override void WndProc(ref Message m) {
        base.WndProc(ref m);
        if(IsHandleCreated&&(m.Msg==0x115||m.Msg==0x20A||m.Msg==0x5||m.Msg==0x197))RefreshStops();
    }
}
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
    readonly LibraryListBox library=new LibraryListBox();readonly List<Button> libraryButtons=new List<Button>();
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
            using(var form=new ForgeShare()) {form.CreateControl();form.PerformLayout();form.Controls[0].PerformLayout();if(form.libraryButtons.Count!=5 || form.libraryButtons[4].Right>740)return 4;
                form.library.Items.Add(data.entries[0]);form.library.SelectedIndex=0;form.RefreshLibraryState();if(form.library.SelectionMode!=SelectionMode.One||!form.start.Enabled)return 7;
                var session=new Session {Id="test"};form.sessions.Add(session);form.RefreshLibraryState();if(form.start.Enabled||form.LibraryStatus("test")!=T("Starter…","Starting…"))return 8;
                session.Url="http://127.0.0.1:20000";session.Local=true;form.RefreshLibraryState();if(!form.library.Stops["test"].Enabled||form.LibraryStatus("test")!=T("Kører lokalt","Running locally"))return 9;
                if(form.LibrarySharing("test")!=""||form.HasSharing())return 12;session.Local=false;session.Mode="tailscale";if(form.LibrarySharing("test")!="Tailscale"||!form.HasSharing())return 13;session.Mode="funnel";if(form.LibrarySharing("test")!="Funnel")return 14;session.Mode="lan";if(form.LibrarySharing("test")!=T("Hjemmenetværk","Home network"))return 15;
                session.Stopping=true;form.RefreshLibraryState();if(form.library.Stops["test"].Enabled)return 10;form.sessions.Clear();form.RefreshLibraryState();if(form.library.Stops.Count!=0||!form.start.Enabled)return 11;}
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
        for(int i=0;i<labels.Length;i++){var a=actions[i];var button=i==2?start:new Button();button.Text=new[]{"＋ ","↗ ","⇧ ","✎ ","⇩ "}[i]+labels[i];button.AutoSize=true;button.Click+=(sender,args)=>a();toolbar.Controls.Add(button);libraryButtons.Add(button);}
        library.StopState=id=>{var s=sessions.Find(x=>x.Id==id);return s==null?0:s.Stopping?2:1;};library.StopItem=id=>{var s=sessions.Find(x=>x.Id==id);if(s!=null)Stop(s);};
        libraryPage.Controls.Add(toolbar);library.SelectionMode=SelectionMode.One;library.SelectedIndexChanged+=(s,e)=>RefreshLibraryState();library.DrawMode=DrawMode.OwnerDrawFixed;library.ItemHeight=40;library.DrawItem+=DrawLibraryRow;
        libraryPage.Controls.Add(new Label {Text=T("Vælg en wiki eller et site.","Choose a wiki or site."),AutoSize=true,Location=new Point(0,155),ForeColor=SystemColors.GrayText});library.HorizontalScrollbar=true;library.SetBounds(0,185,740,310);library.Anchor=AnchorStyles.Top|AnchorStyles.Bottom|AnchorStyles.Left|AnchorStyles.Right;libraryPage.Controls.Add(library);
        sharingLabel.Text=T("Finder dine wikier…","Finding your wikis…");sharingLabel.SetBounds(0,510,740,30);sharingLabel.Anchor=AnchorStyles.Bottom|AnchorStyles.Left;libraryPage.Controls.Add(sharingLabel);
        var sharePage=makePage(T("Aktive delinger","Active sharing"),T("Kopiér adressen, eller send en invitation.","Copy an address or send an invitation."));
        empty.Text=T("Intet deles endnu. Vælg Del i biblioteket.","Nothing is shared yet. Choose Share in the library.");empty.AutoSize=true;empty.Location=new Point(0,120);sharePage.Controls.Add(empty);
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
        session.Row.Controls.AddRange(new Control[] { session.Label,session.Copy,session.Invite });
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
        session.Process.Exited+=(s,e)=>UI(()=> { if(sharingID==session.Id){sharingID=null;shareQueue.Clear();} rows.Controls.Remove(session.Row); sessions.Remove(session); RefreshLibraryState(); session.Row.Dispose(); session.Process.Dispose(); empty.Visible=!sessions.Exists(x=>!x.Local&&x.Url.Length>0); if(!quitting)ReloadLibrary(); if(quitting && sessions.Count==0) Close(); });
        try { sessions.Add(session); rows.Controls.Add(session.Row); empty.Visible=false; Update(session);
            session.Process.Start(); session.Process.BeginOutputReadLine(); session.Process.BeginErrorReadLine();
        } catch { sharingID=null;shareQueue.Clear();sessions.Remove(session); rows.Controls.Remove(session.Row); session.Row.Dispose(); session.Process.Dispose(); empty.Visible=!sessions.Exists(x=>!x.Local&&x.Url.Length>0);
            MessageBox.Show(T("Wikien kunne ikke startes. Kontroller Node.js-installationen.","The wiki could not start. Check your Node.js installation."),"ForgeShare"); }
    }
    List<LibraryEntry> SelectedEntries() {var list=new List<LibraryEntry>();if(library.SelectedItem!=null)list.Add((LibraryEntry)library.SelectedItem);return list;}
    LibraryEntry OneEntry() {var items=SelectedEntries();if(items.Count!=1){MessageBox.Show(T("Markér én wiki på listen.","Select one wiki in the list."),"ForgeShare");return null;}return items[0];}
    string RequireNode() {
        var node=Node();if(node!=null)return node;
        if(MessageBox.Show(T("ForgeShare mangler Node.js. Åbn den officielle downloadside?","ForgeShare needs Node.js. Open the official download page?"),"ForgeShare",MessageBoxButtons.YesNo)==DialogResult.Yes)
            Process.Start(new ProcessStartInfo("https://nodejs.org/en/download") {UseShellExecute=true});
        while(MessageBox.Show(T("Installer Node.js, og vælg Prøv igen.","Install Node.js, then choose Retry."),"ForgeShare",MessageBoxButtons.RetryCancel)==DialogResult.Retry) {
            node=Node();if(node!=null)return node;
        }
        return null;
    }
    void LibraryCommand(string action,object input,Action<string> done) {
        if(libraryBusy)return;var node=RequireNode();
        if(node==null)return;
        if(node==null || !File.Exists(Helper)){MessageBox.Show(T("Installer Node.js for at bruge wikibiblioteket.","Install Node.js to use the wiki library."),"ForgeShare");return;}
        libraryBusy=true;foreach(var b in libraryButtons)b.Enabled=false;
        var data=Convert.ToBase64String(Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(input)));
        System.Threading.Tasks.Task.Run(()=>{
            string output=null;
            try {using(var p=new Process {StartInfo=Command(node,Quote(Helper)+" --gui --library "+action+" "+data)}) {
                p.ErrorDataReceived+=(s,e)=>{};p.Start();p.BeginErrorReadLine();var text=p.StandardOutput.ReadToEnd();p.WaitForExit();if(p.ExitCode==0)output=text;
            }}catch{}
            UI(()=>{libraryBusy=false;RefreshLibraryState();done(output);});
        });
    }
    void ReloadLibrary() {
        var selected=new HashSet<string>();foreach(var e in SelectedEntries())selected.Add(e.id);
        var action=checkDiscovery?"discover-auto":"list";checkDiscovery=false;
        LibraryCommand(action,new {},text=>{
            try {
                if(text==null)throw new Exception();var data=new JavaScriptSerializer().Deserialize<LibraryData>(text);
                sharingLabel.Text=T("Delingsvalg huskes for hver wiki og hvert site.","Sharing choices are remembered for each wiki and site.");
                library.Items.Clear();foreach(var e in data.entries){int index=library.Items.Add(e);if(selected.Contains(e.id))library.SelectedIndex=index;}RefreshLibraryState();
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
        using(var form=new Form {Text=T("Eksportér wikioversigt","Export wiki overview"),Size=new Size(530,480),StartPosition=FormStartPosition.CenterParent,Font=Font}) {
            var list=new CheckedListBox {CheckOnClick=true,Location=new Point(20,70),Size=new Size(470,300),Anchor=AnchorStyles.Top|AnchorStyles.Bottom|AnchorStyles.Left|AnchorStyles.Right};
            foreach(LibraryEntry e in library.Items)list.Items.Add(e.name,e==library.SelectedItem);
            var toggle=new Button {AutoSize=true,Location=new Point(20,20)};
            var export=new Button {Text=T("Eksportér…","Export…"),AutoSize=true,Location=new Point(270,390),DialogResult=DialogResult.OK};
            var cancel=new Button {Text=T("Annuller","Cancel"),AutoSize=true,Location=new Point(390,390),DialogResult=DialogResult.Cancel};
            Action changed=()=>{toggle.Text=list.CheckedItems.Count==list.Items.Count?T("Vælg ingen","Select none"):T("Vælg alle","Select all");export.Enabled=list.CheckedItems.Count>0;};
            toggle.Click+=(a,b)=>{bool all=list.CheckedItems.Count==list.Items.Count;for(int i=0;i<list.Items.Count;i++)list.SetItemChecked(i,!all);changed();};
            list.ItemCheck+=(a,b)=>form.BeginInvoke(changed);form.Controls.AddRange(new Control[]{list,toggle,export,cancel});form.AcceptButton=export;form.CancelButton=cancel;changed();
            if(form.ShowDialog(this)!=DialogResult.OK)return;
            var ids=new List<string>();foreach(int i in list.CheckedIndices)ids.Add(((LibraryEntry)library.Items[i]).id);
            if(ids.Count>0)LibraryCommand("export",new {ids=ids},text=>{});
        }
    }

    string LibraryStatus(string id) {
        var s=sessions.Find(x=>x.Id==id);if(s==null)return T("Stoppet","Stopped");
        if(s.Stopping)return T("Stopper…","Stopping…");if(s.Url.Length==0)return T("Starter…","Starting…");
        if(s.Local)return T("Kører lokalt","Running locally");return T("Delt via ","Shared via ")+(s.Mode=="lan"?T("hjemmenetværk","home network"):s.Mode=="funnel"?"Funnel":"Tailscale");
    }
    string LibrarySharing(string id) {
        var s=sessions.Find(x=>x.Id==id);if(s==null||s.Local)return "";
        if(s.Stopping)return T("Stopper…","Stopping…");if(s.Url.Length==0)return T("Starter…","Starting…");
        return s.Mode=="tailscale"?"Tailscale":s.Mode=="funnel"?"Funnel":s.Mode=="lan"?T("Hjemmenetværk","Home network"):"";
    }
    void DrawLibraryRow(object sender,DrawItemEventArgs e) {
        if(e.Index<0)return;e.DrawBackground();var entry=(LibraryEntry)library.Items[e.Index];var session=sessions.Find(x=>x.Id==entry.id);
        var color=session==null?Color.Gray:session.Stopping||session.Url.Length==0?Color.DarkOrange:Color.ForestGreen;
        using(var brush=new SolidBrush(color))e.Graphics.FillEllipse(brush,e.Bounds.Left+10,e.Bounds.Top+15,10,10);
        var foreground=(e.State&DrawItemState.Selected)!=0?SystemColors.HighlightText:SystemColors.WindowText;
        using(var pen=new Pen(foreground,1.3f)) {
            int x=e.Bounds.Left+31,y=e.Bounds.Top+12;
            if(entry.kind=="site") {e.Graphics.DrawEllipse(pen,x,y,15,15);e.Graphics.DrawEllipse(pen,x+4,y,7,15);e.Graphics.DrawLine(pen,x,y+7,x+15,y+7);}
            else {e.Graphics.DrawRectangle(pen,x+2,y,11,15);e.Graphics.DrawLine(pen,x+5,y+5,x+11,y+5);e.Graphics.DrawLine(pen,x+5,y+9,x+11,y+9);}
        }
        var flags=TextFormatFlags.EndEllipsis|TextFormatFlags.VerticalCenter|TextFormatFlags.Left|TextFormatFlags.SingleLine;
        using(var font=new Font(Font,FontStyle.Bold))TextRenderer.DrawText(e.Graphics,entry.name,font,new Rectangle(e.Bounds.Left+53,e.Bounds.Top,e.Bounds.Width-345,40),foreground,flags);
        TextRenderer.DrawText(e.Graphics,entry.kind=="site"?"Site":"Wiki",Font,new Rectangle(e.Bounds.Right-280,e.Bounds.Top,50,40),foreground,flags);
        TextRenderer.DrawText(e.Graphics,entry.available?LibrarySharing(entry.id):T("Filen mangler","File missing"),Font,new Rectangle(e.Bounds.Right-225,e.Bounds.Top,130,40),foreground,flags);e.DrawFocusRectangle();
    }
    bool HasSharing() {return sessions.Exists(s=>!s.Local&&s.Url.Length>0);}
    void RefreshLibraryState() {
        foreach(var s in sessions)if(s.Row!=null)s.Row.Visible=!s.Local&&s.Url.Length>0;
        empty.Visible=!HasSharing();
        library.RefreshStops();library.Invalidate();if(libraryButtons.Count!=5)return;
        var entry=library.SelectedItem as LibraryEntry;var session=entry==null?null:sessions.Find(s=>s.Id==entry.id);
        libraryButtons[0].Enabled=!libraryBusy;
        libraryButtons[1].Enabled=!libraryBusy&&entry!=null&&entry.available&&(session==null||(!session.Stopping&&session.Url.Length>0));
        libraryButtons[2].Enabled=!libraryBusy&&sharingID==null&&entry!=null&&entry.available&&session==null;
        libraryButtons[3].Enabled=!libraryBusy&&entry!=null;
        libraryButtons[4].Enabled=!libraryBusy&&library.Items.Count>0;
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
        RefreshLibraryState();
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
