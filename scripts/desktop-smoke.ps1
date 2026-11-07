param(
    [string]$AppPath = "",
    [string]$Workspace = "",
    [int]$TimeoutSeconds = 60
)

$ErrorActionPreference = "Stop"

$Root = Split-Path $PSScriptRoot -Parent
if (-not $Workspace) { $Workspace = $Root }
if (-not $AppPath) {
    $AppPath = Join-Path $env:LOCALAPPDATA "Programs\@opencode-aidesktop\OpenCode.exe"
}
if (-not (Test-Path -LiteralPath $AppPath)) {
    throw "OpenCode Desktop não encontrado: $AppPath"
}
if (-not (Test-Path -LiteralPath $Workspace)) {
    throw "Workspace não encontrado: $Workspace"
}

$running = Get-Process -Name "OpenCode" -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -eq $AppPath }
if ($running) {
    throw "Feche o OpenCode Desktop antes do smoke test."
}

$python = Join-Path $Root ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $python)) {
    throw "Python do workbench não encontrado: $python"
}

$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("opencode-desktop-smoke-" + [guid]::NewGuid().ToString("N"))
$fakeHome = Join-Path $tempRoot "home"
$profile = Join-Path $tempRoot "profile"
New-Item -ItemType Directory -Force -Path $fakeHome, $profile | Out-Null

$envNames = @(
    "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA",
    "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME", "PYTHONPATH"
)
$previous = @{}
foreach ($name in $envNames) {
    $previous[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
}

$env:HOME = $fakeHome
$env:USERPROFILE = $fakeHome
$env:APPDATA = Join-Path $fakeHome "AppData\Roaming"
$env:LOCALAPPDATA = Join-Path $fakeHome "AppData\Local"
$env:XDG_CONFIG_HOME = Join-Path $fakeHome ".config"
$env:XDG_DATA_HOME = Join-Path $fakeHome ".local\share"
$env:XDG_CACHE_HOME = Join-Path $fakeHome ".cache"
$env:PYTHONPATH = Join-Path $Root "src"

$logCandidates = @(
    (Join-Path $fakeHome ".local\share\opencode\log\opencode.log"),
    (Join-Path $fakeHome "AppData\Local\opencode\log\opencode.log")
)
$offset = 0
foreach ($candidate in $logCandidates) {
    if (Test-Path -LiteralPath $candidate) {
        $offset = (Get-Item -LiteralPath $candidate).Length
    }
}

$proc = $null
try {
    $arguments = "--user-data-dir=`"$profile`" `"$Workspace`""
    $proc = Start-Process -FilePath $AppPath -ArgumentList $arguments -PassThru
    Start-Sleep -Seconds 2
    if ($proc.HasExited) {
        throw "OpenCode Desktop encerrou durante a inicialização (exit=$($proc.ExitCode))."
    }

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $log = $null
    while ((Get-Date) -lt $deadline) {
        $found = Get-ChildItem -Path $fakeHome, $profile -Recurse -Filter "opencode.log" -File -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1
        if ($found) {
            $log = $found.FullName
            break
        }
        Start-Sleep -Milliseconds 500
    }
    if (-not $log) {
        throw "Log do OpenCode Desktop não foi criado dentro de $TimeoutSeconds segundos"
    }

    Start-Sleep -Seconds 5
    & $python -m workbench.desktop_smoke --log $log --since $offset
    if ($LASTEXITCODE -ne 0) {
        throw "Desktop smoke falhou; veja o log: $log"
    }
    Write-Output "desktop smoke ok: $log"
}
finally {
    if ($proc -and -not $proc.HasExited) {
        & taskkill.exe /PID $proc.Id /T /F | Out-Null
    }
    foreach ($name in $envNames) {
        if ($null -eq $previous[$name]) {
            Remove-Item "Env:$name" -ErrorAction SilentlyContinue
        } else {
            [Environment]::SetEnvironmentVariable($name, $previous[$name], "Process")
        }
    }
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
}
