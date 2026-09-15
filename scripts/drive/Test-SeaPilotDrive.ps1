$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archivePath = Join-Path $PSScriptRoot '..\..\public\connectors\seapilot-drive-windows.zip'
$archive = [IO.Compression.ZipFile]::OpenRead($archivePath)
try {
    foreach ($name in @('SeaPilotDrive.cs', 'SeaPilotDriveBridge.cs', 'Install-SeaPilotDrive.ps1', 'Install-SeaPilotDriveBinary.ps1', 'Installer.cmd', 'LISEZ-MOI.txt')) {
        $entry = $archive.GetEntry($name)
        if (!$entry) { throw "Installer archive is missing $name." }
        $reader = [IO.StreamReader]::new($entry.Open())
        try {
            # Git may normalize line endings on the Windows CI runner.
            $packedText = $reader.ReadToEnd().Replace("`r`n", "`n")
            $sourceText = [IO.File]::ReadAllText((Join-Path $PSScriptRoot $name)).Replace("`r`n", "`n")
            if ($packedText -cne $sourceText) { throw "Installer archive is outdated: $name." }
        } finally { $reader.Dispose() }
    }
    Write-Output 'PASS: installer archive contains the exact current sources.'
} finally { $archive.Dispose() }
Add-Type -Path @((Join-Path $PSScriptRoot 'SeaPilotDrive.cs'), (Join-Path $PSScriptRoot 'SeaPilotDriveBridge.cs')) -ReferencedAssemblies System.Windows.Forms,System.Web.Extensions
# Hosted Windows runners can expose TEMP using an 8.3 short username. Compare
# canonical full paths, as the launcher does, instead of short/long spellings.
$testRoot = [IO.Path]::GetFullPath((Join-Path $env:TEMP ('seapilot-drive-test-' + [guid]::NewGuid())))
New-Item -ItemType Directory -Path $testRoot | Out-Null
$testPath = Join-Path $testRoot 'procedure.docx'
Set-Content -LiteralPath $testPath -Value 'fixture'
function Make-Uri([string]$Path) {
    'seapilot-drive://open/' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Path)).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}
if ([SeaPilotDrive]::ResolvePath($testRoot, (Make-Uri 'procedure.docx')) -ne $testPath) { throw 'Valid file did not resolve.' }
$rejected = 0
foreach ($path in @('../procedure.docx', 'C:/procedure.docx', '\\server\x.docx', 'dir//x.docx', 'dir./x.docx', 'NUL.docx', 'procedure.docx:evil.exe', 'evil.exe', 'macro.docm', 'missing.docx')) {
    try { [SeaPilotDrive]::ResolvePath($testRoot, (Make-Uri $path)) | Out-Null }
    catch { $rejected++; continue }
    throw "Unsafe or missing file accepted: $path"
}
foreach ($uri in @('https://example.test', 'seapilot-drive://open/abc%22', 'seapilot-drive://open/abc?x=1', 'seapilot-drive://open/abc/xyz')) {
    try { [SeaPilotDrive]::ResolvePath($testRoot, $uri) | Out-Null }
    catch { $rejected++; continue }
    throw 'Malformed URI accepted.'
}
$outsideRoot = Join-Path $env:TEMP ('seapilot-drive-outside-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $outsideRoot | Out-Null
Set-Content -LiteralPath (Join-Path $outsideRoot 'outside.docx') -Value 'outside fixture'
New-Item -ItemType Junction -Path (Join-Path $testRoot 'linked') -Value $outsideRoot | Out-Null
try { [SeaPilotDrive]::ResolvePath($testRoot, (Make-Uri 'linked/outside.docx')) | Out-Null }
catch { $rejected++ }
if ($rejected -ne 15) { throw 'A junction escaped the configured folder.' }
Write-Output "PASS: valid file and $rejected unsafe/missing path cases, including junction escape. Fixtures: $testRoot"

$disciplinaryPath = Join-Path $testRoot 'piece.pdf'
Set-Content -LiteralPath $disciplinaryPath -Value 'attachment fixture'
$disciplinaryUri = (Make-Uri 'piece.pdf').Replace('://open/', '://disciplinary/open/')
if ([SeaPilotDrive]::ResolvePath($testRoot, $disciplinaryUri) -ne $disciplinaryPath) { throw 'Disciplinary PDF did not resolve.' }
foreach ($path in @('../procedure.docx', 'evil.exe', 'macro.docm', 'linked/outside.docx')) {
    $uri = (Make-Uri $path).Replace('://open/', '://disciplinary/open/')
    try { [SeaPilotDrive]::ResolvePath($testRoot, $uri) | Out-Null }
    catch { continue }
    throw "Unsafe disciplinary path accepted: $path"
}
Write-Output 'PASS: disciplinary PDF and four unsafe path cases.'

$moduleRoot = Join-Path $testRoot 'SeaPilot'
New-Item -ItemType Directory -Path $moduleRoot | Out-Null
$disciplinaryRoot = [SeaPilotDriveBridge]::EnsureDirectory($moduleRoot, 'Sanctions Disciplinaires')
$personFolder = [SeaPilotDriveBridge]::EnsurePersonFolder($disciplinaryRoot, 2, 41, 'Camille EXEMPLE')
if ($personFolder -ne 'Camille EXEMPLE - c2-p41') { throw 'Collaborator folder is not canonical.' }
if ([SeaPilotDriveBridge]::EnsurePersonFolder($disciplinaryRoot, 2, 41, 'Camille NOM MODIFIE') -ne $personFolder) { throw 'Renaming a collaborator created a duplicate folder.' }
$relative = "$personFolder/2026-09-15/courrier.docx"
[SeaPilotDriveBridge]::WriteFile($disciplinaryRoot, $relative, [Text.Encoding]::UTF8.GetBytes('native write fixture'))
if ([IO.File]::ReadAllText((Join-Path $disciplinaryRoot $relative)) -ne 'native write fixture') { throw 'Native write verification failed.' }
try { [SeaPilotDriveBridge]::WriteFile($disciplinaryRoot, $relative, [byte[]](1,2,3)); throw 'Overwrite accepted.' } catch [IO.IOException] { }
New-Item -ItemType Junction -Path (Join-Path $disciplinaryRoot 'outside') -Value $outsideRoot | Out-Null
foreach ($relative in @('../escape/file.docx','outside/child/file.docx','NUL/file.docx','person/date/macro.docm','person/date/run.exe')) {
    $didReject = $false
    try { [SeaPilotDriveBridge]::WriteFile($disciplinaryRoot, $relative, [byte[]](1,2,3)) } catch { $didReject = $true }
    if (!$didReject) { throw "Unsafe write accepted: $relative" }
}
if (Test-Path -LiteralPath (Join-Path $outsideRoot 'child')) { throw 'Junction write created an external directory.' }
$futureFolder = [SeaPilotDriveBridge]::EnsureDirectory($moduleRoot, 'Futur module')
Set-Content -LiteralPath (Join-Path $futureFolder 'futur.docx') -Value 'future module fixture'
$futureUri = (Make-Uri 'Futur module/futur.docx').Replace('://open/', '://root/open/')
if ([SeaPilotDrive]::ResolvePath($moduleRoot, $futureUri) -ne (Join-Path $futureFolder 'futur.docx')) { throw 'Future module requires a new launcher.' }
if ([SeaPilotDriveBridge]::AllowedOrigin('https://sea-pilot-ten.vercel.app.evil.example') -or [SeaPilotDriveBridge]::AllowedOrigin('null')) { throw 'Foreign browser origin accepted.' }
Write-Output 'PASS: automatic collaborator folders, stable identity, native writes, no overwrite, junction rejection and future module opening.'

$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$testExecutable = Join-Path $testRoot 'SeaPilotDriveTest.exe'
& $compiler /nologo /target:winexe /reference:System.Windows.Forms.dll /reference:System.Web.Extensions.dll "/out:$testExecutable" (Join-Path $PSScriptRoot 'SeaPilotDrive.cs') (Join-Path $PSScriptRoot 'SeaPilotDriveBridge.cs')
if ($LASTEXITCODE -ne 0) { throw 'Launcher compile failed.' }
$port = Get-Random -Minimum 49152 -Maximum 65535
$nonce = ([guid]::NewGuid()).ToString('N')
$nativeProcess = Start-Process -FilePath $testExecutable -ArgumentList "seapilot-drive://connect/$port/$nonce" -WindowStyle Hidden -PassThru
try {
    $endpoint = "http://127.0.0.1:$port/$nonce"
    $allowedHeaders = @{ Origin = 'http://localhost:5178' }
    $ready = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        try { $health = Invoke-RestMethod -Uri "$endpoint/health" -Headers $allowedHeaders -TimeoutSec 2; $ready = $true; break } catch { $healthError = $_.Exception.Message; Start-Sleep -Milliseconds 150 }
    }
    if (!$ready -or $health.version -ne '2.0.0') { throw "Native bridge failed to start (process exited: $($nativeProcess.HasExited)): $healthError" }
    foreach ($testUri in @("http://127.0.0.1:$port/wrong/health", "$endpoint/request")) {
        $denied = $false
        try { Invoke-RestMethod -Uri $testUri -Method Post -ContentType 'application/json' -Body '{}' -Headers $allowedHeaders -TimeoutSec 5 | Out-Null } catch { $denied = $true }
        if (!$denied) { throw 'Invalid session or unauthenticated write accepted.' }
    }
    $denied = $false
    try { Invoke-RestMethod -Uri "$endpoint/health" -Headers @{ Origin = 'https://untrusted.example' } -TimeoutSec 5 | Out-Null } catch { $denied = $true }
    if (!$denied) { throw 'Untrusted browser accepted.' }
    Write-Output 'PASS: real loopback HTTP session, origin/nonce checks and authentication required for writes.'
    . (Join-Path $PSScriptRoot 'Install-SeaPilotDriveBinary.ps1')
    $installTestFolder = Join-Path $testRoot 'installed'
    New-Item -ItemType Directory -Path $installTestFolder | Out-Null
    $legacyExecutable = Join-Path $installTestFolder 'SeaPilotDrive.exe'
    Copy-Item -LiteralPath $testExecutable -Destination $legacyExecutable
    $legacyLock = [IO.File]::Open($legacyExecutable, 'Open', 'Read', 'Read')
    try {
        $sources = @((Join-Path $PSScriptRoot 'SeaPilotDrive.cs'), (Join-Path $PSScriptRoot 'SeaPilotDriveBridge.cs'))
        $published = Install-SeaPilotDriveBinary -InstallFolder $installTestFolder -Compiler $compiler -Sources $sources
        $nextPort = Get-Random -Minimum 49152 -Maximum 65535
        while ($nextPort -eq $port) { $nextPort = Get-Random -Minimum 49152 -Maximum 65535 }
        $nextProcess = Start-Process -FilePath $published -ArgumentList "seapilot-drive://connect/$nextPort/$nonce" -WindowStyle Hidden -PassThru
        try {
            $nextEndpoint = "http://127.0.0.1:$nextPort/$nonce/health"
            $ready = $false
            for ($attempt = 0; $attempt -lt 20; $attempt++) {
                try { Invoke-RestMethod -Uri $nextEndpoint -Headers $allowedHeaders -TimeoutSec 2 | Out-Null; $ready = $true; break } catch { Start-Sleep -Milliseconds 150 }
            }
            if (!$ready) { throw 'Installed launcher did not start.' }
            $replacement = Install-SeaPilotDriveBinary -InstallFolder $installTestFolder -Compiler $compiler -Sources $sources
            if ($replacement -eq $published -or !(Test-Path -LiteralPath $replacement)) { throw 'Update did not publish a separate executable.' }
            if ((Invoke-RestMethod -Uri $nextEndpoint -Headers $allowedHeaders -TimeoutSec 2).version -ne '2.0.0') { throw 'Update interrupted the running launcher.' }
            $invalidSource = Join-Path $testRoot 'invalid.cs'
            Set-Content -LiteralPath $invalidSource -Value 'This is an intentionally invalid compiler fixture'
            $failed = $false
            try { Install-SeaPilotDriveBinary -InstallFolder $installTestFolder -Compiler $compiler -Sources @($invalidSource) | Out-Null } catch { $failed = $true }
            if (!$failed -or !(Test-Path -LiteralPath $replacement)) { throw 'Failed compilation damaged the installed launcher.' }
            if ((Get-ChildItem -LiteralPath $installTestFolder -Filter '*.exe').Count -ne 3) { throw 'Failed compilation left an incomplete executable.' }
            Write-Output 'PASS: locked legacy executable, repeated installation while launcher runs, uninterrupted session and compiler failure recovery.'
        } finally { Stop-Process -Id $nextProcess.Id -ErrorAction SilentlyContinue }
    } finally { $legacyLock.Dispose() }
} finally { Stop-Process -Id $nativeProcess.Id -ErrorAction SilentlyContinue }
