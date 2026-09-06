<#
.SYNOPSIS
    Stops the Lorex processes that Start-Lorex.ps1 started.
.DESCRIPTION
    Only touches process ids recorded in .lorex/processes.json whose identity still matches,
    so unrelated dotnet/node processes are never killed.
#>
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'Lorex.Common.ps1')

$tracked = Get-LorexTrackedProcesses
$stoppedAnything = $false

$remaining = @()
foreach ($entry in $tracked) {
    if (-not (Test-LorexProcessAlive $entry)) {
        Write-LorexInfo "$($entry.Name) (pid $($entry.ProcessId)) is already gone."
        continue
    }

    if (Stop-LorexProcessTree -ProcessId $entry.ProcessId) {
        Write-LorexOk "Stopped $($entry.Name) (pid $($entry.ProcessId))."
        $stoppedAnything = $true
    }
    else {
        Write-LorexWarn "Could not stop $($entry.Name) (pid $($entry.ProcessId)); stop it manually."
        $remaining += $entry
    }
}

Save-LorexTrackedProcesses -Entries $remaining

# Fallback for orphans: only processes whose image or command line lives inside this
# repository are eligible, so unrelated dotnet/node servers on these ports are left alone.
foreach ($port in @($script:LorexApiPort, $script:LorexWebPort)) {
    if (-not (Test-LorexPortInUse -Port $port)) { continue }

    $owned = Get-LorexOwnedPortProcess -Port $port
    if (-not $owned) {
        Write-LorexWarn "Port $port is in use by a process outside this repository; leaving it alone."
        continue
    }

    if (Stop-LorexProcessTree -ProcessId $owned.ProcessId) {
        Write-LorexOk "Stopped orphaned $($owned.Name) on port $port (pid $($owned.ProcessId))."
        $stoppedAnything = $true
    }
    else {
        Write-LorexWarn "Could not stop $($owned.Name) on port $port (pid $($owned.ProcessId))."
    }
}

if (-not $stoppedAnything) {
    Write-LorexInfo 'Nothing to stop; Lorex was not running.'
    exit 0
}

Write-LorexOk 'Lorex stopped.'
