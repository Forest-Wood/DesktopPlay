# Antigravity Stop relay. The hook never changes the agent's decision.
$ErrorActionPreference = 'Stop'
try {
  $inbox = '__INBOX__'
  $active = Get-Item -LiteralPath (Join-Path $inbox 'active') -ErrorAction SilentlyContinue
  if ($active -and ([DateTime]::UtcNow - $active.LastWriteTimeUtc).TotalSeconds -lt 30) {
    $event = [Console]::In.ReadToEnd() | ConvertFrom-Json
    if ($event.terminationReason -ceq 'model_stop' -and $event.fullyIdle -is [bool] -and $event.fullyIdle -and !$event.error -and
        !$event.parentConversationId -and !$event.isSubagent -and !$event.parentAgentId -and
        $event.conversationId -match '^[a-zA-Z0-9_-]{1,128}$' -and $null -ne $event.executionNum) {
      $file = Join-Path $inbox ([Guid]::NewGuid().ToString())
      $data = @{ conversation = $event.conversationId; execution = [long]$event.executionNum; at = [DateTime]::UtcNow.ToString('o') }
      [IO.File]::WriteAllText($file + '.tmp', ($data | ConvertTo-Json -Compress))
      [IO.File]::Move($file + '.tmp', $file + '.json')
    }
  }
} catch { }
[Console]::Out.WriteLine('{}')
exit 0
