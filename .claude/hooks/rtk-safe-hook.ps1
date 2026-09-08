#Requires -Version 5.1
<#
    Lorex RTK safe hook wrapper.

    Wraps the official `rtk hook claude` PreToolUse hook and strips every
    permission decision from its output.

    RTK 0.48.0 answers with permissionDecision "allow" for each command it
    rewrites, `git push` included. That takes authorization away from Claude
    Code's permission system and from this repository's Git safety rules. This
    wrapper keeps the rewrite and drops the decision, so RTK only ever
    compresses output and never authorizes anything.

    Contract:
      - reads the PreToolUse JSON on stdin
      - passes it to `rtk hook claude` unchanged
      - preserves RTK's updatedInput exactly
      - removes permissionDecision / permissionDecisionReason (and the legacy
        decision / reason pair) wherever they appear
      - emits the remaining hook JSON, or nothing at all

    It never emits allow, deny or ask. Any failure - RTK missing, crashing,
    writing invalid JSON, or declining to rewrite - is silent: the wrapper
    writes nothing, exits 0, and Claude's normal command and permission flow
    continues untouched. RTK breaking must never block development.
#>

$ErrorActionPreference = 'Stop'

# Anything unexpected leaves the command untouched rather than failing the tool call.
trap { exit 0 }

# --- 1. original payload -----------------------------------------------------

try {
    $payload = [Console]::In.ReadToEnd()
} catch {
    exit 0
}

if ([string]::IsNullOrWhiteSpace($payload)) { exit 0 }

# --- 2. locate rtk -----------------------------------------------------------
# PATH first; the official user-scoped install location is the fallback, because
# a shell started before the PATH entry existed will not see it.

$rtk = $null
$onPath = Get-Command 'rtk' -CommandType Application -ErrorAction SilentlyContinue
if ($onPath) {
    $rtk = $onPath.Source
} else {
    $fallback = Join-Path $env:USERPROFILE '.local/bin/rtk.exe'
    if (Test-Path -LiteralPath $fallback) { $rtk = $fallback }
}

if (-not $rtk) { exit 0 }

# --- 3. invoke the official hook ---------------------------------------------

$global:LASTEXITCODE = 0
try {
    $raw = $payload | & $rtk hook claude
} catch {
    exit 0
}

if ($LASTEXITCODE -ne 0) { exit 0 }

$text = ($raw | Out-String).Trim()
if ([string]::IsNullOrWhiteSpace($text)) { exit 0 }

try {
    $obj = $text | ConvertFrom-Json
} catch {
    exit 0
}

if (-not $obj) { exit 0 }

# --- 4. strip every permission decision --------------------------------------

function Remove-Decision {
    param($Node)

    if ($null -eq $Node -or $Node -isnot [psobject]) { return }
    if ($Node -is [string] -or $Node -is [valuetype]) { return }

    $props = @($Node.PSObject.Properties)
    foreach ($prop in $props) {
        if ($prop.Name -in @('permissionDecision', 'permissionDecisionReason', 'decision', 'reason')) {
            $Node.PSObject.Properties.Remove($prop.Name)
            continue
        }
        # updatedInput is RTK's rewrite and is preserved verbatim.
        if ($prop.Name -ne 'updatedInput') {
            Remove-Decision -Node $prop.Value
        }
    }
}

Remove-Decision -Node $obj

# --- 5. a rewrite, or nothing ------------------------------------------------

$hso = $obj.hookSpecificOutput
if (-not $hso) { exit 0 }
if (-not $hso.PSObject.Properties['updatedInput']) { exit 0 }
if (-not $hso.PSObject.Properties['hookEventName']) { exit 0 }

try {
    $json = $obj | ConvertTo-Json -Depth 25 -Compress
} catch {
    exit 0
}

# Last line of defence: if a decision survived anything above, emit nothing.
if ($json -match '"(permissionDecision|permissionDecisionReason|decision)"') { exit 0 }

[Console]::Out.Write($json)
exit 0
