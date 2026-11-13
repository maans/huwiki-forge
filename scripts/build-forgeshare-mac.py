#!/usr/bin/env python3
"""Compile a universal native launcher. Does not launch UI or change signing identities."""
from pathlib import Path
import subprocess,tempfile,shutil
root=Path(__file__).resolve().parents[1]
native=root/'plugins/forgeshare/native'
out=native/'compiled';out.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(prefix='forgeshare-build-') as tmp:
    tmp=Path(tmp)
    for arch in ('arm64','x86_64'):
        subprocess.run(['xcrun','swiftc','-O','-target',arch+'-apple-macosx13.0',str(native/'macos/ForgeShare.swift'),'-o',str(tmp/arch)],check=True)
    subprocess.run(['lipo','-create',str(tmp/'arm64'),str(tmp/'x86_64'),'-output',str(out/'ForgeShare')],check=True)
    subprocess.run(['xcrun','swift',str(native/'macos/Icon.swift'),str(tmp/'ForgeShare.iconset')],check=True)
    subprocess.run(['iconutil','-c','icns',str(tmp/'ForgeShare.iconset'),'-o',str(out/'ForgeShare.icns')],check=True)
    # Seal the complete app, including its current helper. Ad-hoc signing
    # enables Apple Silicon execution but provides no verified publisher.
    app=tmp/'ForgeShare.app';contents=app/'Contents'
    (contents/'MacOS').mkdir(parents=True);(contents/'Resources').mkdir()
    shutil.copy2(out/'ForgeShare',contents/'MacOS/ForgeShare')
    shutil.copy2(out/'ForgeShare.icns',contents/'Resources/ForgeShare.icns')
    shutil.copy2(native/'macos/Info.plist',contents/'Info.plist')
    shutil.copy2(native.parent/'helper/ForgeShare.mjs',contents/'Resources/ForgeShare.mjs')
    subprocess.run(['codesign','--force','--sign','-',str(app)],check=True)
    subprocess.run(['codesign','--verify','--strict',str(app)],check=True)
    subprocess.run([str(contents/'MacOS/ForgeShare'),'--self-test'],check=True)
    shutil.copy2(contents/'MacOS/ForgeShare',out/'ForgeShare')
    shutil.copy2(contents/'_CodeSignature/CodeResources',out/'CodeResources')
subprocess.run(['node',str(root/'scripts/native-manifest.mjs'),'mac'],check=True)
