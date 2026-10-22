# DesktopPet notification relay. Never writes an approval decision or tool output.
$ErrorActionPreference = 'Stop'
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
  $name = [IO.Path]::Combine($inbox, [Guid]::NewGuid().ToString())
  [IO.File]::WriteAllText(($name + '.tmp'), ($notice | ConvertTo-Json -Compress), (New-Object Text.UTF8Encoding $false))
  [IO.File]::Move(($name + '.tmp'), ($name + '.json'))
} catch { # Notification failure must never decide or block the original request.
} finally { if ($sha) { $sha.Dispose() } }
exit 0
