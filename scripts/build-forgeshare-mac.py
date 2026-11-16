#!/usr/bin/env python3
"""Compile a universal native launcher. Does not launch UI or change signing identities."""
from pathlib import Path
import subprocess,tempfile,shutil,hashlib,sys
root=Path(__file__).resolve().parents[1]
native=root/'plugins/forgeshare/native'
out=native/'compiled';out.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(prefix='forgeshare-build-') as tmp:
    tmp=Path(tmp)
    if '--reuse-tested-launcher' in sys.argv:
        # A changed macOS SDK/compiler in the 0.1.14 CI build changed the
        # native executable despite unchanged Swift source. Reuse precisely
        # the 0.1.13 native launcher that successfully displayed its UI on
        # the user's Mac; update only the bundled JS helper and app metadata.
        # Refuse to silently swap in a different executable or icon.
        expected = {
            'ForgeShare':'f5b93529f1966fc93b02af3cc1228bb993d8e623b9e7c5225a0db51727bb3493',
            'ForgeShare.icns':'f0c2c6854267bb0af6ea4377305fdd5c310de005bf906118aa6f6aa68e958cb2',
        }
        stable=native/'known-good'
        for name, digest in expected.items():
            source=stable/name
            actual=hashlib.sha256(source.read_bytes()).hexdigest()
            if actual != digest:
                raise RuntimeError(f'Known-good {name} changed; refusing to package an untested launcher.')
            shutil.copy2(source,out/name)
        (out/'ForgeShare').chmod(0o755)
    else:
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
    for module in ('Vault.mjs','Bridge.mjs','Startup.mjs','Site.mjs'):
        shutil.copy2(native.parent/('helper/'+module),contents/('Resources/'+module))
    for language in ('da','en'):
        shutil.copy2(native.parent/('helper/help-'+language+'.html'),contents/('Resources/help-'+language+'.html'))
    subprocess.run(['codesign','--force','--sign','-',str(app)],check=True)
    subprocess.run(['codesign','--verify','--strict',str(app)],check=True)
    subprocess.run([str(contents/'MacOS/ForgeShare'),'--self-test'],check=True)
    shutil.copy2(contents/'MacOS/ForgeShare',out/'ForgeShare')
    shutil.copy2(contents/'_CodeSignature/CodeResources',out/'CodeResources')
subprocess.run(['node',str(root/'scripts/native-manifest.mjs'),'mac'],check=True)
