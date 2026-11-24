<#
.SYNOPSIS
  Sprint 1 evidence: secure issuer private-key loading (key store, Decision 014).

.DESCRIPTION
  Creates its OWN throwaway folder with a fresh embedded database, fresh issuer keys and a random
  passphrase and staff password (never printed). It never touches backend/.data, backend/keys or
  backend/.env (DOTENV_CONFIG_PATH points at a file that does not exist). It starts the real
  backend (node --import tsx src/server.ts) several times and prints one labelled section per
  screenshot:

    1 KEYS IGNORED BY GIT
    2 SECRET SCAN CATCHES PLANTED KEY
    3 STARTUP OK + HEALTH
    4 JWKS PUBLIC ONLY
    5 DEV DEGRADED: MISSING KEY
    6 PROD REFUSES WRONG PASSPHRASE
    7 PROD REFUSES KID MISMATCH
    8 ENV BUNDLE MODE

  Sections 6 and 7 use the production key policy (ISSUER_KEYS_STRICT_STARTUP=true, which
  NODE_ENV=production always enforces) on the embedded database, because a real
  NODE_ENV=production server also requires a PostgreSQL server. Section 6 also shows a real
  NODE_ENV=production process refusing the development passphrase (that check runs before the
  database connects).

  Nothing secret is printed and nothing is masked by hand: the passphrase, key material and the
  bundle simply never reach the output. A final check scans every captured log for them.

  Works in Windows PowerShell 5.1 and PowerShell 7. Needs Node.js, Git and `npm install` done in
  backend/ and crypto-core/.

.PARAMETER Port
  Port for the throwaway backend. Default 4200.

.PARAMETER KeepFiles
  Keep the throwaway folder (for inspection) instead of deleting it at the end.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/evidence/s1-keys.ps1
#>
[CmdletBinding()]
param(
  [int]$Port = 4200,
  [switch]$KeepFiles
)

$ErrorActionPreference = 'Stop'
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$BackendDir = Join-Path $RepoRoot 'backend'
$BaseUrl = "http://localhost:$Port/api/v1"
$script:Unexpected = 0
$script:Logs = @()     # server logs (must not contain the keys path)
$script:CliLogs = @()  # CLI output (may name the bundle path)

# ---------------------------------------------------------------------------
# Throwaway workspace and secrets (random, never printed)
# ---------------------------------------------------------------------------
function New-RandomSecret([int]$Bytes = 24) {
  $buffer = New-Object byte[] $Bytes
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buffer)
  ([Convert]::ToBase64String($buffer) -replace '[+/=]', 'x')
}
$Work = Join-Path ([IO.Path]::GetTempPath()) ("univault-keys-evidence-" + (Get-Random -Minimum 100000 -Maximum 999999))
$KeysDir = Join-Path $Work 'keys'
$DbDir = Join-Path $Work 'db'
$EmptyKeysDir = Join-Path $Work 'no-key-files'
New-Item -ItemType Directory -Force $Work, $KeysDir, $EmptyKeysDir | Out-Null
$Passphrase = New-RandomSecret
$WrongPassphrase = New-RandomSecret
$StaffPassword = New-RandomSecret 18

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------
function Write-Section([string]$Title) {
  Write-Host ''
  Write-Host ('=' * 78) -ForegroundColor Cyan
  Write-Host "  $Title" -ForegroundColor Cyan
  Write-Host ('=' * 78) -ForegroundColor Cyan
}
function Write-Field([string]$Name, $Value) {
  if ($null -eq $Value -or "$Value" -eq '') { $Value = '(none)' }
  Write-Host ('  {0,-28} {1}' -f $Name, $Value)
}
function Write-Request([string]$Text) { Write-Host "  > $Text" -ForegroundColor DarkGray }
function Write-Check([bool]$Ok, [string]$What) {
  if ($Ok) { Write-Host "  [OK] $What" -ForegroundColor Green }
  else { $script:Unexpected++; Write-Host "  [UNEXPECTED] $What" -ForegroundColor Red }
}
function Stop-WithMessage([string]$Message) {
  Write-Host ''
  Write-Host "  STOPPED: $Message" -ForegroundColor Red
  Stop-Backend
  exit 1
}

# ---------------------------------------------------------------------------
# Process helpers (Start-Process with files: no PowerShell stderr quirks on 5.1)
# ---------------------------------------------------------------------------
function Set-BackendEnv([hashtable]$Overrides) {
  $base = @{
    DOTENV_CONFIG_PATH          = (Join-Path $Work 'does-not-exist.env') # never read backend/.env
    NODE_ENV                    = 'test'
    LOG_LEVEL                   = 'info'
    PORT                        = "$Port"
    DATABASE_URL                = 'pglite://' + ($DbDir -replace '\\', '/')
    ISSUER_KEYS_DIR             = $KeysDir
    ISSUER_KEY_PASSPHRASE       = $Passphrase
    ISSUER_KEY_SOURCE           = 'file'
    ISSUER_KEYS_BUNDLE          = $null
    ISSUER_KEYS_STRICT_STARTUP  = $null
    JWT_SECRET                  = (New-RandomSecret 40)
    SEED_STAFF_PASSWORD         = $StaffPassword
    DEV_SIMULATE_REDEMPTION     = 'true'
  }
  foreach ($k in $Overrides.Keys) { $base[$k] = $Overrides[$k] }
  foreach ($k in $base.Keys) {
    if ($null -eq $base[$k]) { Remove-Item "Env:$k" -ErrorAction SilentlyContinue }
    else { Set-Item "Env:$k" $base[$k] }
  }
}

# Start-Process does not quote arguments in Windows PowerShell 5.1: paths with spaces would split
function ConvertTo-ArgList([string[]]$Items) {
  $Items | ForEach-Object { if ($_ -match '\s') { '"' + $_ + '"' } else { $_ } }
}

$script:RunCount = 0
function Invoke-Node([string[]]$NodeArgs, [hashtable]$Env = @{}) {
  Set-BackendEnv $Env
  $script:RunCount++
  $out = Join-Path $Work "run-$($script:RunCount).out"
  $err = Join-Path $Work "run-$($script:RunCount).err"
  $p = Start-Process -FilePath 'node' -ArgumentList (ConvertTo-ArgList (@('--import', 'tsx') + $NodeArgs)) -WorkingDirectory $BackendDir `
    -RedirectStandardOutput $out -RedirectStandardError $err -NoNewWindow -PassThru -Wait
  $text = ((Get-Content $out -Raw -Encoding UTF8 -ErrorAction SilentlyContinue) +
    (Get-Content $err -Raw -Encoding UTF8 -ErrorAction SilentlyContinue))
  [pscustomobject]@{ ExitCode = $p.ExitCode; Text = "$text" }
}

$script:Server = $null
function Start-Backend([hashtable]$Env = @{}) {
  Set-BackendEnv $Env
  $script:RunCount++
  $script:ServerOut = Join-Path $Work "server-$($script:RunCount).out"
  $script:ServerErr = Join-Path $Work "server-$($script:RunCount).err"
  $script:Server = Start-Process -FilePath 'node' -ArgumentList @('--import', 'tsx', 'src/server.ts') `
    -WorkingDirectory $BackendDir -RedirectStandardOutput $script:ServerOut -RedirectStandardError $script:ServerErr `
    -NoNewWindow -PassThru
  # Windows PowerShell 5.1 only reports ExitCode if the handle is read while the process runs
  $null = $script:Server.Handle
}
function Get-ServerLog {
  ((Get-Content $script:ServerOut -Raw -Encoding UTF8 -ErrorAction SilentlyContinue) +
    (Get-Content $script:ServerErr -Raw -Encoding UTF8 -ErrorAction SilentlyContinue))
}
# Waits until the server listens (returns $true) or exits (returns $false)
function Wait-Backend([int]$TimeoutSeconds = 90) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if ((Get-ServerLog) -match 'UniVault backend listening') { return $true }
    if ($script:Server.HasExited) { return $false }
    Start-Sleep -Milliseconds 300
  }
  Stop-WithMessage 'the backend neither started nor exited in time'
}
function Stop-Backend {
  if ($script:Server) {
    if (-not $script:Server.HasExited) { Stop-Process -Id $script:Server.Id -Force -ErrorAction SilentlyContinue }
    $script:Server.WaitForExit(10000) | Out-Null
    $script:Logs += Get-ServerLog
    $script:Server = $null
  }
}
function Get-LogLines([string]$Pattern) {
  (Get-ServerLog) -split "`r?`n" | Where-Object { $_ -match $Pattern } | ForEach-Object {
    try { $_ | ConvertFrom-Json } catch { $null }
  } | Where-Object { $null -ne $_ }
}

# HTTP: status + raw body on both PowerShell versions
function Invoke-Http([string]$Method, [string]$Path, [string]$Token, [object]$Body) {
  $params = @{ Method = $Method; Uri = "$BaseUrl$Path"; UseBasicParsing = $true }
  if ($Token) { $params.Headers = @{ Authorization = "Bearer $Token" } }
  if ($null -ne $Body) {
    $params.ContentType = 'application/json; charset=utf-8'
    $params.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 10 -Compress))
  }
  try {
    if ($PSVersionTable.PSVersion.Major -ge 7) {
      $r = Invoke-WebRequest @params -SkipHttpErrorCheck
    } else {
      $r = Invoke-WebRequest @params
    }
    $status = [int]$r.StatusCode
    # 5.1 returns byte[] for content types it does not know as text (application/jwk-set+json)
    $content = if ($r.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($r.Content) } else { [string]$r.Content }
  } catch [System.Net.WebException] {
    if ($null -eq $_.Exception.Response) { throw }
    $status = [int]$_.Exception.Response.StatusCode; $content = $_.ErrorDetails.Message
  }
  [pscustomobject]@{ Status = $status; Content = $content; Body = $(if ($content) { $content | ConvertFrom-Json } else { $null }) }
}
function Connect-Staff([string]$Email) {
  $r = Invoke-Http POST '/auth/login' $null @{ email = $Email; password = $StaffPassword }
  if ($r.Status -ne 200) { Stop-WithMessage "login failed for $Email (HTTP $($r.Status))" }
  $r.Body.accessToken # never printed
}

# Writes a throwaway RSA key (generated now) to a file. -Encrypted uses the passphrase from an
# environment variable, so the passphrase never appears on a command line or in the output.
$KeyGen = Join-Path $Work 'make-key.mjs'
Set-Content -Path $KeyGen -Encoding ASCII -Value @'
import { generateKeyPairSync } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const [, , file, mode] = process.argv;
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const options = mode === 'encrypted'
  ? { type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase: process.env.UNIVAULT_EVIDENCE_PASSPHRASE }
  : { type: 'pkcs8', format: 'pem' };
writeFileSync(file, privateKey.export(options));
'@
function New-ThrowawayKey([string]$File, [switch]$Encrypted) {
  $env:UNIVAULT_EVIDENCE_PASSPHRASE = $Passphrase
  $mode = if ($Encrypted) { 'encrypted' } else { 'plain' }
  $p = Start-Process -FilePath 'node' -ArgumentList (ConvertTo-ArgList @($KeyGen, $File, $mode)) -NoNewWindow -PassThru -Wait
  Remove-Item Env:UNIVAULT_EVIDENCE_PASSPHRASE -ErrorAction SilentlyContinue
  if ($p.ExitCode -ne 0) { Stop-WithMessage 'generating a throwaway key failed' }
}

function Get-KeyFile([string]$Kid) { Join-Path $KeysDir "$Kid.private.pem" }

try {
# ---------------------------------------------------------------------------
Write-Section 'SETUP (throwaway folder, database, keys and passphrase)'
Write-Field 'throwaway folder' $Work
foreach ($cmd in @('migrate', 'seed', 'keys')) {
  $r = Invoke-Node @('src/db/cli.ts', $cmd)
  $script:CliLogs += $r.Text
  if ($r.ExitCode -ne 0) { Stop-WithMessage "db:$cmd failed (exit $($r.ExitCode))" }
}
$generated = @(($script:CliLogs[-1] -split "`r?`n") | Where-Object { $_ -match '^\s+generated' })
$generated | ForEach-Object { Write-Host "  $($_.Trim())" }
$N = $generated.Count # one active key per seeded issuer
if ($N -lt 2) { Stop-WithMessage 'keys:init did not generate the issuer keys' }
Write-Field 'passphrase' '(random, 32 characters, never printed)'

# ---------------------------------------------------------------------------
Write-Section '1 KEYS IGNORED BY GIT'
Push-Location $RepoRoot
$paths = @('backend/keys/', 'backend/keys/example.private.pem', 'example.pem', 'backend/.env', 'backend/keys/issuer-keys.bundle.b64')
Write-Request "git check-ignore -v $($paths -join ' ')"
$ignored = & git check-ignore -v @paths
$ignoreExit = $LASTEXITCODE
Pop-Location
$ignored | ForEach-Object { Write-Host "  $_" }
Write-Check ($ignoreExit -eq 0 -and @($ignored).Count -eq $paths.Count) "all $($paths.Count) paths are ignored"

# ---------------------------------------------------------------------------
Write-Section '2 SECRET SCAN CATCHES PLANTED KEY'
$Plant = Join-Path $Work 'planted-repo'
New-Item -ItemType Directory -Force $Plant | Out-Null
Push-Location $Plant
& git init --quiet
New-ThrowawayKey (Join-Path $Plant 'notes.txt')
& git -c core.autocrlf=false add notes.txt
Write-Request 'node scripts/check-secrets.js   (in a temp Git repo with a freshly generated key staged)'
$scan = Start-Process -FilePath 'node' -ArgumentList (ConvertTo-ArgList @((Join-Path $RepoRoot 'scripts\check-secrets.js'))) -NoNewWindow -PassThru -Wait `
  -RedirectStandardOutput (Join-Path $Work 'scan1.out') -RedirectStandardError (Join-Path $Work 'scan1.err')
Pop-Location
$scanText = (Get-Content (Join-Path $Work 'scan1.out') -Raw) + (Get-Content (Join-Path $Work 'scan1.err') -Raw)
($scanText.Trim() -split "`r?`n") | ForEach-Object { Write-Host "  $_" }
Write-Field 'exit code' $scan.ExitCode
Write-Check ($scan.ExitCode -eq 1) 'planted key -> check:secrets fails'
Write-Check ($scanText -cnotmatch 'PRIVATE KEY-----') 'the key itself is not printed'
Push-Location $RepoRoot
Write-Request 'node scripts/check-secrets.js   (the UniVault repository)'
$scan2 = Start-Process -FilePath 'node' -ArgumentList @('scripts/check-secrets.js') -NoNewWindow -PassThru -Wait `
  -RedirectStandardOutput (Join-Path $Work 'scan2.out') -RedirectStandardError (Join-Path $Work 'scan2.err')
Pop-Location
Write-Host "  $((Get-Content (Join-Path $Work 'scan2.out') -Raw).Trim())"
Write-Field 'exit code' $scan2.ExitCode
Write-Check ($scan2.ExitCode -eq 0) 'repository -> OK'

# ---------------------------------------------------------------------------
Write-Section '3 STARTUP OK + HEALTH'
Start-Backend
if (-not (Wait-Backend)) { Stop-WithMessage "the backend exited during start-up" }
$loaded = Get-LogLines 'issuer keys loaded' | Select-Object -First 1
Write-Host '  Start-up log line:' -ForegroundColor Yellow
Write-Host ("  level={0} source={1} activeKeys={2} loaded={3} msg=""{4}""" -f $loaded.level, $loaded.source, $loaded.activeKeys, $loaded.loaded, $loaded.msg)
$health = Invoke-Http GET '/health'
Write-Request 'GET /health'
Write-Field 'HTTP status' $health.Status
Write-Field 'status' $health.Body.status
Write-Field 'keys' ($health.Body.keys | ConvertTo-Json -Compress)
Write-Check ($loaded.msg -eq "issuer keys loaded: $N/$N") "issuer keys loaded: $N/$N"
Write-Check ($health.Status -eq 200 -and $health.Body.keys.status -eq 'ok') '/health keys ok'

# ---------------------------------------------------------------------------
Write-Section '4 JWKS PUBLIC ONLY'
$kids = @{}
foreach ($issuer in @('employer-a', 'bank-a')) {
  $jwks = Invoke-Http GET "/issuers/$issuer/keys"
  Write-Request "GET /issuers/$issuer/keys"
  foreach ($key in $jwks.Body.keys) {
    $members = @($key.PSObject.Properties.Name)
    $kids[$issuer] = $key.kid
    Write-Field "  $issuer key $($key.kid.Substring(0, 12))..." ($members -join ', ')
    $private = @($members | Where-Object { @('d', 'p', 'q', 'dp', 'dq', 'qi') -contains $_ })
    Write-Check ($private.Count -eq 0) "no private members (d, p, q, dp, dq, qi) for $issuer"
  }
}
Stop-Backend

# ---------------------------------------------------------------------------
Write-Section '5 DEV DEGRADED: MISSING KEY'
$employerKey = Get-KeyFile $kids['employer-a']
$parked = Join-Path $Work 'parked-employer-key'
Move-Item $employerKey $parked
Write-Request "employer-a key file removed; start the backend (development policy: not strict)"
Start-Backend
if (-not (Wait-Backend)) { Stop-WithMessage 'the backend should start degraded, but it exited' }
$warn = Get-LogLines 'Issuer key check failed' | Select-Object -First 1
Write-Host '  Warning line:' -ForegroundColor Yellow
Write-Host ("  level={0} issuerId={1} kid={2} code={3}" -f $warn.level, $warn.issuerId, $warn.kid, $warn.code)
$health = Invoke-Http GET '/health'
Write-Request 'GET /health'
Write-Field 'HTTP status' $health.Status
Write-Field 'status' $health.Body.status
Write-Field 'keys' ($health.Body.keys | ConvertTo-Json -Compress)
$officer = Connect-Staff 'officer@serendib-trading.example'
$admin = Connect-Staff 'admin@serendib-trading.example'
$seed = (Get-Content (Join-Path $BackendDir 'seed-data\employees.json') -Raw | ConvertFrom-Json).records |
  Where-Object { $_.issuer_key -eq 'employer-a' } | Select-Object -First 1
$claims = $seed.claims | ConvertTo-Json -Depth 10 | ConvertFrom-Json
$claims.employee_id = "EVK-$(Get-Random -Minimum 10000 -Maximum 99999)"
$holder = Invoke-Http POST '/holders' $officer @{ claims = $claims }
$credential = Invoke-Http POST '/credentials' $officer @{ holderId = $holder.Body.id }
Write-Request "POST /dev/credentials/$($credential.Body.id)/simulate-redemption   (signs with employer-a's key)"
$signing = Invoke-Http POST "/dev/credentials/$($credential.Body.id)/simulate-redemption" $admin
Write-Field 'HTTP status' $signing.Status
Write-Field 'error.code' $signing.Body.error.code
Write-Field 'error.message' $signing.Body.error.message
Write-Check ($warn.code -eq 'KEY_NOT_FOUND' -and $warn.issuerId -eq 'employer-a') 'warning names employer-a, its kid and KEY_NOT_FOUND'
Write-Check ($health.Status -eq 503 -and $health.Body.keys.status -eq 'degraded' -and $health.Body.keys.loaded -eq ($N - 1)) "/health 503 degraded ($($N - 1) of $N keys loaded)"
Write-Check ($signing.Status -eq 503 -and $signing.Body.error.code -eq 'ISSUER_KEY_UNAVAILABLE') 'signing -> 503 ISSUER_KEY_UNAVAILABLE (no detail in the response)'
Stop-Backend
Move-Item $parked $employerKey

# ---------------------------------------------------------------------------
Write-Section '6 PROD REFUSES WRONG PASSPHRASE'
Write-Request 'start the backend with a wrong ISSUER_KEY_PASSPHRASE and ISSUER_KEYS_STRICT_STARTUP=true (the production key policy)'
Start-Backend @{ ISSUER_KEYS_STRICT_STARTUP = 'true'; ISSUER_KEY_PASSPHRASE = $WrongPassphrase }
$listened = Wait-Backend
$script:Server.WaitForExit(15000) | Out-Null
$code6 = $script:Server.ExitCode
$errors = @(Get-LogLines 'Issuer key check failed')
Write-Field 'exit code' $code6
$errors | ForEach-Object { Write-Host ("  error: issuerId={0} kid={1} code={2}" -f $_.issuerId, $_.kid, $_.code) }
$fatal = Get-LogLines 'refusing to start' | Select-Object -First 1
Write-Host "  fatal: $($fatal.msg)"
Write-Check ((-not $listened) -and $null -ne $code6 -and $code6 -ne 0) 'exited non-zero before listening'
Write-Check ($errors.Count -eq $N -and @($errors | Where-Object { $_.code -ne 'KEY_DECRYPT_FAILED' }).Count -eq 0) 'one error line per issuer, code KEY_DECRYPT_FAILED'
Stop-Backend
Write-Request 'NODE_ENV=production with the development passphrase from .env.example'
$prod = Invoke-Node @('src/server.ts') @{
  NODE_ENV = 'production'; DATABASE_URL = 'postgres://univault@localhost:1/univault'
  ISSUER_KEY_PASSPHRASE = 'univault-dev-key-passphrase-change-me'
}
$script:Logs += $prod.Text
($prod.Text -split "`r?`n") | Where-Object { $_ -match 'ISSUER_KEY_PASSPHRASE' } | ForEach-Object { Write-Host "  $($_.Trim())" }
Write-Field 'exit code' $prod.ExitCode
Write-Check ($prod.ExitCode -ne 0 -and $prod.Text -match 'must not be the development value') 'production refuses the development passphrase'

# ---------------------------------------------------------------------------
Write-Section '7 PROD REFUSES KID MISMATCH'
$backup = Join-Path $Work 'employer-key-backup'
Copy-Item $employerKey $backup
New-ThrowawayKey $employerKey -Encrypted
Write-Request "employer-a's key file replaced by a different (correctly encrypted) key; strict start-up"
Start-Backend @{ ISSUER_KEYS_STRICT_STARTUP = 'true' }
$listened = Wait-Backend
$script:Server.WaitForExit(15000) | Out-Null
$code7 = $script:Server.ExitCode
$errors = @(Get-LogLines 'Issuer key check failed')
Write-Field 'exit code' $code7
$errors | ForEach-Object { Write-Host ("  error: issuerId={0} kid={1} code={2}" -f $_.issuerId, $_.kid, $_.code) }
Write-Check ((-not $listened) -and $null -ne $code7 -and $code7 -ne 0) 'exited non-zero before listening'
Write-Check ($errors.Count -eq 1 -and $errors[0].code -eq 'KEY_KID_MISMATCH' -and $errors[0].issuerId -eq 'employer-a') 'KEY_KID_MISMATCH for employer-a only'
Stop-Backend
Copy-Item $backup $employerKey -Force

# ---------------------------------------------------------------------------
Write-Section '8 ENV BUNDLE MODE'
Write-Request 'npm run keys:bundle'
$bundleRun = Invoke-Node @('src/db/cli.ts', 'bundle')
$script:CliLogs += $bundleRun.Text
($bundleRun.Text -split "`r?`n") | Where-Object { $_ -match 'bundled|Bundle written|Reminder' } | ForEach-Object { Write-Host "  $($_.Trim())" }
Write-Check ($bundleRun.ExitCode -eq 0) 'bundle written (ids, kids and path only)'
Write-Check ($bundleRun.Text -match 'Reminder: delete this local bundle file') 'reminder to delete the local bundle printed'
$bundleFile = Join-Path $KeysDir 'issuer-keys.bundle.b64'
$bundle = (Get-Content $bundleFile -Raw).Trim() # handed to the server; never printed
Write-Request 'start the backend with ISSUER_KEY_SOURCE=env, ISSUER_KEYS_BUNDLE=<bundle> and an EMPTY keys folder (strict)'
Start-Backend @{ ISSUER_KEY_SOURCE = 'env'; ISSUER_KEYS_BUNDLE = $bundle; ISSUER_KEYS_DIR = $EmptyKeysDir; ISSUER_KEYS_STRICT_STARTUP = 'true' }
if (-not (Wait-Backend)) { Stop-WithMessage 'the backend did not start in env mode' }
$loaded = Get-LogLines 'issuer keys loaded' | Select-Object -First 1
Write-Host ("  level={0} source={1} activeKeys={2} loaded={3} msg=""{4}""" -f $loaded.level, $loaded.source, $loaded.activeKeys, $loaded.loaded, $loaded.msg)
$health = Invoke-Http GET '/health'
Write-Field 'GET /health keys' ($health.Body.keys | ConvertTo-Json -Compress)
$admin = Connect-Staff 'admin@serendib-trading.example'
Write-Request 'POST /issuers/employer-a/keys   (admin: key rotation)'
$rotate = Invoke-Http POST '/issuers/employer-a/keys' $admin
Write-Field 'HTTP status' $rotate.Status
Write-Field 'error.code' $rotate.Body.error.code
Write-Field 'error.message' $rotate.Body.error.message
Write-Check ($loaded.source -eq 'env' -and $loaded.msg -eq "issuer keys loaded: $N/$N") "server started in env mode, $N/$N keys"
Write-Check ($health.Body.keys.status -eq 'ok') '/health keys ok'
Write-Check ($rotate.Status -eq 409 -and $rotate.Body.error.code -eq 'KEY_ROTATION_UNSUPPORTED_IN_ENV_MODE') 'rotation -> 409 KEY_ROTATION_UNSUPPORTED_IN_ENV_MODE'
Stop-Backend

# ---------------------------------------------------------------------------
Write-Section 'LEAK CHECK (all captured output)'
$serverText = ($script:Logs -join "`n")
$allText = $serverText + "`n" + ($script:CliLogs -join "`n")
Write-Check ($allText -cnotmatch 'PRIVATE KEY') 'no PEM key text (PRIVATE KEY) anywhere'
Write-Check (-not $allText.Contains($Passphrase) -and -not $allText.Contains($WrongPassphrase)) 'the passphrases never appear'
Write-Check (-not $allText.Contains($bundle.Substring(200, 60))) 'the bundle never appears'
$escapedKeys = $KeysDir.Replace('\', '\\')
Write-Check (-not $serverText.Contains($KeysDir) -and -not $serverText.Contains($escapedKeys)) 'server logs never show the keys folder path'
} finally {
  Stop-Backend
  if (-not $KeepFiles) { Remove-Item -Recurse -Force $Work -ErrorAction SilentlyContinue }
}

Write-Host ''
if ($script:Unexpected -eq 0) {
  Write-Host '  All sections returned the expected results.' -ForegroundColor Green
  exit 0
}
Write-Host "  $($script:Unexpected) unexpected result(s) - see [UNEXPECTED] lines above." -ForegroundColor Red
exit 1
