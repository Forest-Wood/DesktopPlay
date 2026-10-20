param([Parameter(Mandatory=$true)][string]$ManifestPath, [switch]$Bootstrap)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
function Assert-Plain([string]$Name, [bool]$Required = $true) {
  if (![IO.Path]::IsPathRooted($Name) -or $Name.StartsWith('\\') -or $Name -match '[\x00-\x1f]') { throw 'Invalid update path' }
  $current = [IO.Path]::GetFullPath($Name)
  if ($Required -and !(Test-Path -LiteralPath $current -PathType Leaf)) { throw 'Missing update file' }
  while ($current) {
    if (Test-Path -LiteralPath $current) {
      if ((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Linked update path' }
    }
    if ($current.TrimEnd('\') -eq [IO.Path]::GetPathRoot($current).TrimEnd('\')) { break }
    $parent = [IO.Path]::GetDirectoryName($current.TrimEnd('\'))
    if (!$parent -or $parent -eq $current) { break }; $current = $parent
  }
}
function Same-Path([string]$A, [string]$B) { return [IO.Path]::GetFullPath($A).Equals([IO.Path]::GetFullPath($B), [StringComparison]::OrdinalIgnoreCase) }
function Hash([string]$Name) { return (Get-FileHash -LiteralPath $Name -Algorithm SHA256).Hash.ToLowerInvariant() }
function Alive($Identity) {
  $p = Get-CimInstance Win32_Process -Filter ('ProcessId=' + [int]$Identity.pid)
  if (!$p) { return $false }
  $created = [DateTime]::Parse([string]$Identity.created).ToUniversalTime()
  if ($p.CreationDate.ToUniversalTime().Ticks -ne $created.Ticks) { return $false }
  if (!$p.ExecutablePath -or !(Same-Path $p.ExecutablePath $Identity.executable)) { throw 'Process identity mismatch' }
  return $true
}
Assert-Plain $ManifestPath
$m = Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($m.token -notmatch '^[a-f0-9-]{36}$' -or $m.version -notmatch '^\d+\.\d+\.\d+(\+[A-Za-z0-9.-]+)?$' -or $m.oldHash -notmatch '^[a-f0-9]{64}$' -or $m.newHash -notmatch '^[a-f0-9]{64}$') { throw 'Invalid update manifest' }
$attempt = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($ManifestPath))
if (!(Same-Path $attempt $m.attempt) -or [IO.Path]::GetFileName($attempt) -ne ('attempt-' + $m.token) -or !(Same-Path $PSCommandPath (Join-Path $attempt 'helper.ps1'))) { throw 'Invalid update attempt' }
if (!(Same-Path $m.staged ($m.programPath + '.update-' + $m.token + '.new')) -or !(Same-Path $m.backup ($m.programPath + '.update-' + $m.token + '.old')) -or [IO.Path]::GetExtension($m.programPath) -ne '.exe') { throw 'Invalid executable target' }
Assert-Plain $m.programPath; Assert-Plain $m.staged; Assert-Plain $m.backup $false; Assert-Plain $attempt $false
if (@($m.processes).Count -ne 2) { throw 'Invalid process list' }
foreach ($identity in $m.processes) {
  if (($identity.pid -isnot [int] -and $identity.pid -isnot [long]) -or $identity.pid -le 0 -or $identity.pid -gt [int]::MaxValue) { throw 'Invalid process id' }
  [void](Alive $identity)
}
if (!(Same-Path $m.processes[1].executable $m.programPath)) { throw 'Invalid portable launcher' }
if ((Hash $m.programPath) -ne $m.oldHash -or (Hash $m.staged) -ne $m.newHash -or (Test-Path -LiteralPath $m.backup)) { throw 'Update file changed' }
if ($Bootstrap) {
  # EncodedCommand contains only single-quoted, escaped paths; filenames never become code.
  $script = "& '" + $PSCommandPath.Replace("'", "''") + "' -ManifestPath '" + $ManifestPath.Replace("'", "''") + "'"
  $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
  $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  Start-Process -FilePath $ps -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',$encoded) -WindowStyle Hidden
  exit 0
}
$goReceived = $false; $replaced = $false; $new = $null
try {
  [IO.File]::WriteAllText((Join-Path $attempt 'ready'), $m.token)
  $deadline = [DateTime]::UtcNow.AddSeconds(120)
  while (!(Test-Path -LiteralPath (Join-Path $attempt 'go'))) {
    if (Test-Path -LiteralPath (Join-Path $attempt 'cancel')) { exit 0 }
    if ([DateTime]::UtcNow -gt $deadline) { throw 'Commit timeout' }; Start-Sleep -Milliseconds 100
  }
  if ([IO.File]::ReadAllText((Join-Path $attempt 'go')).Trim() -ne $m.token) { throw 'Invalid commit token' }
  $goReceived = $true; $deadline = [DateTime]::UtcNow.AddSeconds(120)
  while ((Alive $m.processes[0]) -or (Alive $m.processes[1])) {
    if ([DateTime]::UtcNow -gt $deadline) { throw 'Exit timeout' }; Start-Sleep -Milliseconds 100
  }
  Assert-Plain $m.programPath; Assert-Plain $m.staged; Assert-Plain $m.backup $false
  if ((Hash $m.programPath) -ne $m.oldHash -or (Hash $m.staged) -ne $m.newHash -or (Test-Path -LiteralPath $m.backup)) { throw 'Update target changed' }
  [IO.File]::Replace($m.staged, $m.programPath, $m.backup); $replaced = $true
  $env:DESKTOPPLAY_UPDATE_TOKEN = $m.token
  $new = Start-Process -FilePath $m.programPath -PassThru
  Remove-Item Env:\DESKTOPPLAY_UPDATE_TOKEN -ErrorAction SilentlyContinue
  $deadline = [DateTime]::UtcNow.AddSeconds(60); $healthy = $false
  while ([DateTime]::UtcNow -lt $deadline) {
    $receipt = Join-Path $attempt 'healthy'
    if (Test-Path -LiteralPath $receipt) {
      $r = Get-Content -LiteralPath $receipt -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($r.token -eq $m.token -and $r.version -eq $m.version) { $healthy = $true; break }
    }
    if ($new.HasExited) { break }; Start-Sleep -Milliseconds 100
  }
  if (!$healthy) {
    if (!$new.HasExited) {
      @{token=$m.token;status='unconfirmed'} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $attempt 'result.json') -Encoding UTF8
      exit 1 # Retain the backup; never kill a live process or replace its executable.
    }
    throw 'New application did not start'
  }
  Assert-Plain $m.backup
  if ((Hash $m.backup) -eq $m.oldHash -and (Hash $m.programPath) -eq $m.newHash) { Remove-Item -LiteralPath $m.backup -Force }
  @{token=$m.token;status='success'} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $attempt 'result.json') -Encoding UTF8
} catch {
  Remove-Item Env:\DESKTOPPLAY_UPDATE_TOKEN -ErrorAction SilentlyContinue
  if ($replaced -and (!$new -or $new.HasExited) -and (Test-Path -LiteralPath $m.backup) -and (Hash $m.backup) -eq $m.oldHash -and (Hash $m.programPath) -eq $m.newHash) {
    $failed = $m.programPath + '.update-' + $m.token + '.failed'
    Assert-Plain $failed $false
    if (Test-Path -LiteralPath $failed) { throw 'Recovery destination already exists; backup retained' }
    [IO.File]::Replace($m.backup, $m.programPath, $failed)
  }
  @{token=$m.token;status='failed'} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $attempt 'result.json') -Encoding UTF8
  if ($goReceived -and !(Alive $m.processes[0]) -and !(Alive $m.processes[1]) -and (Hash $m.programPath) -eq $m.oldHash) { Start-Process -FilePath $m.programPath }
  exit 1
}
