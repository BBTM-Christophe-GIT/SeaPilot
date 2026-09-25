param(
    [Parameter(Mandatory=$true)][string]$DriveRoot,
    [Parameter(Mandatory=$true)][string]$WorkDirectory,
    [string]$ProjectRef = 'szlvyrrmvdvhzixilymh',
    [string]$SharePointFiles,
    [switch]$Activate
)
# Run locally with an authorized Azure CLI session and Supabase CLI access.
# All source files remain untouched. Activation requires cloud-verified.json.
$ErrorActionPreference = 'Stop'
Add-Type -Path @((Join-Path $PSScriptRoot 'SeaPilotDrive.cs'), (Join-Path $PSScriptRoot 'SeaPilotDriveBridge.cs')) -ReferencedAssemblies System.Windows.Forms,System.Web.Extensions
$baseRoot = [SeaPilotDrive]::ValidateRoot($DriveRoot)
$root = [SeaPilotDriveBridge]::EnsureDirectory($baseRoot, 'Ressources Humaines')
$null = New-Item -ItemType Directory -Path $WorkDirectory -Force
$work = (Resolve-Path -LiteralPath $WorkDirectory).Path
$api = "https://$ProjectRef.supabase.co"
$keys = supabase projects api-keys --project-ref $ProjectRef -o json | ConvertFrom-Json
$key = ($keys | Where-Object name -eq 'service_role').api_key
if (!$key) { throw 'Supabase service credential unavailable.' }
$headers = @{apikey=$key; Authorization="Bearer $key"}
$rows = Invoke-RestMethod -Uri "$api/rest/v1/hr_documents?select=*&order=id" -Headers $headers
$people = Invoke-RestMethod -Uri "$api/rest/v1/people?select=id,company_id,first_name,last_name,sharepoint_item_id&order=id" -Headers $headers
if (!$Activate) {
    $rows | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $work 'before.json') -Encoding utf8
    $token = az account get-access-token --resource-type ms-graph --output json | ConvertFrom-Json
    if (!$token.accessToken) { throw 'An authorized Microsoft Graph session is required.' }
    $graphHeaders = @{Authorization='Bearer '+$token.accessToken}
    $site = Invoke-RestMethod -Uri 'https://graph.microsoft.com/v1.0/sites/bbtm668.sharepoint.com:/sites/QHSE' -Headers $graphHeaders
    $drives = Invoke-RestMethod -Uri "https://graph.microsoft.com/v1.0/sites/$($site.id)/drives" -Headers $graphHeaders
    $drive = @($drives.value | Where-Object { $_.webUrl -like '*/Brevets%20et%20Visites%20Mdicales' })
    if ($drive.Count -ne 1) { throw 'The source HR library must be unique.' }
    $manifest = @()
    $failures = @()
    foreach ($row in $rows) {
        if ($row.drive_path) { continue }
        try {
        $person = @($people | Where-Object { $_.id -eq $row.person_id -and $_.company_id -eq $row.company_id })
        if ($person.Count -eq 1) {
            $folder = [SeaPilotDriveBridge]::EnsurePersonFolder($root, $row.company_id, $person[0].id, ($person[0].first_name+' '+$person[0].last_name.ToUpperInvariant()))
        } else {
            # Preserve an unresolved historic identity without assigning it to a different person.
            $identity = $row.person_sharepoint_item_id
            if (!$identity -or $identity -notmatch '^\d+$') { throw "Missing historic person identity for document $($row.id)." }
            $folder = [SeaPilotDriveBridge]::SafeName($row.person_name) + ' - c' + $row.company_id + '-sp' + $identity
        }
        $source = Join-Path $work ($row.id.ToString()+'.source')
        if ($row.storage_bucket -and $row.storage_path) {
            if ($row.storage_bucket -ne 'hr-documents') { throw 'Unexpected source bucket.' }
            $name = ($row.storage_path -split '/')[-1]
            $encoded = ($row.storage_path.Split('/') | ForEach-Object {[Uri]::EscapeDataString($_)}) -join '/'
            Invoke-WebRequest -UseBasicParsing -Uri "$api/storage/v1/object/authenticated/hr-documents/$encoded" -Headers $headers -OutFile $source
        } else {
            $url = [Uri]$row.file_url
            if ($url.Host -ne 'bbtm668.sharepoint.com') { throw 'Unexpected source hostname.' }
            $name = [Uri]::UnescapeDataString(($url.AbsolutePath -split '/')[-1])
            $item = Invoke-RestMethod -Uri ("https://graph.microsoft.com/v1.0/drives/"+$drive[0].id+"/root:/"+[Uri]::EscapeDataString($name)) -Headers $graphHeaders
            if ($SharePointFiles) {
                $localRoot = (Resolve-Path -LiteralPath $SharePointFiles).Path
                $local = Join-Path $localRoot ($row.id.ToString()+'.source')
                if (!(Test-Path -LiteralPath $local)) { $local = Join-Path $localRoot $name }
                if (!(Test-Path -LiteralPath $local -PathType Leaf)) { throw 'Source not in the supplied folder.' }
                [SeaPilotDrive]::CheckWithinRoot($localRoot,$local)
                Copy-Item -LiteralPath $local -Destination $source
            } else {
                Invoke-WebRequest -UseBasicParsing -Uri $item.'@microsoft.graph.downloadUrl' -OutFile $source
            }
            if ((Get-Item -LiteralPath $source).Length -ne $item.size) { throw "Source size mismatch: $($row.id)." }
        }
        $size = (Get-Item -LiteralPath $source).Length
        if ($size -le 0 -or $size -gt 25MB) { throw "Unsupported size for document $($row.id)." }
        $safeName = $name -replace '[<>:"/\\|?*\x00-\x1f]', '-'
        $path = $folder+'/'+$row.id+'-'+$safeName
        [SeaPilotDrive]::ValidateParts($path)
        $null = [SeaPilotDriveBridge]::EnsureDirectory($root, $folder)
        $destination = Join-Path $root $path
        $sha256 = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
        if (Test-Path -LiteralPath $destination) {
            [SeaPilotDrive]::CheckWithinRoot($root,$destination)
            if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant() -ne $sha256) { throw "Destination differs: $($row.id)." }
        } else { [SeaPilotDriveBridge]::WriteFile($root,$path,[IO.File]::ReadAllBytes($source)) }
        $manifest += [pscustomobject]@{id=$row.id;path=$path;bytes=$size;sha256=$sha256;md5=(Get-FileHash -LiteralPath $source -Algorithm MD5).Hash.ToLowerInvariant();sourceUpdatedAt=$row.updated_at;mimeType=$row.mime_type}
        $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $work 'manifest.json') -Encoding utf8
        if ($manifest.Count % 10 -eq 0) { Write-Output "Copied $($manifest.Count) HR documents." }
        } catch {
            # Keep URLs, credentials and personal details out of terminal logs.
            $failures += [pscustomobject]@{id=$row.id;status='source_unavailable'}
            $failures | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $work 'unavailable.json') -Encoding utf8
        }
    }
    Write-Output "Copied and locally verified $($manifest.Count) documents; $($failures.Count) sources unavailable. Database references unchanged."
    exit
}
$verified = @(Get-Content -LiteralPath (Join-Path $work 'cloud-verified.json') -Raw | ConvertFrom-Json)
$manifest = @(Get-Content -LiteralPath (Join-Path $work 'manifest.json') -Raw | ConvertFrom-Json)
if ($verified.Count -ne $manifest.Count) { throw 'Cloud verification is incomplete.' }
foreach ($entry in $manifest) {
    $match = @($verified | Where-Object {$_.id -eq $entry.id -and $_.path -ceq $entry.path -and $_.md5 -eq $entry.md5 -and $_.bytes -eq $entry.bytes -and $_.driveFileId})
    if ($match.Count -ne 1) { throw "Cloud verification missing for document $($entry.id)." }
    $current = @($rows | Where-Object id -eq $entry.id)[0]
    if ($current.drive_path -eq $entry.path) { continue }
    $extension = [IO.Path]::GetExtension($entry.path).ToLowerInvariant()
    $mime = if ($entry.mimeType) {$entry.mimeType} elseif ($extension -eq '.pdf') {'application/pdf'} elseif ($extension -eq '.png') {'image/png'} elseif ($extension -in '.jpg','.jpeg') {'image/jpeg'} else {'application/octet-stream'}
    $body = @{drive_path=$entry.path;drive_sha256=$entry.sha256;drive_file_id=$match[0].driveFileId;source_label='google_drive';file_size_bytes=$entry.bytes;mime_type=$mime} | ConvertTo-Json
    $updateHeaders = $headers.Clone(); $updateHeaders.Prefer='return=representation'
    $changed = Invoke-RestMethod -Method Patch -Uri ("$api/rest/v1/hr_documents?id=eq."+$entry.id+'&updated_at=eq.'+[Uri]::EscapeDataString($entry.sourceUpdatedAt)) -Headers $updateHeaders -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body))
    if (@($changed).Count -ne 1 -or @($changed)[0].drive_path -cne $entry.path) { throw "Document changed during migration: $($entry.id)." }
}
Write-Output "Activated $($manifest.Count) verified Drive references. Original sources preserved."
