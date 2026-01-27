#!/usr/bin/env pwsh
# PowerShell script to build and push WireIndex Docker image

param(
    [string]$Tag = "latest",
    [switch]$NoPush,
    [switch]$NoCache
)

$ErrorActionPreference = "Stop"

Write-Host "🚀 Building WireIndex Docker Image..." -ForegroundColor Cyan
Write-Host ""

# Build arguments
$buildArgs = @("build", "-t", "arxknight/wireindex:$Tag", ".")
if ($NoCache) {
    $buildArgs += "--no-cache"
}

Write-Host "📦 Building image: arxknight/wireindex:$Tag" -ForegroundColor Green
docker @buildArgs

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Build completed successfully!" -ForegroundColor Green
Write-Host ""

if (-not $NoPush) {
    Write-Host "📤 Pushing image to registry..." -ForegroundColor Cyan
    docker push "arxknight/wireindex:$Tag"
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Push failed!" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "✅ Push completed successfully!" -ForegroundColor Green
} else {
    Write-Host "ℹ️  Skipping push (use without -NoPush to push)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🎉 Done! You can now restart your container with:" -ForegroundColor Cyan
Write-Host "   docker-compose down && docker-compose up -d" -ForegroundColor White
