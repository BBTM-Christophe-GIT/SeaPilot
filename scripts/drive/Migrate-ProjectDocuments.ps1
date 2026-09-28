param(
  [Parameter(Mandatory=$true)][string]$DriveRoot,
  [Parameter(Mandatory=$true)][string]$WorkDirectory,
  [string]$ProjectRef = 'szlvyrrmvdvhzixilymh',
  [string]$LegacySourceDirectory,
  [switch]$Activate
)
# PowerShell 7. Copy first, verify Google Drive cloud hashes, then activate routing.
# No original file or business row is changed or deleted. Never print credentials.
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -lt 7) { throw 'PowerShell 7 is required.' }
$baseRoot = (Resolve-Path -LiteralPath $DriveRoot).Path.TrimEnd('\')
if ([IO.Path]::GetFileName($baseRoot) -ne 'SeaPilot') { throw 'Select the synchronized SeaPilot root.' }
$null = New-Item -ItemType Directory -Path $WorkDirectory -Force
$work = (Resolve-Path -LiteralPath $WorkDirectory).Path
function ReadProjectJson($result) { if ($result -is [string]) { return ConvertFrom-Json -InputObject $result -AsHashtable }; return $result }
function SafeFolder([string]$relative) {
  if ($relative -match '(^|/)[.][.]?(/|$)|[\\:<>"|?*]' -or !$relative) { throw 'Unsafe relative path.' }
  $full = [IO.Path]::GetFullPath((Join-Path $baseRoot $relative))
  if (!$full.StartsWith($baseRoot+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Path outside Drive root.' }
  $cursor = $baseRoot
  foreach ($part in $relative.Split('/')) {
    $cursor = Join-Path $cursor $part
    $null = New-Item -ItemType Directory -Path $cursor -Force
    if ((Get-Item -LiteralPath $cursor).LinkType) { throw 'Linked directory refused.' }
  }
  return $full
}
$keys = supabase projects api-keys --project-ref $ProjectRef -o json | ConvertFrom-Json
$key = ($keys | Where-Object name -eq 'service_role').api_key
if (!$key) { throw 'Supabase CLI authentication required.' }
$api = "https://$ProjectRef.supabase.co"
$headers = @{apikey=$key;Authorization="Bearer $key"}
if ($Activate) {
  $manifest = Get-Content -LiteralPath (Join-Path $work 'drive-manifest.json') -Raw | ConvertFrom-Json -AsHashtable
  $verified = Get-Content -LiteralPath (Join-Path $work 'cloud-verified.json') -Raw | ConvertFrom-Json -AsHashtable
  if ($manifest.Count -ne $verified.Count) { throw 'Cloud verification incomplete.' }
  foreach ($entry in $manifest) {
    $match = @($verified | Where-Object { $_.path -ceq $entry.path -and $_.md5 -eq $entry.md5 -and $_.bytes -eq $entry.bytes -and $_.driveFileId })
    if ($match.Count -ne 1) { throw 'Missing verified cloud copy.' }
    $record = @{project_id=$entry.project_id;company_id=$entry.company_id;source_bucket=$entry.source_bucket;source_path=$entry.source_path;path=$entry.path;bytes=$entry.bytes;sha256=$entry.sha256;mime_type=$entry.mime_type;drive_file_id=$match[0].driveFileId}
    $body = ConvertTo-Json -InputObject $record
    $writeHeaders = $headers.Clone(); $writeHeaders.Prefer='resolution=ignore-duplicates,return=representation'
    $null = Invoke-RestMethod -Method Post -Uri "$api/rest/v1/project_drive_files?on_conflict=source_bucket,source_path" -Headers $writeHeaders -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body))
    $encoded = [Uri]::EscapeDataString($entry.source_path)
    $saved = ReadProjectJson (Invoke-RestMethod -Uri "$api/rest/v1/project_drive_files?source_bucket=eq.$($entry.source_bucket)&source_path=eq.$encoded" -Headers $headers)
    if ($saved.Count -ne 1 -or $saved[0].sha256 -ne $entry.sha256 -or $saved[0].path -cne $entry.path) { throw 'Routing read-back verification failed.' }
  }
  Write-Output "Activated $($manifest.Count) cloud-verified Drive routes; original rows and sources preserved."
  exit
}
$projects = ReadProjectJson (Invoke-RestMethod -Uri "$api/rest/v1/projects?select=id,company_id,project_code,title&order=id" -Headers $headers)
foreach ($project in $projects) {
  foreach ($category in @('Contrat','HSE','Facturation','Operations','Offres')) { $null = SafeFolder "Projet/Projet-$($project.id)/$category" }
}
$graph = az account get-access-token --resource-type ms-graph -o json | ConvertFrom-Json
if (!$graph.accessToken) { throw 'Authorized Microsoft Graph session required for legacy contracts.' }
$graphHeaders = @{Authorization='Bearer '+$graph.accessToken}
$manifest = @()
$failures = @()
foreach ($table in @('contract_documents','project_generated_documents','project_billing_documents')) {
  $rows = ReadProjectJson (Invoke-RestMethod -Uri "$api/rest/v1/${table}?select=*&order=id&limit=1000" -Headers $headers)
  if ($rows.Count -ge 1000) { throw 'Increase pagination before migrating this larger collection.' }
  foreach ($row in $rows) {
    if ($row.is_folder) { continue }
    try {
    $project = @($projects | Where-Object { $_.id -eq $row.project_id })
    if ($project.Count -ne 1) { throw "Unresolved project: $table / $($row.id)." }
    $bucket = if ($row.bucket_name) {$row.bucket_name} else {$row.storage_bucket}
    $sourcePath = if ($row.object_path) {$row.object_path} else {$row.storage_path}
    $source = Join-Path $work "$table-$($row.id).source"
    $name = if ($row.file_name) {$row.file_name} else {$row.title}
    if ($bucket -and $sourcePath) {
      if ($bucket -ne 'project-files') { throw 'Unexpected source bucket.' }
      $encoded = ($sourcePath.Split('/') | ForEach-Object {[Uri]::EscapeDataString($_)}) -join '/'
      Invoke-WebRequest -Uri "$api/storage/v1/object/authenticated/$bucket/$encoded" -Headers $headers -OutFile $source
    } else {
      $url = [Uri]$row.file_url
      if ($url.Host -ne 'bbtm668.sharepoint.com' -or !$row.sharepoint_drive_id) { throw 'Unresolved legacy source.' }
      $item = ReadProjectJson (Invoke-RestMethod -Uri ("https://graph.microsoft.com/v1.0/drives/"+$row.sharepoint_drive_id+"/root:/"+[Uri]::EscapeDataString($name)) -Headers $graphHeaders)
      $localSource = if ($LegacySourceDirectory) { Join-Path $LegacySourceDirectory ([IO.Path]::GetFileName($name)) } else { $null }
      if ($localSource -and (Test-Path -LiteralPath $localSource -PathType Leaf)) {
        [IO.File]::WriteAllBytes($source, [IO.File]::ReadAllBytes($localSource))
      } else { Invoke-WebRequest -Uri $item.'@microsoft.graph.downloadUrl' -OutFile $source }
      if ((Get-Item -LiteralPath $source).Length -ne $item.size) { throw 'Legacy download is incomplete.' }
      $bucket='sharepoint'; $sourcePath=$row.file_url
    }
    $size = (Get-Item -LiteralPath $source).Length
    if ($size -le 0 -or $size -gt 50MB) { throw 'Unsupported source size.' }
    $sha = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
    $expected = if ($row.storage_sha256) {$row.storage_sha256} else {$row.sha256}
    if ($expected -and $expected -ne $sha) { throw 'Original document hash mismatch.' }
    $category = if ($table -eq 'project_billing_documents') {'Facturation'} elseif ($row.document_type -eq 'operation_attachment') {'Operations'} elseif ($row.category_key -like 'hse*') {'HSE'} elseif ($row.document_type -eq 'offer') {'Offres'} else {'Contrat'}
    $safeName = ($name -replace '[<>:"/\\|?*\x00-\x1f]','-').TrimEnd('.',' ')
    $path = "Projet-$($row.project_id)/$category/$table-$($row.id)-$safeName"
    $folder = SafeFolder "Projet/Projet-$($row.project_id)/$category"
    $destination = Join-Path $folder "$table-$($row.id)-$safeName"
    if (Test-Path -LiteralPath $destination) {
      if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant() -ne $sha) { throw 'An existing destination differs; nothing overwritten.' }
    } else { [IO.File]::WriteAllBytes($destination, [IO.File]::ReadAllBytes($source)) }
    if ((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.ToLowerInvariant() -ne $sha) { throw 'Local copy verification failed.' }
    $mime = if ($row.mime_type) {$row.mime_type} elseif ($name -match '\.pdf$') {'application/pdf'} elseif ($name -match '\.docx$') {'application/vnd.openxmlformats-officedocument.wordprocessingml.document'} else {'application/octet-stream'}
    $manifest += @{table=$table;id=$row.id;project_id=$row.project_id;company_id=$row.company_id;source_bucket=$bucket;source_path=$sourcePath;path=$path;sha256=$sha;md5=(Get-FileHash -LiteralPath $source -Algorithm MD5).Hash.ToLowerInvariant();bytes=$size;mime_type=$mime}
    ConvertTo-Json -InputObject $manifest -Depth 8 | Set-Content -LiteralPath (Join-Path $work 'drive-manifest.json') -Encoding utf8
    } catch { $failures += @{table=$table;id=$row.id;status='source_or_copy_unavailable'} }
  }
  Write-Output "Copied and locally verified $table."
}
Write-Output "$($manifest.Count) files copied across $($projects.Count) project folders. Cloud verification is required before activation."


ConvertTo-Json -InputObject $failures | Set-Content -LiteralPath (Join-Path $work 'unavailable.json') -Encoding utf8
Write-Output "$($failures.Count) files require source access; no original link was changed."
