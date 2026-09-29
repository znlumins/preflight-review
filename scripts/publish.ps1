[CmdletBinding()]
param(
  # Jenis version bump: patch (1.0.2 -> 1.0.3), minor (-> 1.1.0), major (-> 2.0.0)
  [ValidateSet("patch", "minor", "major")]
  [string]$Bump = "patch"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$pkg = Get-Content "package.json" -Raw | ConvertFrom-Json
$oldVersion = $pkg.version

# 1. Bump version + tag (npm version bikin commit + tag otomatis)
Write-Host "`n[1/4] Bump version: $oldVersion -> ($Bump)" -ForegroundColor Cyan
npm version $Bump
if ($LASTEXITCODE -ne 0) { throw "npm version gagal" }

# 2. Push commit + tag ke GitHub
Write-Host "`n[2/4] Push commit + tag ke GitHub" -ForegroundColor Cyan
git push --follow-tags
if ($LASTEXITCODE -ne 0) { throw "git push gagal" }

$newVersion = (Get-Content "package.json" -Raw | ConvertFrom-Json).version
$tag = "v$newVersion"

# 3. Publish ke npmjs (butuh OTP/fingerprint kamu)
Write-Host "`n[3/4] Publish ke npmjs (npmjs.com) - OTP/fingerprint diperlukan" -ForegroundColor Cyan
npm publish
if ($LASTEXITCODE -ne 0) { throw "publish ke npmjs gagal" }

# 4. Publish versi scoped ke GitHub Packages (duplicate dengan nama @znlumins/...)
Write-Host "`n[4a/4] Publish ke GitHub Packages (@znlumins/$($pkg.name))" -ForegroundColor Cyan
$tmp = Join-Path $env:TEMP "gp-preflight-review"
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $tmp | Out-Null
Copy-Item "bin" "$tmp\bin" -Recurse -Force
Copy-Item "README.md", "README.id.md", "LICENSE" $tmp -Force
$gpPkg = Get-Content "package.json" -Raw | ConvertFrom-Json
$gpPkg.name = "@znlumins/$($gpPkg.name)"
$gpPkg | Add-Member -NotePropertyName publishConfig -NotePropertyValue @{ registry = "https://npm.pkg.github.com" } -Force
$gpPkg | ConvertTo-Json -Depth 10 | Set-Content "$tmp\package.json"
npm publish "$tmp"
$gpExit = $LASTEXITCODE
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
if ($gpExit -ne 0) { Write-Host "Warning: publish ke GitHub Packages gagal (lanjut ke release)" -ForegroundColor Yellow }

# 5. Bikin GitHub Release dari tag (ASCII-only biar tidak mojibake)
Write-Host "`n[4b/4] Membuat GitHub Release $tag" -ForegroundColor Cyan
$tags = git tag --sort=-v:refname
$prevTag = $tags | Where-Object { $_ -ne $tag } | Select-Object -First 1
$logArgs = @("log", "--no-merges", "--format=- %s")
if ($prevTag) { $logArgs += "$prevTag..$tag" } else { $logArgs += $tag }
$notes = (git @logArgs) -join "`n"
$releaseBody = "## What's new`n`n$notes`n`n**Full Changelog**: https://github.com/znlumins/preflight-review/commits/$tag"

$creds = "protocol=https`nhost=github.com`n`n" | git credential fill 2>&1
$tokenTry = $creds | Select-String -Pattern "^password=(.+)$"
if (-not $tokenTry) { throw "tidak bisa mengambil kredensial git" }
$token = $tokenTry.Matches.Groups[1].Value

$payload = @{ tag_name = $tag; name = "$tag"; body = $releaseBody; draft = $false; prerelease = $false } | ConvertTo-Json -Depth 5
try {
  $r = Invoke-RestMethod -Uri "https://api.github.com/repos/znlumins/preflight-review/releases" `
    -Method Post -Headers @{ Authorization = "Bearer $token"; Accept = "application/vnd.github+json" } `
    -ContentType "application/json" -Body $payload
  Write-Host "Release dibuat: $($r.html_url)" -ForegroundColor Green
} catch {
  Write-Host "Warning: release API gagal: $($_.Exception.Message)" -ForegroundColor Yellow
}
Remove-Variable token, creds -ErrorAction SilentlyContinue

Write-Host "`n=== SELESAI: $pkg.name v$newVersion ===" -ForegroundColor Green
Write-Host "npmjs           : https://www.npmjs.com/package/preflight-review"
Write-Host "GitHub Packages : https://github.com/znlumins/preflight-review/pkgs/npm/preflight-review"
