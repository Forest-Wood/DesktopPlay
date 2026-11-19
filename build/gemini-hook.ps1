# Antigravity Stop relay. The hook never changes the agent's decision.
$ErrorActionPreference = 'Stop'
try {
  $inbox = '__INBOX__'
  $active = Get-Item -LiteralPath (Join-Path $inbox 'active') -ErrorAction SilentlyContinue
  if ($active -and ([DateTime]::UtcNow - $active.LastWriteTimeUtc).TotalSeconds -lt 30) {
    $event = [Console]::In.ReadToEnd() | ConvertFrom-Json
    $reason = if ($null -ne $event.terminationReason) { [string]$event.terminationReason } else { '' }
    $normalStop = $reason -ceq 'NO_TOOL_CALL' -or $reason -ceq 'model_stop'
    $abortedStop = $reason -ceq 'ERROR' -or $reason -ceq 'USER_CANCELED' -or $reason -ceq 'error' -or $reason -ceq 'cancelled' -or [bool]$event.error
    $execNum = if ($null -ne $event.executionNum) { [long]$event.executionNum } else { 0L }
    if (($normalStop -or $abortedStop) -and $event.fullyIdle -is [bool] -and $event.fullyIdle -and
        !$event.parentConversationId -and !$event.isSubagent -and !$event.parentAgentId -and
        $event.conversationId -match '^[a-zA-Z0-9_-]{1,128}$') {
      $file = Join-Path $inbox ([Guid]::NewGuid().ToString())
      $data = @{ conversation = $event.conversationId; execution = $execNum; at = [DateTime]::UtcNow.ToString('o'); ok = ($normalStop -and !$event.error) }
      [IO.File]::WriteAllText($file + '.tmp', ($data | ConvertTo-Json -Compress))
      [IO.File]::Move($file + '.tmp', $file + '.json')
    }
  }
} catch { }
[Console]::Out.WriteLine('{}')
exit 0
