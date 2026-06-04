# Rewrites idlechip-agent history to remove Cursor co-author trailers, then force-pushes.
# See D:\lnctrl\idlechip\.agents\PUBLIC-AGENT-GIT.md
param(
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root
$filter = Join-Path $root "scripts/strip-cursor-msg-filter.py"

Write-Host "Current branch commits with Cursor co-author (if any):"
$matches = git log main --format=fuller | Select-String "Co-authored-by: Cursor" -Context 1,0
if ($matches) { $matches } else { Write-Host "(none on main)" }

if ($DryRun) {
  Write-Host "`nDry run only. Re-run without -DryRun to rewrite and push."
  exit 0
}

Write-Host "`nRewriting history (new commit SHAs)..."
$filter = (Resolve-Path $filter).Path -replace '\\', '/'
git filter-branch -f --msg-filter "python $filter" --tag-name-filter cat -- --all
if ($LASTEXITCODE -ne 0) { throw "filter-branch failed" }

Write-Host "`nVerify main is clean:"
$after = git log main --format=fuller | Select-String "Co-authored-by: Cursor"
if ($after) {
  $after
  throw "Cursor trailers still present on main"
}
Write-Host "(clean)"

Write-Host "`nForce-push main and tags..."
git push origin main --force
if ($LASTEXITCODE -ne 0) { throw "push main failed" }
git push origin --tags --force
if ($LASTEXITCODE -ne 0) { throw "push tags failed" }

Write-Host "Done. GitHub profile activity may take 24-48h to drop cursoragent."
