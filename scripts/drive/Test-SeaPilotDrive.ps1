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
if ([SeaPilotDriveBridge]::ConnectionPort(65535, 1) -ne 50170 -or [SeaPilotDriveBridge]::ConnectionPort(65535, 2) -ne 51189) { throw 'Native port discovery differs from the browser.' }
# Hold every bindable candidate to reproduce exhaustion without changing Windows
# reservations, firewall rules, services or any installed launcher configuration.
$blockedListeners = @()
$blockedStart = Get-Random -Minimum 49152 -Maximum 65536
try {
    for ($candidate = 0; $candidate -lt 16; $candidate++) {
        $blocked = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, [SeaPilotDriveBridge]::ConnectionPort($blockedStart, $candidate))
        $blocked.ExclusiveAddressUse = $true
        try { $blocked.Start(); $blockedListeners += $blocked } catch [Net.Sockets.SocketException] { $blocked.Stop() }
    }
    $denied = $false
    try { $unexpected = [SeaPilotDriveBridge]::StartListener($blockedStart); $unexpected.Stop() }
    catch [IO.IOException] { $denied = $_.Exception.Message -match 'dossier Drive reste configure' }
    if (!$denied) { throw 'Blocked ports did not return an actionable error.' }
} finally { foreach ($blocked in $blockedListeners) { $blocked.Stop() } }
# Exercise actual excluded ports on PCs that have them (including the affected PC).
$excluded = netsh interface ipv4 show excludedportrange protocol=tcp
foreach ($line in $excluded) {
    if ($line -match '^\s+(\d+)\s+(\d+)') {
        $reservedPort = [int]$Matches[1]
        if ($reservedPort -lt 49152 -or $reservedPort -gt 65535) { continue }
        $probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $reservedPort)
        try { $probe.Start(); $probe.Stop(); continue } catch [Net.Sockets.SocketException] { $probe.Stop() }
        $fallback = [SeaPilotDriveBridge]::StartListener($reservedPort)
        try { if ($fallback.LocalEndpoint.Port -eq $reservedPort) { throw 'Reserved port was not skipped.' } }
        finally { $fallback.Stop() }
        Write-Output "PASS: Windows-reserved port $reservedPort skipped automatically."
        break
    }
}
Write-Output 'PASS: bounded port discovery, wraparound and fully blocked ports.'
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
[SeaPilotDrive]::EnsureModuleDirectories($moduleRoot)
foreach ($folder in @('Procedures', 'Procedures PDF', 'Sanctions Disciplinaires', 'Produits Chimiques')) {
    if (!(Test-Path -LiteralPath (Join-Path $moduleRoot $folder) -PathType Container)) { throw "Module folder was not created: $folder" }
}
$preserved = Join-Path $moduleRoot 'Procedures/existing.docx'
[IO.File]::WriteAllText($preserved, 'Preserved source')
[SeaPilotDrive]::EnsureModuleDirectories($moduleRoot)
if ([IO.File]::ReadAllText($preserved) -ne 'Preserved source') { throw 'Folder initialization changed an existing document.' }
Write-Output 'PASS: every module folder created automatically, repeat initialization preserves files.'
$disciplinaryRoot = [SeaPilotDriveBridge]::EnsureDirectory($moduleRoot, 'Sanctions Disciplinaires')
$personFolder = [SeaPilotDriveBridge]::EnsurePersonFolder($disciplinaryRoot, 2, 41, 'Camille EXEMPLE')
if ($personFolder -ne 'Camille EXEMPLE - c2-p41') { throw 'Collaborator folder is not canonical.' }
if ([SeaPilotDriveBridge]::EnsurePersonFolder($disciplinaryRoot, 2, 41, 'Camille NOM MODIFIE') -ne $personFolder) { throw 'Renaming a collaborator created a duplicate folder.' }
$relative = "$personFolder/2026-09-15/courrier.docx"
[SeaPilotDriveBridge]::WriteFile($disciplinaryRoot, $relative, [Text.Encoding]::UTF8.GetBytes('native write fixture'))
if ([IO.File]::ReadAllText((Join-Path $disciplinaryRoot $relative)) -ne 'native write fixture') { throw 'Native write verification failed.' }
$pdfBytes = [Text.Encoding]::ASCII.GetBytes("%PDF-1.4`n% SeaPilot binary attachment fixture`n%%EOF")
$pdfRelative = "$personFolder/2026-09-16/piece.pdf"
[SeaPilotDriveBridge]::WriteFile($disciplinaryRoot, $pdfRelative, $pdfBytes)
if ([Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $disciplinaryRoot $pdfRelative))) -ne [Convert]::ToBase64String($pdfBytes)) { throw 'PDF attachment bytes changed during native writing.' }
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

$chemicalProduct = [guid]::NewGuid().ToString()
$chemicalAttachment = [guid]::NewGuid().ToString()
$chemicalFolder = "TEST - c1-v1/$chemicalProduct"
$chemicalPath = "$chemicalFolder/$chemicalAttachment-fds.pdf"
$chemicalScope = New-Object 'System.Collections.Generic.Dictionary[string,object]'
$chemicalScope['directory'] = 'Produits Chimiques'
$chemicalScope['folder'] = $chemicalFolder
Add-Type -ReferencedAssemblies System.Web.Extensions -TypeDefinition @'
public sealed class ChemicalScopeFixture {
    public System.Collections.Generic.Dictionary<string,object> Scope;
    public string Product;
    public System.Func<string,string,object> Remote;
    public ChemicalScopeFixture() { Remote = Get; }
    object Get(string resource, string body) {
        var args = new System.Web.Script.Serialization.JavaScriptSerializer().Deserialize<System.Collections.Generic.Dictionary<string,object>>(body);
        if (resource != "rpc/chemical_drive_scope" || (string)args["target_product"] != Product) throw new System.Exception("Wrong product authorization.");
        return Scope;
    }
}
'@
$scopeFixture = New-Object ChemicalScopeFixture
$scopeFixture.Scope = $chemicalScope
$scopeFixture.Product = $chemicalProduct
$chemicalRemote = $scopeFixture.Remote
$chemicalRequest = New-Object 'System.Collections.Generic.Dictionary[string,object]'
$chemicalRequest['action'] = 'write'
$chemicalRequest['productId'] = $chemicalProduct
$chemicalRequest['path'] = $chemicalPath
$chemicalRequest['base64'] = [Convert]::ToBase64String($pdfBytes)
$receipt = [SeaPilotDriveBridge]::ExecuteChemical($moduleRoot, $chemicalRequest, $chemicalRemote)
if ($receipt.path -ne $chemicalPath -or $receipt.bytes -ne $pdfBytes.Length) { throw 'Chemical write receipt mismatch.' }
$chemicalScope['path'] = $chemicalPath
$chemicalScope['bytes'] = $pdfBytes.Length
$hash = [Security.Cryptography.SHA256]::Create()
try { $chemicalScope['sha256'] = ([BitConverter]::ToString($hash.ComputeHash($pdfBytes))).Replace('-', '').ToLowerInvariant() } finally { $hash.Dispose() }
$chemicalRequest['action'] = 'read'
$chemicalRequest['attachmentId'] = $chemicalAttachment
$receipt = [SeaPilotDriveBridge]::ExecuteChemical($moduleRoot, $chemicalRequest, $chemicalRemote)
if ($receipt.base64 -ne [Convert]::ToBase64String($pdfBytes)) { throw 'Chemical read bytes mismatch.' }
function Assert-ChemicalRejected([scriptblock]$operation) {
    $denied = $false
    try { & $operation | Out-Null } catch { $denied = $true }
    if (!$denied) { throw 'Unauthorized or corrupt chemical file accepted.' }
}
$chemicalRequest['path'] = "$chemicalFolder/other.pdf"
Assert-ChemicalRejected { [SeaPilotDriveBridge]::ExecuteChemical($moduleRoot, $chemicalRequest, $chemicalRemote) }
$chemicalRequest['path'] = "OTHER/$chemicalProduct/other.pdf"
Assert-ChemicalRejected { [SeaPilotDriveBridge]::ExecuteChemical($moduleRoot, $chemicalRequest, $chemicalRemote) }
$chemicalRequest['path'] = $chemicalPath
$chemicalRequest.Remove('attachmentId') | Out-Null
Assert-ChemicalRejected { [SeaPilotDriveBridge]::ExecuteChemical($moduleRoot, $chemicalRequest, $chemicalRemote) }
$chemicalRequest['attachmentId'] = $chemicalAttachment
$chemicalScope['sha256'] = ('0' * 64)
Assert-ChemicalRejected { [SeaPilotDriveBridge]::ExecuteChemical($moduleRoot, $chemicalRequest, $chemicalRemote) }
$chemicalScope['bytes'] = $pdfBytes.Length + 1
Assert-ChemicalRejected { [SeaPilotDriveBridge]::ExecuteChemical($moduleRoot, $chemicalRequest, $chemicalRemote) }
$chemicalScope['directory'] = 'Sanctions Disciplinaires'
Assert-ChemicalRejected { [SeaPilotDriveBridge]::ExecuteChemical($moduleRoot, $chemicalRequest, $chemicalRemote) }
$chemicalRoot = Join-Path $moduleRoot 'Produits Chimiques'
New-Item -ItemType Junction -Path (Join-Path $chemicalRoot 'outside') -Value $outsideRoot | Out-Null
Assert-ChemicalRejected { [SeaPilotDriveBridge]::ReadChemicalFile($chemicalRoot, 'outside/outside.docx', ('a' * 64), 4) }
$chemicalScope['directory'] = 'Produits Chimiques'
$chemicalRequest['action'] = 'write'
Assert-ChemicalRejected { [SeaPilotDriveBridge]::ExecuteChemical($moduleRoot, $chemicalRequest, $chemicalRemote) }
$chemicalRequest['path'] = "$chemicalFolder/run.exe"
Assert-ChemicalRejected { [SeaPilotDriveBridge]::ExecuteChemical($moduleRoot, $chemicalRequest, $chemicalRemote) }
Write-Output 'PASS: chemical Drive write/read, exact registered path, attachment id, module scope, SHA-256, size, junction and overwrite protections.'

# Exercise procedure authorization and filesystem behavior without Office in CI.
Add-Type -ReferencedAssemblies System.Web.Extensions -TypeDefinition @'
public sealed class ProcedureScopeFixture {
 public System.Collections.Generic.Dictionary<string,object> Scope = new System.Collections.Generic.Dictionary<string,object>();
 public bool Deny; public string Opened; public string Converted; public byte[] Pdf; public string Action; public long Procedure; public long Publication;
 public System.Func<string,string,object> Remote; public System.Func<string,byte[]> Export; public System.Action<string> Open;
 public ProcedureScopeFixture() { Remote=Get; Export=Convert; Open=Show; }
 object Get(string resource,string body) {
  if(Deny) throw new System.UnauthorizedAccessException();
  var args=new System.Web.Script.Serialization.JavaScriptSerializer().Deserialize<System.Collections.Generic.Dictionary<string,object>>(body);
  if(resource!="rpc/procedure_drive_scope" || (string)args["target_action"]!=Action || System.Convert.ToInt64(args["target_procedure"])!=Procedure || System.Convert.ToInt64(args["target_publication"])!=Publication) throw new System.Exception("Wrong procedure authorization");
  return Scope;
 }
 byte[] Convert(string path) { Converted=path; return Pdf; }
 void Show(string path) { Opened=path; }
}
'@
$procedureFixture = New-Object ProcedureScopeFixture
$procedureFixture.Scope['directory'] = 'Procedures'
$procedureFixture.Pdf = $pdfBytes
$procedureFixture.Action = 'write'
$request = New-Object 'System.Collections.Generic.Dictionary[string,object]'
$request['action'] = 'write'
$request['path'] = 'URG 01 A - Exercice.docx'
$request['base64'] = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes('Word source'))
$sourceReceipt = [SeaPilotProcedureFiles]::Execute($moduleRoot,$request,$procedureFixture.Remote,$procedureFixture.Export,$procedureFixture.Open)
if ($sourceReceipt.path -ne $request['path'] -or $sourceReceipt.bytes -ne 11) { throw 'Wrong source receipt' }
[SeaPilotProcedureFiles]::Execute($moduleRoot,$request,$procedureFixture.Remote,$procedureFixture.Export,$procedureFixture.Open) | Out-Null
$request['base64'] = [Convert]::ToBase64String([byte[]](1,2,3))
Assert-ChemicalRejected { [SeaPilotProcedureFiles]::Execute($moduleRoot,$request,$procedureFixture.Remote,$procedureFixture.Export,$procedureFixture.Open) }
$procedureFixture.Deny = $true
$request['path'] = 'denied.docx'
Assert-ChemicalRejected { [SeaPilotProcedureFiles]::Execute($moduleRoot,$request,$procedureFixture.Remote,$procedureFixture.Export,$procedureFixture.Open) }
if (Test-Path (Join-Path $moduleRoot 'Procedures/denied.docx')) { throw 'Denied request created a file' }
$procedureFixture.Deny = $false
$procedureFixture.Action = 'open'; $request['action'] = 'open'; $request['procedureId'] = 41; $procedureFixture.Procedure = 41
$procedureFixture.Scope['path'] = $sourceReceipt.path
$request['path'] = '../untrusted.docx'
[SeaPilotProcedureFiles]::Execute($moduleRoot,$request,$procedureFixture.Remote,$procedureFixture.Export,$procedureFixture.Open) | Out-Null
if ($procedureFixture.Opened -ne (Join-Path $moduleRoot ('Procedures/' + $sourceReceipt.path))) { throw 'Open used an untrusted client path' }
$procedureFixture.Action = 'publish'; $request['action'] = 'publish'
$procedureFixture.Scope['pdfName'] = 'URG 01 A - Exercice.pdf'
$pdfReceipt = [SeaPilotProcedureFiles]::Execute($moduleRoot,$request,$procedureFixture.Remote,$procedureFixture.Export,$procedureFixture.Open)
if ($procedureFixture.Converted -ne $procedureFixture.Opened -or $pdfReceipt.sha256 -ne [SeaPilotProcedureFiles]::Hash($pdfBytes)) { throw 'Publication source or hash mismatch' }
$procedureFixture.Converted = $null
$procedureFixture.Pdf = [Text.Encoding]::ASCII.GetBytes('%PDF-1.4 Different export timestamp')
$retryReceipt = [SeaPilotProcedureFiles]::Execute($moduleRoot,$request,$procedureFixture.Remote,$procedureFixture.Export,$procedureFixture.Open)
if ($procedureFixture.Converted -or $retryReceipt.sha256 -ne $pdfReceipt.sha256) { throw 'Publication retry re-exported an unchanged source' }
$procedureFixture.Scope['directory'] = 'Procedures PDF'; $procedureFixture.Scope['path'] = $pdfReceipt.path
$procedureFixture.Scope['sha256'] = $pdfReceipt.sha256; $procedureFixture.Scope['bytes'] = $pdfReceipt.bytes
$procedureFixture.Action = 'read'; $request['action'] = 'read'; $request['procedureId'] = 0; $procedureFixture.Procedure = 0
$request['publicationId'] = 51; $procedureFixture.Publication = 51
$readReceipt = [SeaPilotProcedureFiles]::Execute($moduleRoot,$request,$procedureFixture.Remote,$procedureFixture.Export,$procedureFixture.Open)
if ($readReceipt.base64 -ne [Convert]::ToBase64String($pdfBytes)) { throw 'Published PDF bytes changed' }
$procedureFixture.Scope['sha256'] = ('0' * 64)
Assert-ChemicalRejected { [SeaPilotProcedureFiles]::Execute($moduleRoot,$request,$procedureFixture.Remote,$procedureFixture.Export,$procedureFixture.Open) }
$procedureFixture.Action = 'write'; $request['action'] = 'write'
Assert-ChemicalRejected { [SeaPilotProcedureFiles]::Execute($moduleRoot,$request,$procedureFixture.Remote,$procedureFixture.Export,$procedureFixture.Open) }
$procedureRoot = Join-Path $moduleRoot 'Procedures'
foreach ($unsafe in @('../escape.docx','NUL.docx','macro.docm','script.exe','folder/new.docx')) {
 Assert-ChemicalRejected { [SeaPilotProcedureFiles]::Write($procedureRoot,$unsafe,[byte[]](1,2,3)) }
}
New-Item -ItemType Junction -Path (Join-Path $procedureRoot 'linked') -Value $outsideRoot | Out-Null
Assert-ChemicalRejected { [SeaPilotProcedureFiles]::Read($procedureRoot,'linked/outside.docx') }
Write-Output 'PASS: procedure create/retry, no overwrite, exact RPC source, PDF receipt, read-only publication, integrity, traversal and junction rejection.'

$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$testExecutable = Join-Path $testRoot 'SeaPilotDriveTest.exe'
& $compiler /nologo /target:winexe /reference:System.Windows.Forms.dll /reference:System.Web.Extensions.dll "/out:$testExecutable" (Join-Path $PSScriptRoot 'SeaPilotDrive.cs') (Join-Path $PSScriptRoot 'SeaPilotDriveBridge.cs')
if ($LASTEXITCODE -ne 0) { throw 'Launcher compile failed.' }
$blocker = [SeaPilotDriveBridge]::StartListener((Get-Random -Minimum 49152 -Maximum 65536))
$firstPort = $blocker.LocalEndpoint.Port
$fallbackProbe = [SeaPilotDriveBridge]::StartListener($firstPort)
$port = $fallbackProbe.LocalEndpoint.Port
$fallbackProbe.Stop()
if ($port -eq $firstPort) { throw 'Occupied port was not skipped.' }
$nonce = ([guid]::NewGuid()).ToString('N')
$nativeProcess = Start-Process -FilePath $testExecutable -ArgumentList "seapilot-drive://connect/$firstPort/$nonce" -WindowStyle Hidden -PassThru
try {
    $endpoint = "http://127.0.0.1:$port/$nonce"
    $allowedHeaders = @{ Origin = 'http://localhost:5178' }
    $ready = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        try { $health = Invoke-RestMethod -Uri "$endpoint/health" -Headers $allowedHeaders -TimeoutSec 2; $ready = $true; break } catch { $healthError = $_.Exception.Message; Start-Sleep -Milliseconds 150 }
    }
    if (!$ready -or $health.version -ne '2.3.0' -or $health.nonce -ne $nonce) { throw "Native bridge failed to start (process exited: $($nativeProcess.HasExited)): $healthError" }
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
        $nextProbe = [SeaPilotDriveBridge]::StartListener((Get-Random -Minimum 49152 -Maximum 65536))
        $nextPort = $nextProbe.LocalEndpoint.Port
        $nextProbe.Stop()
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
            if ((Invoke-RestMethod -Uri $nextEndpoint -Headers $allowedHeaders -TimeoutSec 2).version -ne '2.3.0') { throw 'Update interrupted the running launcher.' }
            $invalidSource = Join-Path $testRoot 'invalid.cs'
            Set-Content -LiteralPath $invalidSource -Value 'This is an intentionally invalid compiler fixture'
            $failed = $false
            try { Install-SeaPilotDriveBinary -InstallFolder $installTestFolder -Compiler $compiler -Sources @($invalidSource) | Out-Null } catch { $failed = $true }
            if (!$failed -or !(Test-Path -LiteralPath $replacement)) { throw 'Failed compilation damaged the installed launcher.' }
            if ((Get-ChildItem -LiteralPath $installTestFolder -Filter '*.exe').Count -ne 3) { throw 'Failed compilation left an incomplete executable.' }
            Write-Output 'PASS: locked legacy executable, repeated installation while launcher runs, uninterrupted session and compiler failure recovery.'
        } finally { Stop-Process -Id $nextProcess.Id -ErrorAction SilentlyContinue }
    } finally { $legacyLock.Dispose() }
} finally { Stop-Process -Id $nativeProcess.Id -ErrorAction SilentlyContinue; $blocker.Stop() }
# The deliberately invalid compiler fixture is checked above. Report the test
# outcome rather than its expected native exit code to the GitHub Actions shell.
exit 0
