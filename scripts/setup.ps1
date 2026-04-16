<#
.SYNOPSIS
VoteChain Local Development Setup for Windows PowerShell
#>

$ErrorActionPreference = "Stop"

Write-Host "--------------------------------------------------" -ForegroundColor Cyan
Write-Host "  VoteChain Local Development Setup (Windows)" -ForegroundColor Cyan
Write-Host "--------------------------------------------------" -ForegroundColor Cyan

# 1. Check prerequisites
Write-Host "`n[1/5] Checking prerequisites..." -ForegroundColor Yellow

function Check-Command($cmd, $installMsg) {
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Host "X $cmd not found. $installMsg" -ForegroundColor Red
        exit 1
    }
}

Check-Command "docker-compose" "Install Docker Desktop for Windows."
Check-Command "cargo" "Install Rust from https://rustup.rs/"
Check-Command "node" "Install Node.js from https://nodejs.org/"

$dockerVer = (docker --version)
$rustVer = (rustc --version)
$nodeVer = (node --version)

Write-Host "OK Docker: $dockerVer" -ForegroundColor Green
Write-Host "OK Rust:   $rustVer" -ForegroundColor Green
Write-Host "OK Node:   $nodeVer" -ForegroundColor Green

# 2. Setup environment
Write-Host "`n[2/5] Setting up environment..." -ForegroundColor Yellow

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    
    # Auto-generate JWT secret (32 random bytes -> 64 hex chars)
    $bytes = New-Object Byte[] 32
    $rnd = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rnd.GetBytes($bytes)
    $jwtSecret = [BitConverter]::ToString($bytes) -replace '-'
    $jwtSecret = $jwtSecret.ToLower()
    
    $envContent = Get-Content ".env"
    $envContent = $envContent -replace 'CHANGE_ME_GENERATE_WITH_OPENSSL_RAND_HEX_32', $jwtSecret
    Set-Content ".env" -Value $envContent -Encoding UTF8
    
    Write-Host "OK .env created with auto-generated JWT_SECRET" -ForegroundColor Green
} else {
    Write-Host "INFO .env already exists skipping" -ForegroundColor Cyan
}

# 3. Start infrastructure
Write-Host "`n[3/5] Starting PostgreSQL and Redis..." -ForegroundColor Yellow

docker-compose up -d postgres redis

Write-Host "Waiting for PostgreSQL to be ready..." -ForegroundColor Cyan
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    $result = docker-compose exec -T postgres pg_isready -U postgres 2>$null
    if ($LASTEXITCODE -eq 0) {
        $ready = $true
        break
    }
    Start-Sleep -Seconds 2
}

if ($ready) {
    Write-Host "OK PostgreSQL ready" -ForegroundColor Green
} else {
    Write-Host "WARN PostgreSQL may not be fully ready, continuing anyway." -ForegroundColor Yellow
}

# 4. Install frontend dependencies
Write-Host "`n[4/5] Installing Angular dependencies..." -ForegroundColor Yellow
Set-Location frontend
npm install --silent
Set-Location ..
Write-Host "OK Frontend dependencies installed" -ForegroundColor Green

# 5. Summary
Write-Host "`n[5/5] Setup complete!" -ForegroundColor Yellow
Write-Host "`n--------------------------------------------------" -ForegroundColor Green
Write-Host "  Next steps:" -ForegroundColor Green
Write-Host "--------------------------------------------------" -ForegroundColor Green
Write-Host ""
Write-Host "  To start the full stack, run:"
Write-Host "    docker-compose up -d"
Write-Host ""
Write-Host "  Then seed the database:"
Write-Host "    docker-compose exec -T postgres psql -U postgres -d voting_db < database/seeds/001_seed_data.sql"
Write-Host ""
Write-Host "  Open http://localhost to view the app."
Write-Host ""
