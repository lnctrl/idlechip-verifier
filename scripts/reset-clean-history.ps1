# Replaces main with a single-commit history (lnctrl only). Use when profile still credits cursoragent.
# Requires explicit approval before push — rewrites public main and tags.
param(
  [switch]$Push
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

$authorName = "lnctrl"
$authorEmail = "ctrlhash@gmail.com"

if (git log main --format=fuller | Select-String "Co-authored-by: Cursor") {
  Write-Host "Note: current main has Cursor trailers in some reachable commits."
}

Write-Host "Creating orphan branch with one commit..."
git checkout --orphan clean-main
git add -A
git -c user.name=$authorName -c user.email=$authorEmail commit -m @"
Public IdleChip GPU verifier (idlechip-agent).

Pair, scan, register, and sync local GPU stats to idlechip.com.
Includes commit hooks that block Cursor co-author trailers on this repo.
"@

git branch -M main

$tags = @(git tag -l "v*")
foreach ($tag in $tags) {
  git tag -f $tag
  Write-Host "Retagged $tag -> $(git rev-parse --short HEAD)"
}

Write-Host "`nHistory is now one commit:"
git log -1 --format=fuller

if (-not $Push) {
  Write-Host "`nDry run complete. Re-run with -Push to force-push origin main and tags."
  exit 0
}

git push origin main --force
git push origin --tags --force
Write-Host "Pushed. GitHub profile activity may take 24-48h to update."
