# Bootstrap Python do Workbench (Windows PowerShell 5.1+).
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Arguments
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = (Resolve-Path (Join-Path $ScriptDir "..")).Path
$MinVersion = if ($env:WB_PYTHON_VERSION) { $env:WB_PYTHON_VERSION } else { "3.11" }
$Venv = Join-Path $Root ".venv"
$VenvPython = Join-Path $Venv "Scripts\python.exe"

function Log([string]$Message) {
    [Console]::Error.WriteLine("[workbench/bootstrap] $Message")
}

function Fail([string]$Message) {
    [Console]::Error.WriteLine("[workbench/bootstrap] ERRO: $Message")
    exit 3
}

function Invoke-NativeCapture {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$ArgumentList = @()
    )
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $output = & $FilePath @ArgumentList 2>&1
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
    return @{
        Output = (($output | ForEach-Object { "$_" }) -join "`n").Trim()
        Code = $code
    }
}

function Test-PythonCandidate([string]$Exe, [string[]]$PrefixArgs) {
    $command = Get-Command $Exe -ErrorAction SilentlyContinue
    if (-not $command) { return $null }
    $path = $command.Source
    # Aliases da Microsoft Store não são interpretadores reais.
    if ($path -like "*\WindowsApps\*") { return $null }

    $result = Invoke-NativeCapture -FilePath $path -ArgumentList (@($PrefixArgs) + @(
        "-c", "import sys; sys.exit(0 if sys.version_info[:2] >= (3, 11) else 1)"
    ))
    if ($result.Code -eq 0) {
        return @{ Path = $path; PrefixArgs = $PrefixArgs }
    }
    return $null
}

function Find-Python {
    if ($env:WB_PYTHON) {
        $candidate = Test-PythonCandidate $env:WB_PYTHON @()
        if ($candidate) { return $candidate }
        Fail "WB_PYTHON não é um Python >= 3.11: $env:WB_PYTHON"
    }
    $candidates = @(
        @("python", @()),
        @("python3", @()),
        @("py", @("-3.11")),
        @("py", @("-3")),
        @("python3.11", @()),
        @("python3.12", @()),
        @("python3.13", @())
    )
    foreach ($entry in $candidates) {
        $candidate = Test-PythonCandidate $entry[0] $entry[1]
        if ($candidate) { return $candidate }
    }
    return $null
}

function Ensure-Uv {
    if (Get-Command uv -ErrorAction SilentlyContinue) { return }
    if ($env:WB_NO_INSTALL -eq "1") { Fail "uv não encontrado e WB_NO_INSTALL=1" }

    Log "uv não encontrado; instalando via instalador oficial..."
    $install = Invoke-NativeCapture -FilePath "powershell" -ArgumentList @(
        "-NoProfile", "-ExecutionPolicy", "ByPass",
        "-Command", "irm https://astral.sh/uv/install.ps1 | iex"
    )
    $env:Path = "$HOME\.local\bin;$env:Path"

    if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
        Log "Instalador oficial falhou; tentando winget..."
        if (Get-Command winget -ErrorAction SilentlyContinue) {
            Invoke-NativeCapture -FilePath "winget" -ArgumentList @(
                "install", "--id=astral-sh.uv", "-e", "--silent",
                "--accept-package-agreements", "--accept-source-agreements"
            ) | Out-Null
            $env:Path = "$HOME\.local\bin;$env:Path"
        }
    }
    if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
        Fail "uv não está no PATH após instalação. Instalador: $($install.Output)"
    }
}

$python = $null
if (Test-Path $VenvPython) {
    $python = Test-PythonCandidate $VenvPython @()
}
if (-not $python) {
    $python = Find-Python
}
if (-not $python) {
    Log "Python >= $MinVersion não encontrado."
    Ensure-Uv
    Log "Instalando Python $MinVersion via uv..."
    $install = Invoke-NativeCapture -FilePath "uv" -ArgumentList @("python", "install", $MinVersion)
    if ($install.Code -ne 0) { Fail "falha ao instalar Python ${MinVersion}: $($install.Output)" }

    $env:UV_NO_PROJECT = "1"
    $found = Invoke-NativeCapture -FilePath "uv" -ArgumentList @(
        "python", "find", "--managed-python", $MinVersion
    )
    if ($found.Code -ne 0 -or -not $found.Output) {
        $found = Invoke-NativeCapture -FilePath "uv" -ArgumentList @(
            "python", "find", "--system", $MinVersion
        )
    }
    if ($found.Code -ne 0 -or -not $found.Output) {
        Fail "não foi possível localizar Python $MinVersion após instalação"
    }
    $python = @{ Path = ($found.Output -split "`n")[0].Trim(); PrefixArgs = @() }
}

Log "Usando Python: $($python.Path)"

if (-not (Test-Path $VenvPython)) {
    Log "Criando venv em $Venv..."
    if (Get-Command uv -ErrorAction SilentlyContinue) {
        $created = Invoke-NativeCapture -FilePath "uv" -ArgumentList @(
            "venv", "--python", $python.Path, $Venv
        )
    } else {
        $created = Invoke-NativeCapture -FilePath $python.Path -ArgumentList (
            @($python.PrefixArgs) + @("-m", "venv", $Venv)
        )
    }
    if ($created.Code -ne 0) { Fail "falha ao criar venv: $($created.Output)" }
}

if (Get-Command uv -ErrorAction SilentlyContinue) {
    Log "Sincronizando dependências..."
    Push-Location $Root
    try {
        $synced = Invoke-NativeCapture -FilePath "uv" -ArgumentList @("sync", "--frozen")
        if ($synced.Code -ne 0) {
            $synced = Invoke-NativeCapture -FilePath "uv" -ArgumentList @("sync")
        }
        if ($synced.Code -ne 0) { Fail "uv sync falhou: $($synced.Output)" }
    } finally {
        Pop-Location
    }
}

$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
$previous = $ErrorActionPreference
$ErrorActionPreference = "Continue"
try {
    & $VenvPython -m workbench @Arguments
    $code = $LASTEXITCODE
} finally {
    $ErrorActionPreference = $previous
}
exit $code
