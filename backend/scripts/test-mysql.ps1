Param(
  [switch]$KeepDb
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$compose = Join-Path $root 'docker-compose.test.yml'

Write-Host "Starting MySQL test container..." -ForegroundColor Cyan

# Use docker compose if available; fall back to docker-compose
$composeExe = $null
$composePrefixArgs = @()
try {
  docker compose version | Out-Null
  $composeExe = 'docker'
  $composePrefixArgs = @('compose')
} catch {
  $composeExe = 'docker-compose'
  $composePrefixArgs = @()
}

& $composeExe @composePrefixArgs -f $compose up -d mysql_test | Out-Null

function Wait-MySqlReady {
  Param(
    [int]$TimeoutSeconds = 150
  )

  $start = Get-Date
  $consecutiveReady = 0
  while ($true) {
    # mysqladmin ping returns 0 when the server is accepting connections.
    docker exec -e MYSQL_PWD=root cableindex-mysql-test mysqladmin ping -h localhost -uroot --silent 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
      $consecutiveReady++
      if ($consecutiveReady -ge 3) {
        return
      }
    } else {
      $consecutiveReady = 0
    }

    $elapsed = (Get-Date) - $start
    if ($elapsed.TotalSeconds -ge $TimeoutSeconds) {
      throw "Timed out waiting for MySQL to become ready (${TimeoutSeconds}s)"
    }
    Start-Sleep -Seconds 2
  }
}

Write-Host "Waiting for MySQL to be ready..." -ForegroundColor Cyan
Wait-MySqlReady -TimeoutSeconds 150

try {
  Write-Host "Running backend tests against MySQL on localhost:3307..." -ForegroundColor Cyan

  $env:MYSQL_HOST = '127.0.0.1'
  $env:MYSQL_PORT = '3307'
  $env:MYSQL_DATABASE = 'cableindex_test'
  $env:MYSQL_USER = 'cableindex'
  $env:MYSQL_PASSWORD = 'cableindex'
  $env:MYSQL_ADMIN_USER = 'root'
  $env:MYSQL_ADMIN_PASSWORD = 'root'
  $env:MYSQL_SSL = 'false'

  Push-Location (Join-Path $root 'backend')
  try {
    npm test
  } finally {
    Pop-Location
  }
} finally {
  if (-not $KeepDb) {
    Write-Host "Stopping MySQL test container..." -ForegroundColor Cyan
    & $composeExe @composePrefixArgs -f $compose down -v | Out-Null
  } else {
    Write-Host "Leaving MySQL test container running (KeepDb)." -ForegroundColor Yellow
  }
}
