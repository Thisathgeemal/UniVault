<#
.SYNOPSIS
  Sprint 1 evidence: credential revocation, reissue and status history.

.DESCRIPTION
  Runs against the backend started with `npm run dev` (in backend/) and prints one clearly
  labelled section per screenshot:

    1 REVOKE VALID
    2 REVOKE PENDING + OFFER INVALIDATED
    3 DOUBLE REVOKE 409
    4 OFFICER CANNOT REVOKE 403
    5 REISSUE LINK
    6 STATUS HISTORY
    7 REISSUE REVOKED 409

  It logs in as the seeded employer-a admin and officer, creates fresh holder records from the
  SYNTHETIC seed data (backend/seed-data/employees.json, new employee IDs each run), and issues
  credentials. Only IDs, statuses, reasons and error codes are printed: never tokens, passwords,
  pre-authorised codes, notes or claims.

  Prerequisites (backend/.env):
    - DEV_SIMULATE_REDEMPTION=true  (credentials only become 'valid' at wallet redemption, which
      is Sprint 2; until then the dev-only simulate-redemption route signs them)
    - ISSUER_KEY_PASSPHRASE set, and `npm run keys:init` run once (employer-a needs a signing key)
    - `npm run db:seed` run once (staff logins)
  Works in PowerShell 7+ (pwsh: Invoke-RestMethod -SkipHttpErrorCheck / -StatusCodeVariable)
  and in Windows PowerShell 5.1 (falls back to reading the error response from the exception).

.PARAMETER BaseUrl
  API base URL. Default: http://localhost:<PORT>/api/v1, with PORT from the environment or
  backend/.env, else 4000.

.PARAMETER SeedPassword
  Password of the seeded development staff logins. Default: the documented development seed
  password (SEED_STAFF_PASSWORD empty). Never printed.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/evidence/s1-revocation.ps1
  pwsh scripts/evidence/s1-revocation.ps1 -BaseUrl http://localhost:4000/api/v1 -SeedPassword '<password>'
#>
[CmdletBinding()]
param(
  [string]$BaseUrl,
  [string]$SeedPassword = 'UniVault-Dev-2026!',
  [string]$AdminEmail = 'admin@serendib-trading.example',
  [string]$OfficerEmail = 'officer@serendib-trading.example'
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
    # UTF-8 bytes, so both PowerShell versions send non-ASCII claim text correctly
    $params.ContentType = 'application/json; charset=utf-8'
    $params.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 10 -Compress))
  }
  if ($PSVersionTable.PSVersion.Major -ge 7) {
    # PowerShell 7: error responses (4xx/5xx) are returned instead of thrown
    $response = Invoke-RestMethod @params -SkipHttpErrorCheck -StatusCodeVariable statusCode
    return [pscustomobject]@{ Status = [int]$statusCode; Body = $response }
  }
  # Windows PowerShell 5.1 has no -SkipHttpErrorCheck: read the error response from the exception
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
  if ($null -eq $Value -or "$Value" -eq '') { $Value = '(null)' }
  Write-Host ('  {0,-26} {1}' -f $Name, $Value)
}

function Write-Request([string]$Text) { Write-Host "  > $Text" -ForegroundColor DarkGray }

function Assert-Status($Result, [int]$Expected, [string]$What) {
  if ($Result.Status -eq $Expected) {
    Write-Host ("  [OK] {0}: HTTP {1}" -f $What, $Result.Status) -ForegroundColor Green
  } else {
    $script:Unexpected++
    $code = Get-ErrorCode $Result
    Write-Host ("  [UNEXPECTED] {0}: HTTP {1} (expected {2}) {3}" -f $What, $Result.Status, $Expected, $code) -ForegroundColor Red
  }
}

function Write-Error409([object]$Result) {
  Write-Field 'HTTP status' $Result.Status
  Write-Field 'error.code' (Get-ErrorCode $Result)
  if ($Result.Body.error.PSObject.Properties['details'] -and $Result.Body.error.details -and
    $Result.Body.error.details.PSObject.Properties['replacedBy']) {
    Write-Field 'error.details.replacedBy' $Result.Body.error.details.replacedBy
  }
}

function Write-Credential([string]$Label, $Credential) {
  Write-Host "  $Label" -ForegroundColor Yellow
  Write-Field 'id' $Credential.id
  Write-Field 'status' $Credential.status
  Write-Field 'credentialType' $Credential.credentialType
  Write-Field 'revokedAt' $Credential.revokedAt
  Write-Field 'revocationReason' $Credential.revocationReason
  Write-Field 'revokedBy.id' $(if ($Credential.revokedBy) { $Credential.revokedBy.id } else { $null })
  Write-Field 'supersededAt' $Credential.supersededAt
  Write-Field 'replacesCredentialId' $Credential.replacesCredentialId
  Write-Field 'replacedByCredentialId' $Credential.replacedByCredentialId
}

function Stop-WithMessage([string]$Message) {
  Write-Host ''
  Write-Host "  STOPPED: $Message" -ForegroundColor Red
  exit 1
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

function New-Holder([string]$Token) {
  $script:HolderCount++
  $claims = $SeedClaims | ConvertTo-Json -Depth 10 | ConvertFrom-Json # a copy
  $claims.employee_id = "EVD-$RunId-$($script:HolderCount)"
  $result = Invoke-Api POST '/holders' -Token $Token -Body @{ claims = $claims }
  if ($result.Status -ne 201) { Stop-WithMessage "creating a holder failed (HTTP $($result.Status) $(Get-ErrorCode $result))" }
  $result.Body.id
}

function New-PendingCredential([string]$Token, [string]$HolderId) {
  $result = Invoke-Api POST '/credentials' -Token $Token -Body @{ holderId = $HolderId }
  if ($result.Status -ne 201) {
    $hint = if ((Get-ErrorCode $result) -eq 'ISSUER_KEY_MISSING') { " Run 'npm run keys:init' in backend/." } else { '' }
    Stop-WithMessage "issuing a credential failed (HTTP $($result.Status) $(Get-ErrorCode $result)).$hint"
  }
  $result.Body.id
}

function Set-CredentialValid([string]$Token, [string]$CredentialId) {
  $result = Invoke-Api POST "/dev/credentials/$CredentialId/simulate-redemption" -Token $Token
  if ($result.Status -eq 404 -and (Get-ErrorCode $result) -eq 'NOT_FOUND') {
    Stop-WithMessage 'the dev-only simulate-redemption route is off. Set DEV_SIMULATE_REDEMPTION=true in backend/.env and restart npm run dev.'
  }
  if ($result.Status -ne 200) { Stop-WithMessage "simulated redemption failed (HTTP $($result.Status) $(Get-ErrorCode $result))" }
}

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
Write-Section "SETUP  ($BaseUrl)"
try {
  $health = Invoke-Api GET '/health'
} catch {
  Stop-WithMessage "the backend is not reachable at $BaseUrl. Start it with 'npm run dev' in backend/."
}
Write-Field 'health' "HTTP $($health.Status), database $($health.Body.database)"
$admin = Connect-Staff $AdminEmail 'admin'
$officer = Connect-Staff $OfficerEmail 'officer'

$c1 = New-PendingCredential $officer (New-Holder $officer)
Set-CredentialValid $admin $c1
$c2 = New-PendingCredential $officer (New-Holder $officer)
$c3 = New-PendingCredential $officer (New-Holder $officer)
Set-CredentialValid $admin $c3
Write-Field 'credential A (valid)' $c1
Write-Field 'credential B (pending)' $c2
Write-Field 'credential C (valid)' $c3

# ---------------------------------------------------------------------------
Write-Section '1 REVOKE VALID'
Write-Request "POST /credentials/$c1/revoke  { reason: employment_ended }  (admin)"
$r = Invoke-Api POST "/credentials/$c1/revoke" -Token $admin -Body @{ reason = 'employment_ended' }
Assert-Status $r 200 'revoke valid credential'
Write-Credential 'Response (same shape as GET /credentials/:id):' $r.Body

# ---------------------------------------------------------------------------
Write-Section '2 REVOKE PENDING + OFFER INVALIDATED'
$offer = Invoke-Api POST '/credential-offers' -Token $officer -Body @{ credentialId = $c2 }
Assert-Status $offer 201 'create offer for pending credential'
$offerId = $offer.Body.offerId # the pre-authorised code and qrContent are deliberately not printed
$before = Invoke-Api GET "/credential-offers/$offerId" -Token $officer
Write-Field 'offer id' $offerId
Write-Field 'offer status (before)' $before.Body.status
Write-Request "POST /credentials/$c2/revoke  { reason: issued_in_error }  (admin)"
$r = Invoke-Api POST "/credentials/$c2/revoke" -Token $admin -Body @{ reason = 'issued_in_error' }
Assert-Status $r 200 'revoke pending credential'
Write-Credential 'Credential:' $r.Body
$after = Invoke-Api GET "/credential-offers/$offerId" -Token $officer
Write-Host '  Offer after the revocation:' -ForegroundColor Yellow
Write-Field 'status' $after.Body.status
Write-Field 'credentialStatus' $after.Body.credentialStatus
Write-Field 'invalidatedAt' $after.Body.invalidatedAt
if ($after.Body.status -ne 'invalidated') { $script:Unexpected++; Write-Host '  [UNEXPECTED] offer not invalidated' -ForegroundColor Red }

# ---------------------------------------------------------------------------
Write-Section '3 DOUBLE REVOKE 409'
Write-Request "POST /credentials/$c1/revoke  { reason: employment_ended }  (admin, again)"
$r = Invoke-Api POST "/credentials/$c1/revoke" -Token $admin -Body @{ reason = 'employment_ended' }
Assert-Status $r 409 'revoke an already revoked credential'
Write-Error409 $r

# ---------------------------------------------------------------------------
Write-Section '4 OFFICER CANNOT REVOKE 403'
Write-Request "POST /credentials/$c3/revoke  { reason: employment_ended }  (officer)"
$r = Invoke-Api POST "/credentials/$c3/revoke" -Token $officer -Body @{ reason = 'employment_ended' }
Assert-Status $r 403 'officer revokes'
Write-Field 'error.code' (Get-ErrorCode $r)
Write-Field 'error.message' $r.Body.error.message
$still = Invoke-Api GET "/credentials/$c3" -Token $officer
Write-Field 'credential status after' $still.Body.status

# ---------------------------------------------------------------------------
Write-Section '5 REISSUE LINK'
Write-Request "POST /credentials/$c3/reissue  { reason: details_changed }  (officer)"
$r = Invoke-Api POST "/credentials/$c3/reissue" -Token $officer -Body @{ reason = 'details_changed' }
Assert-Status $r 201 'reissue valid credential'
$newId = $r.Body.credential.id
Write-Field 'replaces.id' $r.Body.replaces.id
Write-Field 'replaces.status' $r.Body.replaces.status
Write-Credential 'New credential (response.credential):' $r.Body.credential
$old = Invoke-Api GET "/credentials/$c3" -Token $officer
Write-Credential 'Old credential (GET /credentials/:id):' $old.Body

# ---------------------------------------------------------------------------
Write-Section '6 STATUS HISTORY'
foreach ($pair in @(@('old (reissued)', $c3), @('new (replacement)', $newId), @('revoked while pending', $c2))) {
  $events = Invoke-Api GET "/credentials/$($pair[1])/events" -Token $officer
  Assert-Status $events 200 "events of $($pair[0]) credential"
  Write-Host ("  GET /credentials/{0}/events" -f $pair[1]) -ForegroundColor Yellow
  $events.Body.events | ForEach-Object {
    [pscustomobject]@{
      createdAt = $_.createdAt
      from      = if ($null -eq $_.fromStatus) { '(created)' } else { $_.fromStatus }
      to        = $_.toStatus
      reason    = $_.reason
      by        = if ($_.staff) { $_.staff.id } else { '(wallet)' }
    }
  } | Format-Table -AutoSize | Out-String -Width 200 | Write-Host
}

# ---------------------------------------------------------------------------
Write-Section '7 REISSUE REVOKED 409'
Write-Request "POST /credentials/$c1/reissue  { reason: details_changed }  (officer)"
$r = Invoke-Api POST "/credentials/$c1/reissue" -Token $officer -Body @{ reason = 'details_changed' }
Assert-Status $r 409 'reissue a revoked credential'
Write-Error409 $r

# ---------------------------------------------------------------------------
Write-Host ''
if ($script:Unexpected -eq 0) {
  Write-Host '  All sections returned the expected responses.' -ForegroundColor Green
  exit 0
}
Write-Host "  $($script:Unexpected) unexpected response(s) - see [UNEXPECTED] lines above." -ForegroundColor Red
exit 1
