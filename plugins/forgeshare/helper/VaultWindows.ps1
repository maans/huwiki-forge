param(
  [Parameter(Mandatory=$true)]
  [ValidateSet('read','write')]
  [string]$Action
)
# Windows Node-only fallback: same CurrentUser DPAPI vault as ForgeShare.exe.
# Never accept a path, command, or encryption key from an untrusted caller.
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding($false)
$folder=Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'ForgeShare'
$file=Join-Path $folder 'vault.dpapi'
if($Action -eq 'read'){
  if(-not [IO.File]::Exists($file)){[Console]::Write('{}');exit 0}
  $cipher=[IO.File]::ReadAllBytes($file)
  $plain=[Security.Cryptography.ProtectedData]::Unprotect($cipher,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  [Console]::Write([Text.Encoding]::UTF8.GetString($plain))
  exit 0
}
$inputJson=[Console]::In.ReadToEnd()
if([Text.Encoding]::UTF8.GetByteCount($inputJson) -gt 1048576){throw 'Vault payload too large'}
$null=ConvertFrom-Json -InputObject $inputJson -ErrorAction Stop
[IO.Directory]::CreateDirectory($folder) | Out-Null
$temp=$file+'.'+[Guid]::NewGuid().ToString('N')
try {
  $cipher=[Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($inputJson),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  [IO.File]::WriteAllBytes($temp,$cipher)
  if([IO.File]::Exists($file)){[IO.File]::Replace($temp,$file,$null)}
  else {[IO.File]::Move($temp,$file)}
} finally {
  if([IO.File]::Exists($temp)){[IO.File]::Delete($temp)}
}
