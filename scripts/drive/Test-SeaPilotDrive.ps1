$ErrorActionPreference = 'Stop'
Add-Type -Path (Join-Path $PSScriptRoot 'SeaPilotDrive.cs') -ReferencedAssemblies System.Windows.Forms
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
