param(
    [string]$Tag = "latest",
    [switch]$NoPush,
    [switch]$NoCache
)

$ErrorActionPreference = "Stop"

Set-Location -Path $PSScriptRoot

Write-Host "Building CableIndex Docker Image..." -ForegroundColor Cyan
Write-Host ""

$buildArgs = @("build", "-t", "arxknight/cableindex:$Tag")
if ($NoCache) {
    $buildArgs += "--no-cache"
}
$buildArgs += "."

Write-Host "Building image: arxknight/cableindex:$Tag" -ForegroundColor Green
docker @buildArgs

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "Build completed successfully!" -ForegroundColor Green
Write-Host ""

if (-not $NoPush) {
    Write-Host "Pushing image to registry..." -ForegroundColor Cyan
    docker push "arxknight/cableindex:$Tag"

    if ($LASTEXITCODE -ne 0) {
        Write-Host "Push failed!" -ForegroundColor Red
        exit 1
    }

    Write-Host "Push completed successfully!" -ForegroundColor Green
} else {
    Write-Host "Skipping push (use without -NoPush to push)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Done. Restart your container to pick up the new image." -ForegroundColor Cyan
Write-Host "Example:" -ForegroundColor Cyan
Write-Host "  docker compose pull; docker compose up -d" -ForegroundColor White
