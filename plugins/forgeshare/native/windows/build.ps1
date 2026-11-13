$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$out=Join-Path $PSScriptRoot '../compiled'
[IO.Directory]::CreateDirectory($out) | Out-Null
$icon=Join-Path $out 'temporary.ico'
$bitmap=New-Object Drawing.Bitmap 64,64
$g=[Drawing.Graphics]::FromImage($bitmap)
$g.SmoothingMode='AntiAlias'
$g.Clear([Drawing.Color]::FromArgb(31,71,161))
$g.FillRectangle([Drawing.Brushes]::White,15,12,29,40)
$blue=New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(31,71,161))
foreach($y in @(22,29,36)) { $g.FillRectangle($blue,23,$y,15,2) }
$green=New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(51,204,158))
$g.FillEllipse($green,41,13,9,9);$g.FillEllipse($green,49,26,9,9);$g.FillEllipse($green,41,39,9,9)
$handle=$bitmap.GetHicon();$image=[Drawing.Icon]::FromHandle($handle)
$stream=[IO.File]::Create($icon);$image.Save($stream);$stream.Dispose();$image.Dispose();$g.Dispose();$bitmap.Dispose()
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
& $compiler /nologo /target:winexe /platform:anycpu /optimize+ /codepage:65001 "/win32icon:$icon" "/out:$out/ForgeShare.exe" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll (Join-Path $PSScriptRoot 'ForgeShare.cs')
if($LASTEXITCODE -ne 0) { throw 'Windows application build failed' }
Remove-Item $icon
node (Join-Path $PSScriptRoot '../../../../scripts/native-manifest.mjs') windows
if($LASTEXITCODE -ne 0) { throw 'Windows manifest failed' }
