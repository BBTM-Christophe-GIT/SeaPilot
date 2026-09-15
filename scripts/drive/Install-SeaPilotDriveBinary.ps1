function Install-SeaPilotDriveBinary {
    param([string]$InstallFolder, [string]$Compiler, [string[]]$Sources)

    New-Item -ItemType Directory -Path $InstallFolder -Force | Out-Null
    # A running Windows executable cannot be overwritten. Publish a new binary
    # before changing the protocol registration; existing transfers finish normally.
    $executable = Join-Path $InstallFolder ('SeaPilotDrive-' + [guid]::NewGuid().ToString('N') + '.exe')
    try {
        & $Compiler /nologo /target:winexe /reference:System.Windows.Forms.dll /reference:System.Web.Extensions.dll "/out:$executable" @Sources | Out-Host
        if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $executable -PathType Leaf)) {
            throw 'Compilation du lanceur impossible. La version precedente reste disponible.'
        }
        return $executable
    } catch {
        if (Test-Path -LiteralPath $executable) { Remove-Item -LiteralPath $executable -Force }
        throw
    }
}
