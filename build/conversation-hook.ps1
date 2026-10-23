# DesktopPet notification relay. Never writes an approval decision or tool output.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
# Only process names/ancestry are inspected. No command lines, titles or conversation text.
function Resolve-DesktopPetClient {
  try {
    $processes = @{}
    foreach ($entry in (Get-CimInstance -Query 'SELECT ProcessId, ParentProcessId, Name FROM Win32_Process' -ErrorAction Stop)) {
      $processes[[int]$entry.ProcessId] = $entry
    }
    $ancestorId = $PID
    $foundCodex = $false
    for ($depth = 0; $depth -lt 16; $depth++) {
      $entry = $processes[$ancestorId]
      if (-not $entry) { break }
      $name = ([string]$entry.Name).ToLowerInvariant()
      if ($name -eq 'codex.exe') { $foundCodex = $true }
      elseif ($foundCodex) {
        if ($name -eq 'chatgpt.exe') { return 'chatgpt' }
        if ($name -eq 'code.exe' -or $name -eq 'code - insiders.exe') { return 'vscode' }
        # Stop at a terminal/test host; an unrelated GUI further up is not this client's UI.
        if ($name -notin @('cmd.exe', 'conhost.exe', 'openconsole.exe', 'codex-command-runner.exe')) { return 'cli' }
      }
      $parentId = [int]$entry.ParentProcessId
      if ($parentId -le 0 -or $parentId -eq $ancestorId) { break }
      $ancestorId = $parentId
    }
    if ($foundCodex) { return 'cli' }
  } catch { }
  return 'unknown'
}
try {
  $raw = [Console]::In.ReadToEnd()
  if ($raw.Length -gt 1048576) { exit 0 }
  $event = ConvertFrom-Json -InputObject $raw
  $kind = if ($event.hook_event_name -eq 'PermissionRequest') { 'approval' } elseif ($event.hook_event_name -eq 'PreToolUse' -and $event.tool_name -match '(^|[./])request_user_input(_async)?$') { 'question' } else { exit 0 }
  if (-not ($event.session_id -is [string]) -or -not $event.session_id -or $event.session_id.Length -gt 512) { exit 0 }
  $sha = [System.Security.Cryptography.SHA256]::Create()
  function Anonymize([string]$value) { ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($value)))).Replace('-', '').ToLowerInvariant() }
  $request = if ($event.tool_use_id) { [string]$event.tool_use_id } else { [Guid]::NewGuid().ToString() }
  $notice = @{ id = (Anonymize ($event.session_id + ':' + $event.turn_id + ':' + $request + ':' + $kind)); source = 'codex'; kind = $kind; occurredAt = [DateTime]::UtcNow.ToString('o') }
  $inbox = '__INBOX__'
  # The running desktop app owns this directory. A stopped app must not accumulate history.
  if (-not [IO.Directory]::Exists($inbox) -or -not [IO.File]::Exists([IO.Path]::Combine($inbox, 'active'))) { exit 0 }
  $lease = [IO.File]::GetLastWriteTimeUtc([IO.Path]::Combine($inbox, 'active'))
  if (([DateTime]::UtcNow - $lease).TotalSeconds -gt 15) { exit 0 }
  $notice.client = Resolve-DesktopPetClient
  $name = [IO.Path]::Combine($inbox, [Guid]::NewGuid().ToString())
  [IO.File]::WriteAllText(($name + '.tmp'), ($notice | ConvertTo-Json -Compress), (New-Object Text.UTF8Encoding $false))
  [IO.File]::Move(($name + '.tmp'), ($name + '.json'))
} catch { # Notification failure must never decide or block the original request.
} finally { if ($sha) { $sha.Dispose() } }
exit 0
