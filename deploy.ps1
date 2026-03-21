param(
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Parse-DotEnv([string]$path) {
  $map = @{}
  if (-not (Test-Path $path)) { return $map }
  foreach ($line in Get-Content $path) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
    $idx = $trimmed.IndexOf('=')
    if ($idx -lt 1) { continue }
    $key = $trimmed.Substring(0, $idx).Trim()
    $value = $trimmed.Substring($idx + 1)
    $map[$key] = $value
  }
  return $map
}

function Require-Command([string]$name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "Command not found: $name"
  }
}

Require-Command npx

# Токен: сперва meyram-admin/.cloudflare.env, иначе ../local-worker/.cloudflare.env
$envFile = Join-Path $root '.cloudflare.env'
$parentEnv = Join-Path (Split-Path $root -Parent) 'local-worker\.cloudflare.env'
if (-not (Test-Path $envFile) -and (Test-Path $parentEnv)) {
  $envFile = $parentEnv
  Write-Host "Using token from: $envFile" -ForegroundColor Cyan
}

$cfEnv = Parse-DotEnv $envFile
if ($cfEnv.ContainsKey('CLOUDFLARE_API_TOKEN') -and -not [string]::IsNullOrWhiteSpace($cfEnv['CLOUDFLARE_API_TOKEN'])) {
  $env:CLOUDFLARE_API_TOKEN = [string]$cfEnv['CLOUDFLARE_API_TOKEN']
}
if ($cfEnv.ContainsKey('CLOUDFLARE_ACCOUNT_ID') -and -not [string]::IsNullOrWhiteSpace($cfEnv['CLOUDFLARE_ACCOUNT_ID'])) {
  $env:CLOUDFLARE_ACCOUNT_ID = [string]$cfEnv['CLOUDFLARE_ACCOUNT_ID']
}

if (-not $env:CLOUDFLARE_API_TOKEN) {
  Write-Host "CLOUDFLARE_API_TOKEN not set. Create meyram-admin/.cloudflare.env or use local-worker/.cloudflare.env" -ForegroundColor Yellow
  Write-Host "Or run: npx wrangler login" -ForegroundColor Yellow
}

if (-not $SkipInstall) {
  if (-not (Test-Path (Join-Path $root 'node_modules\wrangler'))) {
    Write-Host "Installing wrangler..." -ForegroundColor Cyan
    npm install
  }
}

Write-Host "Deploying Meyram Admin to Cloudflare Pages..." -ForegroundColor Green
npx wrangler pages deploy . --project-name=meyram-admin

Write-Host "Done. Add custom domain admin.apolloai.biz in Cloudflare Dashboard -> Workers & Pages -> meyram-admin -> Custom domains" -ForegroundColor Green
