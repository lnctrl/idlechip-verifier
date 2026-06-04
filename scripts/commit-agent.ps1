# Public repo commits — no Cursor co-author trailers (see .agents policy in private idlechip repo).
param(
  [Parameter(Mandatory = $true)]
  [string]$Message
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

if (-not (git status --porcelain)) {
  Write-Host "Nothing to commit."
  exit 0
}

git add -A
# Disable prepare-commit-msg hook that injects Cursor co-author on this public repo.
git -c core.hooksPath=.git/no-hooks commit -m $Message
Write-Host "Committed (no Cursor co-author). Verify:"
git log -1 --format=full
