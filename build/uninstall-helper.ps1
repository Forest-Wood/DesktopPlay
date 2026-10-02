param([Parameter(Mandatory=$true)][string]$ManifestPath, [switch]$Bootstrap)
$ErrorActionPreference = 'Stop'
$committed = $false
$planDir = $null
$manifest = $null

function Same-Path([string]$a, [string]$b) {
  return [string]::Equals([IO.Path]::GetFullPath($a).TrimEnd('\'), [IO.Path]::GetFullPath($b).TrimEnd('\'), [StringComparison]::OrdinalIgnoreCase)
}

function Assert-PlainPath([string]$target, [bool]$fileRequired = $false) {
  if (![IO.Path]::IsPathRooted($target) -or $target.StartsWith('\\') -or $target -match '[\x00-\x1f]') { throw 'Invalid absolute path.' }
  $current = [IO.Path]::GetFullPath($target)
  $first = $true
  while ($current) {
    if (Test-Path -LiteralPath $current) {
      $item = Get-Item -LiteralPath $current -Force
      if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Directory links are not supported for uninstall.' }
      if ($first -and $fileRequired -and $item.PSIsContainer) { throw 'The target is not a regular file.' }
    } elseif ($first -and $fileRequired) { throw 'A required uninstall file is missing.' }
    $first = $false
    $parent = [IO.Path]::GetDirectoryName($current.TrimEnd('\'))
    if (!$parent -or (Same-Path $current $parent)) { break }
    $current = $parent
  }
}

function Process-Matches($identity) {
  $p = Get-CimInstance Win32_Process -Filter ('ProcessId=' + [int]$identity.pid)
  if (!$p) { return $false }
  if ($p.CreationDate.ToUniversalTime().ToString('o') -ne [string]$identity.created) { return $false }
  if (!(Same-Path ([string]$p.ExecutablePath) ([string]$identity.executable))) { throw 'Process identity changed.' }
  return $true
}

function Wait-ForExit($identity, [int]$seconds) {
  $deadline = [DateTime]::UtcNow.AddSeconds($seconds)
  while (Process-Matches $identity) {
    if ([DateTime]::UtcNow -ge $deadline) { throw 'The application did not exit; no uninstall targets were removed.' }
    Start-Sleep -Milliseconds 200
  }
}

function Assert-Hash([string]$target, [string]$expected) {
  Assert-PlainPath $target $true
  if ($expected -notmatch '^[a-f0-9]{64}$' -or (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) { throw 'The confirmed program changed; it has been preserved.' }
}

function Remove-Startup([string]$program) {
  $keyPath = 'Software\Microsoft\Windows\CurrentVersion\Run'
  $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($keyPath, $true)
  if (!$key) { return }
  try {
    foreach ($name in @('electron.app.DesktopPlay', 'io.github.forestwood.desktopplay')) {
      $value = $key.GetValue($name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
      if ($value -is [string] -and [string]::Equals($value, ('"' + $program + '"'), [StringComparison]::OrdinalIgnoreCase)) { $key.DeleteValue($name, $false) }
    }
  } finally { $key.Dispose() }
}

function Inspect-Tree([string]$directory) {
  Assert-PlainPath $directory
  foreach ($item in @(Get-ChildItem -LiteralPath $directory -Force)) {
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'The data folder contains a link and has been preserved.' }
    if ($item.PSIsContainer) { Inspect-Tree $item.FullName }
  }
}

function Assert-NoOtherDesktopPet {
  # Both installed and portable applications share APPDATA\DesktopPlay. Never
  # terminate another version, and preserve that shared folder while it is live.
  $others = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'DesktopPet.exe' -or $_.Name -eq 'DesktopPlay.exe' })
  if ($others.Count -gt 0) { throw 'Another DesktopPet version is running. Its shared local data has been preserved; close it before clearing APPDATA\DesktopPlay.' }
}

function Remove-TreeWithoutLinks([string]$directory) {
  Assert-PlainPath $directory
  foreach ($item in @(Get-ChildItem -LiteralPath $directory -Force)) {
    Assert-PlainPath $item.FullName
    if ($item.PSIsContainer) { Remove-TreeWithoutLinks $item.FullName }
    else { Remove-Item -LiteralPath $item.FullName -Force }
  }
  Assert-PlainPath $directory
  Remove-Item -LiteralPath $directory -Force
}

try {
  Assert-PlainPath $ManifestPath $true
  $manifest = Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($manifest.version -ne 1 -or $manifest.token -notmatch '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$') { throw 'Invalid uninstall manifest.' }
  $expectedPlan = Join-Path ([IO.Path]::GetTempPath()) ('DesktopPet-uninstall-' + $manifest.token)
  $planDir = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($ManifestPath))
  if (!(Same-Path $planDir $expectedPlan) -or [IO.Path]::GetFileName($ManifestPath) -ne 'manifest.json') { throw 'Invalid uninstall working folder.' }
  Assert-PlainPath $planDir
  $expectedData = Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'DesktopPlay'
  if (!(Same-Path $manifest.dataPath $expectedData) -or !(Same-Path $manifest.appDataDir ([Environment]::GetFolderPath('ApplicationData')))) { throw 'The data cleanup path is not APPDATA\DesktopPlay.' }
  if ($manifest.removeData -isnot [bool]) { throw 'Invalid data cleanup choice.' }
  Assert-PlainPath $expectedData
  if ($Bootstrap) {
    $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $helperArguments = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $PSCommandPath + '"'), '-ManifestPath', ('"' + $ManifestPath + '"'))
    Start-Process -FilePath $powershell -ArgumentList $helperArguments -WindowStyle Hidden -RedirectStandardOutput (Join-Path $planDir 'helper-output.log') -RedirectStandardError (Join-Path $planDir 'helper-error.log') | Out-Null
    exit 0
  }
  if (!(Process-Matches $manifest.parent)) { throw 'The application exited before preparing uninstall.' }
  if ($manifest.kind -eq 'portable') {
    if (!(Process-Matches $manifest.launcher) -or !(Same-Path $manifest.launcher.executable $manifest.programPath)) { throw 'The portable launcher cannot be verified.' }
    $next = [int]$manifest.parent.pid
    $found = $false
    $childCreated = [DateTime]::MaxValue
    for ($i=0; $i -lt 16 -and $next -gt 0; $i++) {
      $p = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $next)
      if (!$p -or $p.CreationDate -gt $childCreated) { break }
      if ($i -gt 0 -and $p.ProcessId -eq $manifest.launcher.pid -and $p.CreationDate.ToUniversalTime().ToString('o') -eq $manifest.launcher.created) { $found=$true; break }
      $childCreated = $p.CreationDate
      $next = [int]$p.ParentProcessId
    }
    if (!$found) { throw 'The portable EXE is not the current launcher.' }
  } elseif ($manifest.kind -eq 'installed') {
    $expectedUninstaller = Join-Path ([IO.Path]::GetDirectoryName($manifest.parent.executable)) 'Uninstall DesktopPet.exe'
    if (!(Same-Path $manifest.parent.executable $manifest.programPath) -or !(Same-Path $manifest.uninstallerPath $expectedUninstaller)) { throw 'Invalid installed uninstaller path.' }
    Assert-Hash $manifest.uninstallerPath $manifest.uninstallerHash
  } else { throw 'Unsupported uninstall kind.' }
  Assert-Hash $manifest.programPath $manifest.programHash
  @{ok=$true;token=$manifest.token} | ConvertTo-Json -Compress | Set-Content -LiteralPath (Join-Path $planDir 'ready.tmp') -Encoding UTF8
  Move-Item -LiteralPath (Join-Path $planDir 'ready.tmp') -Destination (Join-Path $planDir 'ready.json')
  $deadline = [DateTime]::UtcNow.AddMinutes(2)
  while (!(Test-Path -LiteralPath (Join-Path $planDir 'commit'))) {
    if (Test-Path -LiteralPath (Join-Path $planDir 'cancel')) { exit 0 }
    if (!(Process-Matches $manifest.parent)) { throw 'The application exited without committing uninstall.' }
    if ([DateTime]::UtcNow -ge $deadline) { throw 'Uninstall preparation expired.' }
    Start-Sleep -Milliseconds 100
  }
  if (Test-Path -LiteralPath (Join-Path $planDir 'cancel')) { exit 0 }
  Assert-PlainPath (Join-Path $planDir 'commit') $true
  if ((Get-Content -LiteralPath (Join-Path $planDir 'commit') -Raw -Encoding UTF8) -ne $manifest.token) { throw 'Invalid uninstall commit.' }
  $committed = $true
  Wait-ForExit $manifest.parent 60
  if ($manifest.kind -eq 'portable') {
    Wait-ForExit $manifest.launcher 60
    $removed = $false
    for ($attempt=0; $attempt -lt 30; $attempt++) {
      if (!(Test-Path -LiteralPath $manifest.programPath)) { throw 'The portable target disappeared before deletion; data has been preserved.' }
      Assert-Hash $manifest.programPath $manifest.programHash
      try { Remove-Item -LiteralPath $manifest.programPath -Force; $removed=$true; break }
      catch { if ($attempt -eq 29) { throw }; Start-Sleep -Milliseconds 500 }
    }
    if (!$removed) { throw 'The portable EXE could not be removed.' }
  } else {
    Assert-Hash $manifest.programPath $manifest.programHash
    Assert-Hash $manifest.uninstallerPath $manifest.uninstallerHash
    # NSIS may copy itself to TEMP; wait for its authenticated success receipt,
    # never assume the first bootstrap process exit means uninstall succeeded.
    # The builder template parses /D= as the final, unquoted remainder, including
    # spaces. customUnInit rejects registry locations belonging to another copy.
    $uninstallerArguments = @('/S', ('/desktopplay-token=' + $manifest.token), ('/D=' + [IO.Path]::GetDirectoryName($manifest.programPath)))
    $process = Start-Process -FilePath $manifest.uninstallerPath -ArgumentList $uninstallerArguments -WindowStyle Hidden -PassThru
    $deadline = [DateTime]::UtcNow.AddMinutes(5)
    $receipt = Join-Path $planDir 'success'
    while (!(Test-Path -LiteralPath $receipt)) {
      if ([DateTime]::UtcNow -ge $deadline) { throw 'The installer did not confirm success; local data has been preserved.' }
      Start-Sleep -Milliseconds 200
    }
    Assert-PlainPath $receipt $true
    if ((Get-Content -LiteralPath $receipt -Raw -Encoding UTF8) -ne $manifest.token -or (Test-Path -LiteralPath $manifest.programPath)) { throw 'Uninstall did not complete; local data has been preserved.' }
  }
  Remove-Startup $manifest.programPath
  if ($manifest.removeData -and (Test-Path -LiteralPath $expectedData)) {
    Assert-NoOtherDesktopPet
    Assert-PlainPath $expectedData
    Inspect-Tree $expectedData
    Assert-NoOtherDesktopPet
    Remove-TreeWithoutLinks $expectedData
  }
  'Uninstall completed.' | Set-Content -LiteralPath (Join-Path $planDir 'result.log') -Encoding UTF8
  Add-Type -AssemblyName System.Windows.Forms
  $message = if ($manifest.removeData) { 'DesktopPet was uninstalled and its local data was cleared.' } else { 'DesktopPet was uninstalled. Your local data has been kept.' }
  [void][Windows.Forms.MessageBox]::Show($message, 'DesktopPet uninstall', 'OK', 'Information')
  exit 0
} catch {
  $reason = $_.Exception.Message
  if ($planDir -and (Test-Path -LiteralPath $planDir)) {
    try {
      Assert-PlainPath $planDir
      $reason | Set-Content -LiteralPath (Join-Path $planDir 'result.log') -Encoding UTF8
      if (!$committed) { @{ok=$false;token=$manifest.token;reason=$reason} | ConvertTo-Json -Compress | Set-Content -LiteralPath (Join-Path $planDir 'ready.json') -Encoding UTF8 }
    } catch { }
  }
  if ($committed) {
    try {
      Add-Type -AssemblyName System.Windows.Forms
      [void][Windows.Forms.MessageBox]::Show(('Uninstall could not finish. Remaining files have been preserved. Please close DesktopPet and remove the confirmed program manually.' + [Environment]::NewLine + $reason + [Environment]::NewLine + 'Log: ' + $planDir), 'DesktopPet uninstall', 'OK', 'Warning')
    } catch { }
  }
  exit 1
}
