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
[assembly: AssemblyVersion("0.1.1.0")]

class Session {
    public Process Process; public string Name, Url = ""; public bool Stopping;
    public FlowLayoutPanel Row; public Label Label; public Button Copy, Stop;
}
class ForgeShare : Form {
    static bool Danish = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "da";
    static string T(string da, string en) { return Danish ? da : en; }
    readonly List<Session> sessions = new List<Session>();
    readonly FlowLayoutPanel rows = new FlowLayoutPanel();
    readonly Button start = new Button();
    readonly Label empty = new Label();
    bool quitting = false;
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
        info.EnvironmentVariables.Remove("NODE_OPTIONS"); info.EnvironmentVariables.Remove("NODE_PATH"); return info;
    }
    static string Quote(string path) { return "\"" + path + "\""; }
    [STAThread] static int Main(string[] args) {
        if (Array.IndexOf(args,"--self-test") >= 0) {
            var node=Node(); if(node==null || !File.Exists(Helper)) return 2;
            using(var p=Process.Start(Command(node,"--check " + Quote(Helper)))) { p.WaitForExit(); return p.ExitCode; }
        }
        Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new ForgeShare()); return 0;
    }
    ForgeShare() {
        Text="ForgeShare"; Width=760; Height=510; MinimumSize=new Size(650,420); StartPosition=FormStartPosition.CenterScreen;
        Font=new Font("Segoe UI",10); Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        var content=new TableLayoutPanel { Dock=DockStyle.Fill, Padding=new Padding(24), ColumnCount=1, RowCount=6 };
        content.RowStyles.Add(new RowStyle(SizeType.Absolute,50)); content.RowStyles.Add(new RowStyle(SizeType.Absolute,40));
        content.RowStyles.Add(new RowStyle(SizeType.Absolute,55)); content.RowStyles.Add(new RowStyle(SizeType.Absolute,35));
        content.RowStyles.Add(new RowStyle(SizeType.Percent,100)); content.RowStyles.Add(new RowStyle(SizeType.Absolute,60));
        content.Controls.Add(new Label { Text="ForgeShare",Font=new Font("Segoe UI",25,FontStyle.Bold),AutoSize=true },0,0);
        content.Controls.Add(new Label { Text=T("Del dine wikier — én ad gangen eller flere sammen.","Share your wikis — one at a time or several together."),AutoSize=true },0,1);
        start.Text=T("Start en wiki…","Start a wiki…"); start.AutoSize=true; start.Height=38; start.Click+=(s,e)=>StartWiki(); content.Controls.Add(start,0,2);
        content.Controls.Add(new Label { Text=T("Aktive wikier","Active wikis"),AutoSize=true,Font=new Font(Font,FontStyle.Bold) },0,3);
        rows.Dock=DockStyle.Fill; rows.FlowDirection=FlowDirection.TopDown; rows.WrapContents=false; rows.AutoScroll=true;
        empty.Text=T("Ingen wikier kører endnu. Vælg et gemt navn, eller tilføj en wikimappe.","No wikis are running yet. Choose a saved name or add a wiki folder."); empty.AutoSize=true;
        rows.Controls.Add(empty); content.Controls.Add(rows,0,4);
        content.Controls.Add(new Label { Text=T("Computeren skal være tændt. Stop afslutter kun den valgte wiki.\nAdgang for andre styres i Tailscale.","Keep this computer on. Stop ends only the selected wiki.\nAccess for other people is managed in Tailscale."),Dock=DockStyle.Fill,ForeColor=SystemColors.GrayText },0,5);
        Controls.Add(content); FormClosing+=OnClosing;
    }
    void UI(Action action) { if (!IsDisposed && IsHandleCreated) BeginInvoke(action); }
    void StartWiki() {
        var node=Node();
        if(node==null) {
            if(MessageBox.Show(T("Node.js skal installeres først. Vil du åbne den officielle downloadside?","Install Node.js first. Open its official download page?"),"ForgeShare",MessageBoxButtons.YesNo)==DialogResult.Yes)
                Process.Start(new ProcessStartInfo("https://nodejs.org/en/download") { UseShellExecute=true });
            return;
        }
        if(!File.Exists(Helper)) { MessageBox.Show(T("Pak hele ZIP-filen ud. ForgeShare.mjs skal ligge ved siden af programmet.","Extract the whole ZIP. ForgeShare.mjs must stay beside the application."),"ForgeShare"); return; }
        var session=new Session { Name=T("Vælger wiki…","Choosing a wiki…"), Row=new FlowLayoutPanel { AutoSize=true,WrapContents=false } };
        session.Label=new Label { Width=300,Height=56,AutoEllipsis=true,TextAlign=ContentAlignment.MiddleLeft };
        session.Copy=new Button { Text=T("Kopiér adresse","Copy address"),AutoSize=true,Enabled=false };
        session.Stop=new Button { Text="Stop",AutoSize=true };
        session.Copy.Click+=(s,e)=>Clipboard.SetText(session.Url); session.Stop.Click+=(s,e)=>Stop(session);
        session.Row.Controls.AddRange(new Control[] { session.Label,session.Copy,session.Stop });
        session.Process=new Process { StartInfo=Command(node,Quote(Helper)+" --gui --app"),EnableRaisingEvents=true };
        session.Process.OutputDataReceived+=(s,e)=> {
            if(e.Data==null || e.Data.Length>65536) return;
            try { var data=new JavaScriptSerializer().Deserialize<Dictionary<string,string>>(e.Data);
                UI(()=> { if(!sessions.Contains(session)) return;
                    if(data.ContainsKey("name")) session.Name=data["name"];
                    Uri address;
                    if(data.ContainsKey("event") && data["event"]=="ready" && data.ContainsKey("url") && Uri.TryCreate(data["url"],UriKind.Absolute,out address) && address.Scheme=="https") { session.Url=data["url"]; session.Copy.Enabled=true; }
                    Update(session);
                });
            } catch { }
        };
        // Drain stderr without exposing subprocess output or passwords in the UI.
        session.Process.ErrorDataReceived+=(s,e)=>{};
        session.Process.Exited+=(s,e)=>UI(()=> { rows.Controls.Remove(session.Row); sessions.Remove(session); session.Row.Dispose(); session.Process.Dispose(); empty.Visible=sessions.Count==0; if(quitting && sessions.Count==0) Close(); });
        try { sessions.Add(session); rows.Controls.Add(session.Row); empty.Visible=false; Update(session);
            session.Process.Start(); session.Process.BeginOutputReadLine(); session.Process.BeginErrorReadLine();
        } catch { sessions.Remove(session); rows.Controls.Remove(session.Row); session.Row.Dispose(); session.Process.Dispose(); empty.Visible=sessions.Count==0;
            MessageBox.Show(T("Wikien kunne ikke startes. Kontroller Node.js-installationen.","The wiki could not start. Check your Node.js installation."),"ForgeShare"); }
    }
    void Update(Session s) { s.Label.Text=s.Name+(s.Stopping?T(" — stopper…"," — stopping…"):s.Url.Length==0?"":T(" — deler"," — sharing")) + (s.Url.Length==0?"":"\n"+s.Url); }
    void Stop(Session s) { if(s.Stopping) return; s.Stopping=true; s.Stop.Enabled=false; Update(s);
        try { s.Process.StandardInput.Write("STOP\n"); s.Process.StandardInput.Flush(); }
        catch { MessageBox.Show(T("Brug wikiens statusdialog til at stoppe delingen.","Use the wiki's status dialog to stop sharing."),"ForgeShare"); }
    }
    void OnClosing(object sender,FormClosingEventArgs e) {
        if(sessions.Count==0) return; e.Cancel=true;
        if(quitting) return;
        if(MessageBox.Show(T("Stop alle wikier startet i dette vindue og afslut? Vent først på, at ændringer er gemt.","Stop all wikis started in this window and quit? Wait for your edits to save first."),"ForgeShare",MessageBoxButtons.OKCancel)!=DialogResult.OK) return;
        quitting=true; start.Enabled=false; foreach(var s in sessions.ToArray()) Stop(s);
    }
}
