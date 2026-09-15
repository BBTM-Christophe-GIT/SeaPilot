param([string]$SyncRoot, [string]$DisciplinaryRoot)
$ErrorActionPreference = 'Stop'
$installFolder = Join-Path $env:LOCALAPPDATA 'SeaPilotDrive'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$source = Join-Path $PSScriptRoot 'SeaPilotDrive.cs'
if (!(Test-Path -LiteralPath $compiler) -or !(Test-Path -LiteralPath $source)) {
    throw 'Extrayez toutes les pieces de l archive avant installation. .NET Framework 4 est requis.'
}
if ($SyncRoot) {
    $SyncRoot = (Resolve-Path -LiteralPath $SyncRoot -ErrorAction Stop).Path
    if (!(Test-Path -LiteralPath $SyncRoot -PathType Container)) { throw 'Dossier synchronise invalide.' }
}
if ($DisciplinaryRoot) {
    $DisciplinaryRoot = (Resolve-Path -LiteralPath $DisciplinaryRoot -ErrorAction Stop).Path
    if (!(Test-Path -LiteralPath $DisciplinaryRoot -PathType Container)) { throw 'Dossier disciplinaire invalide.' }
}
New-Item -ItemType Directory -Path $installFolder -Force | Out-Null
$executable = Join-Path $installFolder 'SeaPilotDrive.exe'
& $compiler /nologo /target:winexe /reference:System.Windows.Forms.dll "/out:$executable" $source
if ($LASTEXITCODE -ne 0) { throw 'Compilation du lanceur impossible.' }
$protocolKey = 'HKCU:\Software\Classes\seapilot-drive'
New-Item -Path "$protocolKey\shell\open\command" -Force | Out-Null
Set-Item -Path $protocolKey -Value 'URL:SeaPilot Google Drive'
New-ItemProperty -Path $protocolKey -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
Set-Item -Path "$protocolKey\shell\open\command" -Value ('"' + $executable + '" "%1"')
if ($SyncRoot) {
    New-Item -Path 'HKCU:\Software\SeaPilot\Drive' -Force | Out-Null
    New-ItemProperty -Path 'HKCU:\Software\SeaPilot\Drive' -Name Root -Value $SyncRoot -PropertyType String -Force | Out-Null
} elseif (!$DisciplinaryRoot) {
    Start-Process -FilePath $executable -ArgumentList 'seapilot-drive://configure' -WindowStyle Hidden
}
if ($DisciplinaryRoot) {
    New-Item -Path 'HKCU:\Software\SeaPilot\Drive' -Force | Out-Null
    New-ItemProperty -Path 'HKCU:\Software\SeaPilot\Drive' -Name DisciplinaryRoot -Value $DisciplinaryRoot -PropertyType String -Force | Out-Null
}
Write-Output 'Lanceur SeaPilot Drive installe pour cet utilisateur Windows.'
