param()
$ErrorActionPreference = 'Stop'
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$root = Join-Path $repository ('.tmp\T008-helper-' + [Guid]::NewGuid().ToString())
if (!$root.StartsWith((Join-Path $repository '.tmp\'), [StringComparison]::OrdinalIgnoreCase)) { throw 'Fixture outside workspace' }
[void](New-Item -ItemType Directory -Path $root)
$ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
function Hash([string]$file) { (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() }
function Compile([string]$name, [string]$body) {
  $source = Join-Path $root ($name + '.cs'); $output = Join-Path $root ($name + '.exe')
  [IO.File]::WriteAllText($source, ('using System; using System.IO; class Program { static void Main() { ' + $body + ' } }'))
  & $csc /nologo /target:winexe ('/out:' + $output) $source
  if ($LASTEXITCODE -ne 0) { throw 'Fixture compilation failed' }; return $output
}
$old = Compile 'old' 'return;'
$bad = Compile 'bad' 'Environment.Exit(3);'
$escapedRoot = $root.Replace('\','\\').Replace('"','\"')
$good = Compile 'good' ('var token=Environment.GetEnvironmentVariable("DESKTOPPLAY_UPDATE_TOKEN"); File.WriteAllText(Path.Combine("' + $escapedRoot + '","attempt-"+token,"healthy"), "{\"token\":\""+token+"\",\"version\":\"0.5.4\"}"); System.Threading.Thread.Sleep(500);')
function Case([string]$name, [string]$next, [string]$mode) {
  $token = [Guid]::NewGuid().ToString(); $attempt = Join-Path $root ('attempt-' + $token)
  [void](New-Item -ItemType Directory -Path $attempt)
  $program = Join-Path $attempt 'pet.exe'; Copy-Item -LiteralPath $old -Destination $program
  $staged = $program + '.update-' + $token + '.new'; Copy-Item -LiteralPath $next -Destination $staged
  $backup = $program + '.update-' + $token + '.old'; $helper = Join-Path $attempt 'helper.ps1'
  Copy-Item -LiteralPath (Join-Path $repository 'build\update-helper.ps1') -Destination $helper
  $manifest = @{token=$token;version='0.5.4';attempt=$attempt;programPath=$program;staged=$staged;backup=$backup;oldHash=(Hash $old);newHash=(Hash $next);processes=@(@{pid=2147483646;created='2026-01-01T00:00:00Z';executable=$program},@{pid=2147483645;created='2026-01-01T00:00:00Z';executable=$program})}
  if ($mode -eq 'timeout') {
    $self = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $PID)
    $manifest.processes[0] = @{pid=$PID;created=$self.CreationDate.ToUniversalTime().ToString('o');executable=$self.ExecutablePath}
  }
  $file = Join-Path $attempt 'manifest.json'; [IO.File]::WriteAllText($file, ($manifest | ConvertTo-Json -Depth 5))
  $process = Start-Process -FilePath $ps -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',('"'+$helper+'"'),'-ManifestPath',('"'+$file+'"')) -WindowStyle Hidden -PassThru -RedirectStandardError (Join-Path $attempt 'stderr.txt')
  $until = [DateTime]::UtcNow.AddSeconds(15)
  while (!(Test-Path -LiteralPath (Join-Path $attempt 'ready'))) { if ($process.HasExited -or [DateTime]::UtcNow -gt $until) { throw "Helper not ready: $attempt" }; Start-Sleep -Milliseconds 100 }
  if ($mode -eq 'changed') { [IO.File]::AppendAllText($program, 'changed') }
  $lock = $null
  if ($mode -eq 'locked') { $lock = [IO.File]::Open($program, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::None) }
  if ($mode -eq 'readonly') { (Get-Item -LiteralPath $program).IsReadOnly = $true }
  if ($mode -eq 'cancel') { [IO.File]::WriteAllText((Join-Path $attempt 'cancel'), $token) } else { [IO.File]::WriteAllText((Join-Path $attempt 'go'), $token) }
  $wait = 30000; if ($mode -eq 'timeout') { $wait = 150000 }
  try { if (!$process.WaitForExit($wait)) { throw "Helper timeout: $attempt" } } finally { if ($lock) { $lock.Dispose() } }
  if ($mode -eq 'success') { if ((Hash $program) -ne (Hash $next) -or (Test-Path -LiteralPath $backup)) { throw 'Successful replacement failed' } }
  if ($mode -in @('rollback','cancel','locked','readonly','timeout')) { if ((Hash $program) -ne (Hash $old)) { throw 'Old program lost' } }
  if ($mode -eq 'changed') { if ((Hash $program) -eq (Hash $next) -or !(Test-Path -LiteralPath $staged)) { throw 'Changed target was overwritten' } }
  Write-Output "PASS $name"
}
Case 'verified replacement and health receipt' $good 'success'
Case 'failed start restores old program' $bad 'rollback'
Case 'cancel keeps old program' $good 'cancel'
Case 'changed target is preserved' $good 'changed'
Case 'locked target is preserved' $good 'locked'
Case 'read-only target is preserved' $good 'readonly'
Case 'source-process wait timeout leaves old program and source alive' $good 'timeout'
Write-Output "Fixture artifacts: $root"
