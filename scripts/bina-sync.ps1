param(
  [string]$Endpoint = "https://YOUR-GESTELIT-SERVICE.onrender.com/api/bina/sync",
  [string]$SyncKey = "REPLACE_WITH_BINA_SYNC_KEY",
  [string]$SqlServer = "127.0.0.1,30030",
  [string]$Database = "BinaW18",
  [string]$SqlUser = "readonly",
  [string]$SqlPassword = "REPLACE_WITH_SQL_PASSWORD",
  [int]$MaxRecentOrders = 2000,
  [int]$BatchSize = 400
)

$ErrorActionPreference = "Stop"

$BaseDir = "C:\bina-sync"
$LogFile = Join-Path $BaseDir "bina-sync.log"

New-Item -ItemType Directory -Force -Path $BaseDir | Out-Null

function Write-Log {
  param([string]$Message)
  $line = "$(Get-Date -Format o) $Message"
  Add-Content -Path $LogFile -Value $line
  Write-Host $line
}

function Invoke-BinaQuery {
  param([string]$Query)

  $connectionString = "Server=$SqlServer;Database=$Database;User ID=$SqlUser;Password=$SqlPassword;TrustServerCertificate=True;Encrypt=False;Connection Timeout=30;"
  $connection = New-Object System.Data.SqlClient.SqlConnection $connectionString
  $command = $connection.CreateCommand()
  $command.CommandText = $Query
  $command.CommandTimeout = 120
  $adapter = New-Object System.Data.SqlClient.SqlDataAdapter $command
  $table = New-Object System.Data.DataTable

  try {
    [void]$adapter.Fill($table)
    return $table
  }
  finally {
    $connection.Dispose()
  }
}

function Convert-DataRow {
  param([System.Data.DataRow]$Row)

  $data = [ordered]@{}
  foreach ($column in $Row.Table.Columns) {
    $value = $Row[$column.ColumnName]
    if ($value -is [DBNull]) {
      $data[$column.ColumnName] = $null
    }
    elseif ($value -is [DateTime]) {
      $data[$column.ColumnName] = $value.ToString("o")
    }
    else {
      $data[$column.ColumnName] = $value
    }
  }

  return $data
}

function Get-RowId {
  param(
    [System.Collections.IDictionary]$Data,
    [string[]]$KeyColumns
  )

  $parts = @()
  foreach ($column in $KeyColumns) {
    if (-not $Data.Contains($column) -or $null -eq $Data[$column]) {
      throw "Missing key column '$column'"
    }
    $parts += [string]$Data[$column]
  }

  return ($parts -join ":")
}

function Convert-BinaRows {
  param(
    [System.Data.DataTable]$Rows,
    [string[]]$KeyColumns,
    [string]$SourceUpdatedColumn = ""
  )

  $converted = @()
  foreach ($row in $Rows.Rows) {
    $data = Convert-DataRow -Row $row
    $syncRow = [ordered]@{
      bina_id = Get-RowId -Data $data -KeyColumns $KeyColumns
      data = $data
      source_updated_at = $null
    }

    if ($SourceUpdatedColumn -and $data.Contains($SourceUpdatedColumn) -and $null -ne $data[$SourceUpdatedColumn]) {
      $syncRow.source_updated_at = $data[$SourceUpdatedColumn]
    }

    $converted += $syncRow
  }

  return $converted
}

function Send-BinaRows {
  param(
    [string]$TableName,
    [array]$Rows
  )

  if ($Rows.Count -eq 0) {
    Write-Log "$TableName: no rows"
    return
  }

  for ($offset = 0; $offset -lt $Rows.Count; $offset += $BatchSize) {
    $count = [Math]::Min($BatchSize, $Rows.Count - $offset)
    $batch = @($Rows[$offset..($offset + $count - 1)])
    $payload = @{
      synced_at = (Get-Date).ToUniversalTime().ToString("o")
      tables = @{
        $TableName = $batch
      }
    } | ConvertTo-Json -Depth 100 -Compress

    $headers = @{ "X-Sync-Key" = $SyncKey }
    $response = Invoke-RestMethod -Uri $Endpoint -Method Post -Headers $headers -Body $payload -ContentType "application/json" -TimeoutSec 180

    if (-not $response.ok) {
      throw "$TableName batch at offset $offset failed: $($response | ConvertTo-Json -Depth 20)"
    }

    Write-Log "$TableName: sent $count rows at offset $offset"
  }
}

try {
  Write-Log "BINA sync starting"

  $rashiQuery = @"
SELECT TOP ($MaxRecentOrders) *
FROM dbo.DFHazmRashi
ORDER BY MisparDFHazmana DESC;
"@
  $rashiRows = Invoke-BinaQuery -Query $rashiQuery
  $rashiSyncRows = Convert-BinaRows -Rows $rashiRows -KeyColumns @("MisparDFHazmana") -SourceUpdatedColumn "TarikRishum"
  Send-BinaRows -TableName "DFHazmRashi" -Rows $rashiSyncRows

  $orderIds = @()
  foreach ($row in $rashiRows.Rows) {
    if ($row["MisparDFHazmana"] -isnot [DBNull]) {
      $orderIds += [int]$row["MisparDFHazmana"]
    }
  }

  if ($orderIds.Count -eq 0) {
    throw "DFHazmRashi returned no order IDs"
  }

  $stationTables = @(
    "DFHazmMontage",
    "DFHazmNigrar",
    "DFHazmGimur",
    "DFHazmGrafika",
    "DFHazmKirkia",
    "DFHazmKedam",
    "DFHazmGlyonot"
  )

  $idList = ($orderIds | Sort-Object -Unique) -join ","
  foreach ($tableName in $stationTables) {
    $query = "SELECT * FROM dbo.$tableName WHERE MisparRashi IN ($idList);"
    $rows = Invoke-BinaQuery -Query $query
    $keyColumns = @("MisparRashi", "MisparAvoda")
    if ($tableName -eq "DFHazmNigrar") {
      $keyColumns = @("RecordId")
    }
    $syncRows = Convert-BinaRows -Rows $rows -KeyColumns $keyColumns
    Send-BinaRows -TableName $tableName -Rows $syncRows
  }

  $mismahimQuery = @"
SELECT TOP ($MaxRecentOrders) *
FROM dbo.Mismahim
ORDER BY RecordId DESC;
"@
  $mismahimRows = Invoke-BinaQuery -Query $mismahimQuery
  $mismahimSyncRows = Convert-BinaRows -Rows $mismahimRows -KeyColumns @("RecordId") -SourceUpdatedColumn "Tarik"
  Send-BinaRows -TableName "Mismahim" -Rows $mismahimSyncRows

  $inventoryTables = @(
    @{ Name = "DFMlay"; Key = @("MisparRashi", "MisparAvoda") },
    @{ Name = "TnuotMlay"; Key = @("MisparTnua") }
  )

  foreach ($table in $inventoryTables) {
    try {
      $query = "SELECT TOP ($MaxRecentOrders) * FROM dbo.$($table.Name) ORDER BY 1 DESC;"
      $rows = Invoke-BinaQuery -Query $query
      $syncRows = Convert-BinaRows -Rows $rows -KeyColumns $table.Key
      Send-BinaRows -TableName $table.Name -Rows $syncRows
    }
    catch {
      Write-Log "WARN: skipped $($table.Name): $($_.Exception.Message)"
    }
  }

  Write-Log "BINA sync completed"
}
catch {
  Write-Log "ERROR: $($_.Exception.Message)"
  exit 1
}
