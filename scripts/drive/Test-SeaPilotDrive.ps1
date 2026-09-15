$ErrorActionPreference = 'Stop'
Add-Type -Path @((Join-Path $PSScriptRoot 'SeaPilotDrive.cs'), (Join-Path $PSScriptRoot 'SeaPilotDriveBridge.cs')) -ReferencedAssemblies System.Windows.Forms,System.Web.Extensions
$testRoot = Join-Path $env:TEMP ('seapilot-drive-test-' + [guid]::NewGuid())
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
} finally { Stop-Process -Id $nativeProcess.Id -ErrorAction SilentlyContinue }
