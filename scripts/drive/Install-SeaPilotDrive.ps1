param([string]$SeaPilotRoot, [string]$SyncRoot, [string]$DisciplinaryRoot, [switch]$NoConfigure)
$ErrorActionPreference = 'Stop'
$installFolder = Join-Path $env:LOCALAPPDATA 'SeaPilotDrive'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$source = Join-Path $PSScriptRoot 'SeaPilotDrive.cs'
$bridgeSource = Join-Path $PSScriptRoot 'SeaPilotDriveBridge.cs'
$binaryInstaller = Join-Path $PSScriptRoot 'Install-SeaPilotDriveBinary.ps1'
if (!(Test-Path -LiteralPath $compiler) -or !(Test-Path -LiteralPath $source) -or !(Test-Path -LiteralPath $bridgeSource) -or !(Test-Path -LiteralPath $binaryInstaller)) {
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
. $binaryInstaller
$executable = Install-SeaPilotDriveBinary -InstallFolder $installFolder -Compiler $compiler -Sources @($source, $bridgeSource)
$protocolKey = 'HKCU:\Software\Classes\seapilot-drive'
New-Item -Path "$protocolKey\shell\open\command" -Force | Out-Null
Set-Item -Path $protocolKey -Value 'URL:SeaPilot Google Drive'
New-ItemProperty -Path $protocolKey -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
Set-Item -Path "$protocolKey\shell\open\command" -Value ('"' + $executable + '" "%1"')
if ($SyncRoot) {
    New-Item -Path 'HKCU:\Software\SeaPilot\Drive' -Force | Out-Null
    New-ItemProperty -Path 'HKCU:\Software\SeaPilot\Drive' -Name Root -Value $SyncRoot -PropertyType String -Force | Out-Null
}
if ($DisciplinaryRoot) {
    New-Item -Path 'HKCU:\Software\SeaPilot\Drive' -Force | Out-Null
    New-ItemProperty -Path 'HKCU:\Software\SeaPilot\Drive' -Name DisciplinaryRoot -Value $DisciplinaryRoot -PropertyType String -Force | Out-Null
}
Write-Output 'Lanceur SeaPilot Drive installe pour cet utilisateur Windows.'

# Upgrade the former per-module settings only when they identify the same SeaPilot parent.
$settingsPath = 'HKCU:\Software\SeaPilot\Drive'
$previous = Get-ItemProperty -Path $settingsPath -ErrorAction SilentlyContinue
if (!$SeaPilotRoot -and $previous.SeaPilotRoot) { $SeaPilotRoot = $previous.SeaPilotRoot }
if (!$SeaPilotRoot -and $previous.Root -and $previous.DisciplinaryRoot) {
    $procedureParent = Split-Path -Parent $previous.Root
    if ($procedureParent -eq (Split-Path -Parent $previous.DisciplinaryRoot) -and (Split-Path -Leaf $procedureParent) -eq 'SeaPilot') { $SeaPilotRoot = $procedureParent }
}
if ($SeaPilotRoot) {
    $SeaPilotRoot = (Resolve-Path -LiteralPath $SeaPilotRoot -ErrorAction Stop).Path.TrimEnd('\')
    if (!(Test-Path -LiteralPath $SeaPilotRoot -PathType Container) -or (Split-Path -Leaf $SeaPilotRoot) -ne 'SeaPilot') { throw 'Selectionnez la racine SeaPilot.' }
    New-Item -Path $settingsPath -Force | Out-Null
    New-ItemProperty -Path $settingsPath -Name SeaPilotRoot -Value $SeaPilotRoot -PropertyType String -Force | Out-Null
    $initialize = Start-Process -FilePath $executable -ArgumentList 'seapilot-drive://initialize' -WindowStyle Hidden -Wait -PassThru
    if ($initialize.ExitCode -ne 0) { throw 'Les dossiers SeaPilot n ont pas pu etre prepares. Verifiez la synchronisation et les droits du dossier.' }
} elseif (!$NoConfigure) {
    Start-Process -FilePath $executable -ArgumentList 'seapilot-drive://configure' -WindowStyle Hidden
}
