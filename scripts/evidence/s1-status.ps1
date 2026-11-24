<#
.SYNOPSIS
  Sprint 1 evidence: the public credential status endpoint GET /api/v1/status/:credentialId.

.DESCRIPTION
  Runs against the backend started with `npm run dev` (in backend/) and prints one clearly
  labelled section per screenshot:

    1 STATUS VALID
    2 STATUS REVOKED
    3 STATUS SUPERSEDED
    4 STATUS EXPIRED
    5 UNKNOWN ID 404
    6 PENDING HIDDEN 404
    7 NO AUTH + HEADERS

  Setup logs in as the seeded employer-a admin, creates fresh holder records from the
  SYNTHETIC seed data (backend/seed-data/employees.json, new employee IDs each run) and
  prepares its own credentials (valid, revoked, superseded, expired, pending). Every status
  call is then made WITHOUT an Authorization header, from a pretend verifier origin.

  The full status JSON is printed for sections 1-4: it holds only the credential id, status,
  expiry and check time (no personal data). Tokens and passwords are never printed.

  Prerequisites (backend/.env):
    - DEV_SIMULATE_REDEMPTION=true  (the dev-only simulate-redemption and simulate-expiry
      routes make credentials 'valid' and 'expired' until Sprint 2 wallet redemption exists)
    - ISSUER_KEY_PASSPHRASE set, and `npm run keys:init` run once (employer-a needs a signing key)
    - `npm run db:seed` run once (staff logins)
    - STATUS_RATE_LIMIT_MAX at least 15 (default 60): the script makes about 10 status calls
  Works in PowerShell 7+ (-SkipHttpErrorCheck / -StatusCodeVariable) and in Windows
  PowerShell 5.1 (falls back to reading the error response from the exception).

.PARAMETER BaseUrl
  API base URL. Default: http://localhost:<PORT>/api/v1, with PORT from the environment or
  backend/.env, else 4000.

.PARAMETER SeedPassword
  Password of the seeded development staff logins. Default: the documented development seed
  password (SEED_STAFF_PASSWORD empty). Never printed.

.PARAMETER VerifierOrigin
  Origin header sent with the status calls, to show the public CORS policy. Not in
  CORS_ORIGINS on purpose.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/evidence/s1-status.ps1
  pwsh scripts/evidence/s1-status.ps1 -BaseUrl http://localhost:4000/api/v1 -SeedPassword '<password>'
#>
[CmdletBinding()]
param(
  [string]$BaseUrl,
  [string]$SeedPassword = 'UniVault-Dev-2026!',
  [string]$AdminEmail = 'admin@serendib-trading.example',
  [string]$VerifierOrigin = 'https://verifier.example'
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')

# ---------------------------------------------------------------------------
# Base URL: parameter > $env:PORT > backend/.env PORT > 4000
# ---------------------------------------------------------------------------
if (-not $BaseUrl) {
  $port = $env:PORT
  $envFile = Join-Path $RepoRoot 'backend\.env'
  if (-not $port -and (Test-Path $envFile)) {
    $line = Get-Content $envFile | Where-Object { $_ -match '^\s*PORT\s*=\s*(\d+)\s*$' } | Select-Object -First 1
    if ($line -and $line -match '(\d+)') { $port = $Matches[1] }
  }
  if (-not $port) { $port = '4000' }
  $BaseUrl = "http://localhost:$port/api/v1"
}
$BaseUrl = $BaseUrl.TrimEnd('/')
$script:Unexpected = 0

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Authenticated portal calls (setup only). Returns status and parsed body.
function Invoke-Api {
  param(
    [Parameter(Mandatory)][ValidateSet('GET', 'POST')][string]$Method,
    [Parameter(Mandatory)][string]$Path,
    [string]$Token,
    [object]$Body
  )
  $params = @{ Method = $Method; Uri = "$BaseUrl$Path" }
  if ($Token) { $params.Headers = @{ Authorization = "Bearer $Token" } }
  if ($null -ne $Body) {
    $params.ContentType = 'application/json; charset=utf-8'
    $params.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 10 -Compress))
  }
  if ($PSVersionTable.PSVersion.Major -ge 7) {
    $response = Invoke-RestMethod @params -SkipHttpErrorCheck -StatusCodeVariable statusCode
    return [pscustomobject]@{ Status = [int]$statusCode; Body = $response }
  }
  try {
    $response = Invoke-WebRequest @params -UseBasicParsing
    $content = $response.Content
    $status = [int]$response.StatusCode
  } catch [System.Net.WebException] {
    if ($null -eq $_.Exception.Response) { throw }
    $status = [int]$_.Exception.Response.StatusCode
    $content = $_.ErrorDetails.Message
  }
  $parsed = if ($content) { $content | ConvertFrom-Json } else { $null }
  [pscustomobject]@{ Status = $status; Body = $parsed }
}

function Get-HeaderValue($Headers, [string]$Name) {
  if ($null -eq $Headers) { return $null }
  $value = $Headers[$Name]
  if ($value -is [array]) { $value = $value -join ', ' }
  $value
}

# The PUBLIC status call: no Authorization header, only an Origin header. Returns the status,
# the raw JSON text (printed as-is, so PowerShell 7 does not turn ISO dates into DateTime
# values), and the response headers that matter for the evidence.
$script:StatusRequestHeaders = @{ Origin = $VerifierOrigin }
function Get-PublicStatus([string]$CredentialId) {
  $params = @{
    Method  = 'GET'
    Uri     = "$BaseUrl/status/$CredentialId"
    Headers = $script:StatusRequestHeaders
  }
  if ($PSVersionTable.PSVersion.Major -ge 7) {
    $response = Invoke-WebRequest @params -SkipHttpErrorCheck
    $status = [int]$response.StatusCode
    $content = [string]$response.Content
    $headers = $response.Headers
  } else {
    try {
      $response = Invoke-WebRequest @params -UseBasicParsing
      $status = [int]$response.StatusCode
      $content = [string]$response.Content
      $headers = $response.Headers
    } catch [System.Net.WebException] {
      if ($null -eq $_.Exception.Response) { throw }
      $status = [int]$_.Exception.Response.StatusCode
      $content = $_.ErrorDetails.Message
      $headers = $_.Exception.Response.Headers
    }
  }
  [pscustomobject]@{
    Status       = $status
    Content      = $content
    Body         = if ($content) { $content | ConvertFrom-Json } else { $null }
    CacheControl = Get-HeaderValue $headers 'Cache-Control'
    ContentType  = Get-HeaderValue $headers 'Content-Type'
    AllowOrigin  = Get-HeaderValue $headers 'Access-Control-Allow-Origin'
  }
}

function Get-ErrorCode($Result) {
  if ($Result.Body -and $Result.Body.PSObject.Properties['error']) { return $Result.Body.error.code }
  ''
}

function Write-Section([string]$Title) {
  Write-Host ''
  Write-Host ('=' * 78) -ForegroundColor Cyan
  Write-Host "  $Title" -ForegroundColor Cyan
  Write-Host ('=' * 78) -ForegroundColor Cyan
}

function Write-Field([string]$Name, $Value) {
  if ($null -eq $Value -or "$Value" -eq '') { $Value = '(none)' }
  Write-Host ('  {0,-30} {1}' -f $Name, $Value)
}

function Write-Request([string]$Text) { Write-Host "  > $Text" -ForegroundColor DarkGray }

function Write-Check([bool]$Ok, [string]$What) {
  if ($Ok) {
    Write-Host "  [OK] $What" -ForegroundColor Green
  } else {
    $script:Unexpected++
    Write-Host "  [UNEXPECTED] $What" -ForegroundColor Red
  }
}

function Stop-WithMessage([string]$Message) {
  Write-Host ''
  Write-Host "  STOPPED: $Message" -ForegroundColor Red
  exit 1
}

# Shows one public status response; the JSON is printed in full (no personal data in it)
function Show-Status([string]$CredentialId, [int]$ExpectedHttp, [string]$ExpectedStatus) {
  Write-Request "GET /status/$CredentialId   (no Authorization header)"
  $r = Get-PublicStatus $CredentialId
  Write-Host "  HTTP $($r.Status)" -ForegroundColor Yellow
  Write-Host "  $($r.Content)"
  if ($ExpectedStatus) {
    Write-Check ($r.Status -eq $ExpectedHttp -and $r.Body.status -eq $ExpectedStatus) "HTTP $ExpectedHttp, status '$ExpectedStatus'"
  } else {
    Write-Check ($r.Status -eq $ExpectedHttp) "HTTP $ExpectedHttp $(Get-ErrorCode $r)"
  }
  $r
}

function Connect-Staff([string]$Email, [string]$Role) {
  $result = Invoke-Api POST '/auth/login' -Body @{ email = $Email; password = $SeedPassword }
  if ($result.Status -ne 200) {
    Stop-WithMessage "login as the seeded $Role failed (HTTP $($result.Status) $(Get-ErrorCode $result)). Run 'npm run db:seed' and check -SeedPassword."
  }
  Write-Field "logged in ($Role)" "staff id $($result.Body.staff.id), role $($result.Body.staff.role)"
  $result.Body.accessToken # returned to the caller only, never printed
}

# Synthetic claims from the seed data; only the employee ID is changed, so each run is fresh
$SeedFile = Join-Path $RepoRoot 'backend\seed-data\employees.json'
$SeedClaims = ((Get-Content $SeedFile -Raw | ConvertFrom-Json).records |
  Where-Object { $_.issuer_key -eq 'employer-a' } | Select-Object -First 1).claims
$RunId = Get-Random -Minimum 100000 -Maximum 999999
$script:HolderCount = 0

function New-PendingCredential([string]$Token) {
  $script:HolderCount++
  $claims = $SeedClaims | ConvertTo-Json -Depth 10 | ConvertFrom-Json # a copy
  $claims.employee_id = "EVS-$RunId-$($script:HolderCount)"
  $holder = Invoke-Api POST '/holders' -Token $Token -Body @{ claims = $claims }
  if ($holder.Status -ne 201) { Stop-WithMessage "creating a holder failed (HTTP $($holder.Status) $(Get-ErrorCode $holder))" }
  $result = Invoke-Api POST '/credentials' -Token $Token -Body @{ holderId = $holder.Body.id }
  if ($result.Status -ne 201) {
    $hint = if ((Get-ErrorCode $result) -eq 'ISSUER_KEY_MISSING') { " Run 'npm run keys:init' in backend/." } else { '' }
    Stop-WithMessage "issuing a credential failed (HTTP $($result.Status) $(Get-ErrorCode $result)).$hint"
  }
  $result.Body.id
}

function Invoke-DevRoute([string]$Token, [string]$CredentialId, [string]$Action) {
  $result = Invoke-Api POST "/dev/credentials/$CredentialId/$Action" -Token $Token
  if ($result.Status -eq 404 -and (Get-ErrorCode $result) -eq 'NOT_FOUND') {
    Stop-WithMessage "the dev-only $Action route is off. Set DEV_SIMULATE_REDEMPTION=true in backend/.env and restart npm run dev."
  }
  if ($result.Status -ne 200) { Stop-WithMessage "$Action failed (HTTP $($result.Status) $(Get-ErrorCode $result))" }
  $result.Body.credential
}

function New-ValidCredential([string]$Token) {
  $id = New-PendingCredential $Token
  [void](Invoke-DevRoute $Token $id 'simulate-redemption')
  $id
}

# ---------------------------------------------------------------------------
# Setup (authenticated portal calls; the status calls below use no token)
# ---------------------------------------------------------------------------
Write-Section "SETUP  ($BaseUrl)"
try {
  $health = Invoke-Api GET '/health'
} catch {
  Stop-WithMessage "the backend is not reachable at $BaseUrl. Start it with 'npm run dev' in backend/."
}
Write-Field 'health' "HTTP $($health.Status), database $($health.Body.database)"
$admin = Connect-Staff $AdminEmail 'admin'

$validId = New-ValidCredential $admin

$revokedId = New-ValidCredential $admin
$rev = Invoke-Api POST "/credentials/$revokedId/revoke" -Token $admin -Body @{ reason = 'employment_ended' }
if ($rev.Status -ne 200) { Stop-WithMessage "revoke failed (HTTP $($rev.Status) $(Get-ErrorCode $rev))" }

$supersededId = New-ValidCredential $admin
$re = Invoke-Api POST "/credentials/$supersededId/reissue" -Token $admin -Body @{ reason = 'details_changed' }
if ($re.Status -ne 201) { Stop-WithMessage "reissue failed (HTTP $($re.Status) $(Get-ErrorCode $re))" }

$expiredId = New-ValidCredential $admin
$pendingId = New-PendingCredential $admin
$unknownId = [guid]::NewGuid().ToString()

Write-Field 'credential: valid' $validId
Write-Field 'credential: revoked' "$revokedId  (reason employment_ended)"
Write-Field 'credential: superseded' "$supersededId  (replacement $($re.Body.credential.id), pending)"
Write-Field 'credential: to be expired' $expiredId
Write-Field 'credential: pending' $pendingId
Write-Field 'unknown id (random UUID)' $unknownId

# ---------------------------------------------------------------------------
Write-Section '1 STATUS VALID'
[void](Show-Status $validId 200 'valid')

# ---------------------------------------------------------------------------
Write-Section '2 STATUS REVOKED'
$r2 = Show-Status $revokedId 200 'revoked'
Write-Check ($r2.Content -notmatch 'employment_ended|reason') 'no revocation reason in the public response'

# ---------------------------------------------------------------------------
Write-Section '3 STATUS SUPERSEDED'
$r3 = Show-Status $supersededId 200 'superseded'
Write-Check ($r3.Content -notmatch [regex]::Escape($re.Body.credential.id)) 'no replacement id in the public response'

# ---------------------------------------------------------------------------
Write-Section '4 STATUS EXPIRED'
Write-Request "POST /dev/credentials/$expiredId/simulate-expiry   (admin, DEV ONLY: expiry moved 1 minute into the past)"
$expired = Invoke-DevRoute $admin $expiredId 'simulate-expiry'
Write-Field 'stored status (portal)' $expired.status
Write-Field 'effectiveStatus (portal)' $expired.effectiveStatus
[void](Show-Status $expiredId 200 'expired')

# ---------------------------------------------------------------------------
Write-Section '5 UNKNOWN ID 404'
$unknown = Show-Status $unknownId 404 $null
Write-Field 'error.code' (Get-ErrorCode $unknown)
Write-Check ((Get-ErrorCode $unknown) -eq 'CREDENTIAL_STATUS_NOT_FOUND') 'error.code CREDENTIAL_STATUS_NOT_FOUND'

# ---------------------------------------------------------------------------
Write-Section '6 PENDING HIDDEN 404'
Write-Host '  A pending credential was never issued to a wallet: it must look exactly like an unknown id.'
$unknown2 = Get-PublicStatus $unknownId
$pending = Get-PublicStatus $pendingId
Write-Host ''
Write-Host ('  {0,-14} HTTP {1}  {2}' -f 'unknown id', $unknown2.Status, $unknown2.Content) -ForegroundColor Yellow
Write-Host ('  {0,-14} HTTP {1}  {2}' -f 'pending id', $pending.Status, $pending.Content) -ForegroundColor Yellow
Write-Host ''
$stripRequestId = { param($text) $text -replace '"requestId":"[^"]*"', '"requestId":"..."' }
Write-Check ($pending.Status -eq 404 -and $unknown2.Status -eq 404) 'both HTTP 404'
Write-Check ((& $stripRequestId $pending.Content) -ceq (& $stripRequestId $unknown2.Content)) 'bodies identical apart from requestId'
Write-Check ($pending.Content -notmatch [regex]::Escape($pendingId)) 'the pending id is not echoed back'

# ---------------------------------------------------------------------------
Write-Section '7 NO AUTH + HEADERS'
Write-Host '  Request headers sent by this script to GET /status/:id:' -ForegroundColor Yellow
foreach ($name in $script:StatusRequestHeaders.Keys) { Write-Field "  $name" $script:StatusRequestHeaders[$name] }
$hasAuth = $script:StatusRequestHeaders.ContainsKey('Authorization')
Write-Field '  Authorization' $(if ($hasAuth) { '(SENT)' } else { '(not sent)' })
Write-Check (-not $hasAuth) 'no Authorization header was sent'
$h = Get-PublicStatus $validId
Write-Host ''
Write-Host "  Response to GET /status/$validId :" -ForegroundColor Yellow
Write-Field '  HTTP status' $h.Status
Write-Field '  Cache-Control' $h.CacheControl
Write-Field '  Content-Type' $h.ContentType
Write-Field '  Access-Control-Allow-Origin' $h.AllowOrigin
Write-Check ($h.Status -eq 200) 'HTTP 200 without a token'
Write-Check ($h.CacheControl -eq 'no-store') 'Cache-Control: no-store'
Write-Check ($h.AllowOrigin -eq '*') "Access-Control-Allow-Origin: * (origin $VerifierOrigin)"
Write-Check ("$($h.ContentType)" -like 'application/json*') 'Content-Type: application/json'

# ---------------------------------------------------------------------------
Write-Host ''
if ($script:Unexpected -eq 0) {
  Write-Host '  All sections returned the expected responses.' -ForegroundColor Green
  exit 0
}
Write-Host "  $($script:Unexpected) unexpected response(s) - see [UNEXPECTED] lines above." -ForegroundColor Red
exit 1
