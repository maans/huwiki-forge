import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const marker='ForgeShare login startup';
export function loginFile({platform=process.platform,home=os.homedir(),env=process.env}={}){
  if(platform==='darwin')return path.join(home,'Library/LaunchAgents/org.huwiki.ForgeShare.login.plist');
  if(platform==='win32')return path.join(env.APPDATA||path.join(home,'AppData/Roaming'),'Microsoft/Windows/Start Menu/Programs/Startup/ForgeShare.vbs');
  return path.join(env.XDG_CONFIG_HOME||path.join(home,'.config'),'autostart/forgeshare.desktop');
}
export function loginContent(app,platform=process.platform){
  if(typeof app!=='string'||!path.isAbsolute(app)||/[\r\n\x00]/.test(app))throw Error('Open the installed app first / Åbn først den installerede app');
  if(platform==='darwin'){
    const xml=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
    return `<?xml version="1.0" encoding="UTF-8"?><!-- ${marker} --><plist version="1.0"><dict><key>Label</key><string>org.huwiki.ForgeShare.login</string><key>ProgramArguments</key><array><string>/usr/bin/open</string><string>-a</string><string>${xml(app)}</string></array><key>RunAtLoad</key><true/></dict></plist>\n`;
  }
  if(platform==='win32')return `' ${marker}\nCreateObject("WScript.Shell").Run """${app.replaceAll('"','""')}""", 1, False\n`;
  return `[Desktop Entry]\n# ${marker}\nType=Application\nName=ForgeShare\nExec="${app.replaceAll('\\','\\\\').replaceAll('"','\\"').replaceAll('`','\\`').replaceAll('$','\\$').replaceAll('%','%%')}"\nTerminal=false\n`;
}
export async function configureLogin(enabled,app,options={}){
  const file=loginFile(options);let previous;try{previous=await readFile(file,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
  if(previous&&!previous.includes(marker))throw Error('An existing startup entry was left unchanged / Eksisterende opstart blev ikke ændret');
  if(!enabled){await rm(file,{force:true});return;}
  const text=loginContent(app,options.platform);await mkdir(path.dirname(file),{recursive:true,mode:0o700});await writeFile(file,text,{mode:0o600});
}
