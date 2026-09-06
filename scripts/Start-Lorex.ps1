<#
.SYNOPSIS
    Starts the Lorex API and web dev server, then opens Lorex in the default browser.
.DESCRIPTION
    Skips any component that is already listening on its port, so re-running the script
    does not create duplicate processes. Process ids are recorded in .lorex/processes.json
    for Stop-Lorex.ps1; stdout/stderr go to .lorex/logs.
.PARAMETER NoBrowser
    Start the servers but do not open a browser window.
.PARAMETER Force
    Stop anything the launcher previously started before starting again.
#>
[CmdletBinding()]
param(
    [switch]$NoBrowser,
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'Lorex.Common.ps1')

if ($Force) {
    Write-LorexInfo 'Force requested; stopping tracked processes first.'
    & (Join-Path $PSScriptRoot 'Stop-Lorex.ps1') | Out-Null
}

Initialize-LorexRuntimeDirectory

$tracked = [object[]]@((Get-LorexTrackedProcesses) | Where-Object { Test-LorexProcessAlive $_ })

function Start-LorexComponent {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][int]$Port,
        [Parameter(Mandatory)][string]$FilePath,
        [Parameter(Mandatory)][string[]]$Arguments,
        [Parameter(Mandatory)][string]$WorkingDirectory,
        [hashtable]$Environment = @{}
    )

    if (Test-LorexPortInUse -Port $Port) {
        Write-LorexInfo "$Name already listening on port $Port; reusing it."
        return $null
    }

    $stdout = Join-Path $script:LorexLogDir "$Name.log"
    $stderr = Join-Path $script:LorexLogDir "$Name.err.log"

    $previous = @{}
    foreach ($key in $Environment.Keys) {
        $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
        [Environment]::SetEnvironmentVariable($key, $Environment[$key], 'Process')
    }

    try {
        $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments `
            -WorkingDirectory $WorkingDirectory -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    }
    finally {
        foreach ($key in $previous.Keys) {
            [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process')
        }
    }

    Write-LorexInfo "$Name started (pid $($process.Id)); logs at $stdout"
    return [pscustomobject]@{
        Name        = $Name
        ProcessId   = $process.Id
        ProcessName = $process.ProcessName
        StartTime   = $process.StartTime.ToString('o')
        Port        = $Port
    }
}

# ---------- API ----------
$apiEntry = Start-LorexComponent -Name 'api' -Port $script:LorexApiPort `
    -FilePath 'dotnet' `
    -Arguments @('run', '--project', 'src\Lorex.Api', '--no-launch-profile', '--urls', $script:LorexApiUrl) `
    -WorkingDirectory $script:LorexRepoRoot `
    -Environment @{ ASPNETCORE_ENVIRONMENT = 'Development' }
if ($apiEntry) { $tracked += $apiEntry }

# ---------- Web ----------
$webDir = Join-Path $script:LorexRepoRoot 'src\Lorex.Web'
if (-not (Test-Path (Join-Path $webDir 'node_modules'))) {
    Write-LorexInfo 'Installing web dependencies (first run).'
    Push-Location $webDir
    try { & npm.cmd install } finally { Pop-Location }
}

$webEntry = Start-LorexComponent -Name 'web' -Port $script:LorexWebPort `
    -FilePath 'npm.cmd' -Arguments @('run', 'dev') -WorkingDirectory $webDir `
    -Environment @{ LOREX_API_URL = $script:LorexApiUrl }
if ($webEntry) { $tracked += $webEntry }

Save-LorexTrackedProcesses -Entries $tracked

# ---------- Readiness ----------
$apiReady = Wait-LorexEndpoint -Url "$($script:LorexApiUrl)/health" -Label 'API' -TimeoutSeconds 120
if ($apiReady) { Write-LorexOk "API ready at $($script:LorexApiUrl)" }

$webReady = Wait-LorexEndpoint -Url $script:LorexWebUrl -Label 'web' -TimeoutSeconds 120
if ($webReady) { Write-LorexOk "Web ready at $($script:LorexWebUrl)" }

# Record the processes that actually own the sockets. "dotnet run" and "npm run dev" both
# fork, and the launcher parent may exit once the child is up, so tracking only the parent
# would leave orphans behind on stop.
foreach ($listener in @(
        @{ Name = 'api-listener'; Port = $script:LorexApiPort },
        @{ Name = 'web-listener'; Port = $script:LorexWebPort })) {
    $owned = Get-LorexOwnedPortProcess -Port $listener.Port
    if (-not $owned) { continue }
    if ($tracked | Where-Object { $_.ProcessId -eq $owned.ProcessId }) { continue }
    $entry = New-LorexProcessEntry -Name $listener.Name -ProcessId $owned.ProcessId -Port $listener.Port
    if ($entry) { $tracked += $entry }
}

Save-LorexTrackedProcesses -Entries $tracked

if (-not ($apiReady -and $webReady)) {
    Write-LorexFail "Startup incomplete. Check logs in $($script:LorexLogDir)."
    exit 1
}

if (-not $NoBrowser) {
    Write-LorexInfo 'Opening Lorex in the default browser.'
    Start-Process $script:LorexWebUrl | Out-Null
}

Write-LorexOk 'Lorex is running. Use Stop-Lorex.cmd to stop it.'
