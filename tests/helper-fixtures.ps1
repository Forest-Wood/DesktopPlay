$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# Load only five pure filesystem functions. The helper's top-level manifest,
# process, registry, uninstall and APPDATA code is never invoked by this test.
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$helperSource = Join-Path $workspace 'build\uninstall-helper.ps1'
$tokens = $null
$parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($helperSource, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -ne 0) { throw 'The production helper does not parse.' }
foreach ($name in @('Same-Path', 'Assert-PlainPath', 'Assert-Hash', 'Inspect-Tree', 'Remove-TreeWithoutLinks')) {
  $definitions = @($ast.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true))
  if ($definitions.Count -ne 1) { throw ('Expected exactly one production function: ' + $name) }
  . ([ScriptBlock]::Create($definitions[0].Extent.Text))
}

function Assert-That([bool]$condition, [string]$message) {
  if (!$condition) { throw $message }
}

function Expect-Rejection([ScriptBlock]$action, [string]$message) {
  $rejected = $false
  try { & $action } catch { $rejected = $true }
  Assert-That $rejected $message
}

Assert-PlainPath $workspace
$temporaryRoot = [IO.Path]::GetFullPath((Join-Path $workspace '.tmp'))
Assert-PlainPath $temporaryRoot
if (!(Test-Path -LiteralPath $temporaryRoot)) { [void][IO.Directory]::CreateDirectory($temporaryRoot) }
Assert-That ((Get-Item -LiteralPath $temporaryRoot -Force).PSIsContainer) 'The workspace .tmp is not a directory.'
$fixture = [IO.Path]::GetFullPath((Join-Path $temporaryRoot ('helper-fixtures-' + [Guid]::NewGuid().ToString())))
Assert-That ($fixture.StartsWith($temporaryRoot.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) 'The fixture escaped workspace .tmp.'
Assert-That ([IO.Path]::GetFileName($fixture) -match '^helper-fixtures-[a-f0-9-]{36}$') 'The fixture directory name is invalid.'
[void][IO.Directory]::CreateDirectory($fixture)
$links = [Collections.Generic.List[string]]::new()
$completed = 0

function Assert-FixturePath([string]$target) {
  $absolute = [IO.Path]::GetFullPath($target)
  Assert-That ($absolute.StartsWith($fixture.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase) -or (Same-Path $absolute $fixture)) 'A test operation escaped its freshly created fixture.'
}

try {
  # Recursive deletion affects only the explicit tree; adjacent files survive.
  $data = Join-Path $fixture 'DesktopPlay'
  $nested = Join-Path $data 'nested'
  $neighbor = Join-Path $fixture 'DesktopPlay-other'
  foreach ($directory in @($data, $nested, $neighbor)) { Assert-FixturePath $directory; [void][IO.Directory]::CreateDirectory($directory) }
  $neighborFile = Join-Path $neighbor 'keep.txt'
  [IO.File]::WriteAllText((Join-Path $data 'settings.json'), '{"fixture":true}')
  [IO.File]::WriteAllText((Join-Path $nested 'sound.ogg'), 'fixture audio')
  [IO.File]::WriteAllText((Join-Path $nested '.hidden-file'), 'hidden fixture')
  [IO.File]::WriteAllText($neighborFile, 'neighbor must survive')
  Assert-FixturePath $data
  Inspect-Tree $data
  Remove-TreeWithoutLinks $data
  Assert-That (!(Test-Path -LiteralPath $data)) 'Ordinary data tree was not deleted.'
  Assert-That ([IO.File]::ReadAllText($neighborFile) -eq 'neighbor must survive') 'An adjacent directory was changed.'
  $completed++

  # A confirmed executable replaced before deletion must fail hash validation.
  $program = Join-Path $fixture 'renamed fixture.exe'
  Assert-FixturePath $program
  [IO.File]::WriteAllText($program, 'first version')
  $originalHash = (Get-FileHash -LiteralPath $program -Algorithm SHA256).Hash.ToLowerInvariant()
  Assert-Hash $program $originalHash
  [IO.File]::WriteAllText($program, 'replacement version')
  Expect-Rejection { Assert-Hash $program $originalHash } 'A replaced EXE passed the original hash check.'
  Assert-That ([IO.File]::ReadAllText($program) -eq 'replacement version') 'The replacement EXE was modified.'
  $completed++

  # Directory junctions need no administrator privilege and are always tested.
  $linkedTarget = Join-Path $fixture 'linked-target'
  $linkedData = Join-Path $fixture 'linked-data'
  foreach ($directory in @($linkedTarget, $linkedData)) { Assert-FixturePath $directory; [void][IO.Directory]::CreateDirectory($directory) }
  $targetFile = Join-Path $linkedTarget 'sentinel.txt'
  [IO.File]::WriteAllText($targetFile, 'linked target must survive')
  $junction = Join-Path $linkedData 'junction'
  Assert-FixturePath $junction
  [void](New-Item -ItemType Junction -Path $junction -Target $linkedTarget)
  $links.Add($junction)
  Expect-Rejection { Inspect-Tree $linkedData } 'Preflight accepted a junction descendant.'
  Expect-Rejection { Remove-TreeWithoutLinks $linkedData } 'Recursive cleanup followed a junction.'
  Expect-Rejection { Assert-PlainPath (Join-Path $junction 'sentinel.txt') $true } 'A junction ancestor was accepted.'
  Assert-That ([IO.File]::ReadAllText($targetFile) -eq 'linked target must survive') 'Cleanup modified a junction target.'
  Assert-That (Test-Path -LiteralPath $junction) 'A rejected junction was deleted.'
  $completed++

  # Symbolic links are additionally exercised when the runner permits creation.
  $symbolicLink = Join-Path $fixture 'symbolic-link.txt'
  Assert-FixturePath $symbolicLink
  $symbolicCreated = $false
  try {
    [void](New-Item -ItemType SymbolicLink -Path $symbolicLink -Target $targetFile)
    $links.Add($symbolicLink)
    $symbolicCreated = $true
  } catch { Write-Output 'Symbolic-link fixture unavailable on this account; mandatory junction coverage passed.' }
  if ($symbolicCreated) {
    Expect-Rejection { Assert-PlainPath $symbolicLink $true } 'A symbolic link was accepted as an ordinary file.'
    Assert-That ([IO.File]::ReadAllText($targetFile) -eq 'linked target must survive') 'The symbolic link target was modified.'
    $completed++
  }
  Write-Output ('Production helper filesystem fixtures passed: ' + $completed + ' scenarios.')
} finally {
  # Remove links themselves using non-recursive .NET calls before cleaning the
  # fixture. Revalidate every absolute path; no cleanup can leave workspace .tmp.
  foreach ($link in $links) {
    Assert-FixturePath $link
    $item = Get-Item -LiteralPath $link -Force -ErrorAction SilentlyContinue
    if ($item) {
      Assert-That (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) 'A fixture link was unexpectedly replaced; preserve the directory.'
      if ($item.PSIsContainer) { [IO.Directory]::Delete($link, $false) }
      else { [IO.File]::Delete($link) }
    }
  }
  Assert-FixturePath $fixture
  Assert-PlainPath $fixture
  Inspect-Tree $fixture
  Remove-TreeWithoutLinks $fixture
}
